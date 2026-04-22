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

  // Validate the key with a tiny live call BEFORE persisting. Avoids the
  // "pasted a typo, nothing works, confused" scenario.
  try {
    const probe = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${parsed.apiKey}` },
    });
    if (!probe.ok) {
      const text = await probe.text();
      throw new Error(
        `OpenAI rejected this key (${probe.status}). Double-check you copied it fully. Details: ${text.slice(0, 160)}`,
      );
    }
  } catch (err) {
    throw new Error(
      `OpenAI key validation failed: ${(err as Error).message}`,
    );
  }

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

const AdminKeySchema = z.object({
  orgId: z.string().uuid(),
  adminKey: z.string().min(20).max(200),
});

/**
 * Store an OpenAI Admin API key for this org so the Usage page can fetch
 * authoritative billing from OpenAI directly. Validated against
 * GET /v1/organization/costs before persisting — a bad key or one
 * without admin scope fails immediately.
 */
export async function updateOpenAIAdminKey(formData: FormData) {
  const parsed = AdminKeySchema.parse({
    orgId: formData.get("orgId"),
    adminKey: formData.get("adminKey"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update the admin key");

  if (!parsed.adminKey.startsWith("sk-admin-")) {
    throw new Error(
      "This doesn't look like an OpenAI Admin key. Admin keys start with 'sk-admin-'. Create one at https://platform.openai.com/settings/organization/admin-keys",
    );
  }

  // Probe: a cheap call to the costs endpoint with a 1-day window.
  const now = Math.floor(Date.now() / 1000);
  const probeUrl =
    `https://api.openai.com/v1/organization/costs?start_time=${now - 86400}&end_time=${now}&limit=1`;
  const probe = await fetch(probeUrl, {
    headers: { Authorization: `Bearer ${parsed.adminKey}` },
  });
  if (!probe.ok) {
    const text = await probe.text();
    throw new Error(
      `OpenAI rejected this admin key (${probe.status}). Details: ${text.slice(0, 200)}`,
    );
  }

  const ciphertext = encryptSecret(parsed.adminKey);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("org_secrets").upsert({
    org_id: parsed.orgId,
    openai_admin_key_ciphertext: bufferToPgBytea(ciphertext),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "openai_admin_key_updated",
    payload: {},
  });
  revalidatePath(`/app/${parsed.orgId}/settings`);
  revalidatePath(`/app/${parsed.orgId}/usage`);
}

const RemoveAdminKeySchema = z.object({
  orgId: z.string().uuid(),
});

export async function removeOpenAIAdminKey(formData: FormData) {
  const parsed = RemoveAdminKeySchema.parse({ orgId: formData.get("orgId") });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can remove the admin key");

  const admin = createSupabaseAdminClient();
  await admin
    .from("org_secrets")
    .update({ openai_admin_key_ciphertext: null, updated_at: new Date().toISOString() })
    .eq("org_id", parsed.orgId);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "openai_admin_key_removed",
    payload: {},
  });
  revalidatePath(`/app/${parsed.orgId}/settings`);
  revalidatePath(`/app/${parsed.orgId}/usage`);
}
