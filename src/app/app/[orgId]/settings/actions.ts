"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { forgetOpenAIKey } from "@/lib/ai/openai";
import { parsePersonaForm } from "@/lib/ai/persona";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

// The Settings page has no error screen, so a thrown error shows as a crash.
// Persona saves report back through the URL instead.
function backToSettings(orgId: string, params: Record<string, string>): never {
  redirect(`/app/${orgId}/settings?${new URLSearchParams(params).toString()}`);
}

export async function updateAiSettings(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const ctx = await requireOrgMember(orgId);
  if (ctx.role !== "owner") {
    backToSettings(orgId, {
      persona_error: "Only owners can change the persona. Ask an owner of this organization to save it.",
    });
  }

  const parsed = parsePersonaForm({
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model"),
    temperature: formData.get("temperature"),
  });
  if (!parsed.ok) backToSettings(orgId, { persona_error: parsed.error });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("ai_settings").upsert({
    org_id: orgId,
    system_prompt: parsed.data.system_prompt,
    model: parsed.data.model,
    temperature: parsed.data.temperature,
    updated_at: new Date().toISOString(),
  });
  if (error) backToSettings(orgId, { persona_error: `Couldn't save the persona: ${error.message}` });
  revalidatePath(`/app/${orgId}/settings`);
  backToSettings(orgId, { persona: "saved" });
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
  // Stop this instance using the old key straight away (others expire in 60s).
  forgetOpenAIKey(parsed.orgId);

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
