"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const Schema = z.object({
  orgId: z.string().uuid(),
  appId: z.string().min(5).max(50),
  appSecret: z.string().min(10).max(200),
  verifyToken: z.string().min(5).max(200),
});

export async function saveMetaSettings(formData: FormData) {
  const parsed = Schema.parse({
    orgId: formData.get("orgId"),
    appId: formData.get("appId"),
    appSecret: formData.get("appSecret"),
    verifyToken: formData.get("verifyToken"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update Meta app settings");

  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(parsed.appSecret));
  const { error } = await admin.from("meta_settings").upsert({
    org_id: parsed.orgId,
    app_id: parsed.appId,
    app_secret_ciphertext: encrypted,
    webhook_verify_token: parsed.verifyToken,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "meta_settings_updated",
    payload: { app_id: parsed.appId },
  });

  revalidatePath(`/app/${parsed.orgId}/settings/meta`);
  revalidatePath(`/app/${parsed.orgId}/channels`);
}
