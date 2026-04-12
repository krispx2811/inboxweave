"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const PromptSchema = z.object({
  orgId: z.string().uuid(),
  system_prompt: z.string().min(1).max(8000),
  model: z.string().min(1).max(50).default("gpt-4o-mini"),
  temperature: z.coerce.number().min(0).max(2),
});

export async function updateAiSettings(formData: FormData) {
  const parsed = PromptSchema.parse({
    orgId: formData.get("orgId"),
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model") ?? "gpt-4o-mini",
    temperature: formData.get("temperature"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update AI settings");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("ai_settings").upsert({
    org_id: parsed.orgId,
    system_prompt: parsed.system_prompt,
    model: parsed.model,
    temperature: parsed.temperature,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/settings`);
}

const KeySchema = z.object({
  orgId: z.string().uuid(),
  apiKey: z.string().min(20).max(200),
});

export async function updateOpenAIKey(formData: FormData) {
  const parsed = KeySchema.parse({
    orgId: formData.get("orgId"),
    apiKey: formData.get("apiKey"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update the API key");

  const ciphertext = encryptSecret(parsed.apiKey);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("org_secrets").upsert({
    org_id: parsed.orgId,
    openai_api_key_ciphertext: bufferToPgBytea(ciphertext),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "openai_key_updated",
    payload: {},
  });
  revalidatePath(`/app/${parsed.orgId}/settings`);
}
