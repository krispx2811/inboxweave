"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const IgSchema = z.object({
  orgId: z.string().uuid(),
  igAppId: z.string().min(5).max(50),
  igAppSecret: z.string().min(10).max(200),
  verifyToken: z.string().min(5).max(200).optional(),
});

export async function saveInstagramCreds(formData: FormData) {
  const parsed = IgSchema.parse({
    orgId: formData.get("orgId"),
    igAppId: formData.get("igAppId"),
    igAppSecret: formData.get("igAppSecret"),
    verifyToken: (formData.get("verifyToken") as string) || undefined,
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update Meta app settings");

  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(parsed.igAppSecret));
  const update: Record<string, unknown> = {
    org_id: parsed.orgId,
    ig_app_id: parsed.igAppId,
    ig_app_secret_ciphertext: encrypted,
    updated_at: new Date().toISOString(),
  };
  if (parsed.verifyToken) update.webhook_verify_token = parsed.verifyToken;

  const { error } = await admin.from("meta_settings").upsert(update);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/settings/meta`);
}

const FbSchema = z.object({
  orgId: z.string().uuid(),
  fbAppId: z.string().min(5).max(50),
  fbAppSecret: z.string().min(10).max(200),
  verifyToken: z.string().min(5).max(200).optional(),
});

export async function saveFacebookCreds(formData: FormData) {
  const parsed = FbSchema.parse({
    orgId: formData.get("orgId"),
    fbAppId: formData.get("fbAppId"),
    fbAppSecret: formData.get("fbAppSecret"),
    verifyToken: (formData.get("verifyToken") as string) || undefined,
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update Meta app settings");

  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(parsed.fbAppSecret));
  const update: Record<string, unknown> = {
    org_id: parsed.orgId,
    fb_app_id: parsed.fbAppId,
    fb_app_secret_ciphertext: encrypted,
    updated_at: new Date().toISOString(),
  };
  if (parsed.verifyToken) update.webhook_verify_token = parsed.verifyToken;

  const { error } = await admin.from("meta_settings").upsert(update);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/settings/meta`);
}

const TokenSchema = z.object({
  orgId: z.string().uuid(),
  verifyToken: z.string().min(5).max(200),
});

export async function saveVerifyToken(formData: FormData) {
  const parsed = TokenSchema.parse({
    orgId: formData.get("orgId"),
    verifyToken: formData.get("verifyToken"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can update the verify token");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("meta_settings").upsert({
    org_id: parsed.orgId,
    webhook_verify_token: parsed.verifyToken,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/settings/meta`);
}
