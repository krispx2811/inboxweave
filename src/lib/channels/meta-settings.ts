import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

export interface MetaCredentials {
  appId: string;
  appSecret: string;
  verifyToken: string;
}

/** Fetch + decrypt the Meta app credentials for a specific org. */
export async function getMetaCredentials(orgId: string): Promise<MetaCredentials | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("meta_settings")
    .select("app_id, app_secret_ciphertext, webhook_verify_token")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data?.app_id || !data.app_secret_ciphertext || !data.webhook_verify_token) return null;
  return {
    appId: data.app_id as string,
    appSecret: decryptSecret(pgByteaToBuffer(data.app_secret_ciphertext as unknown as string)),
    verifyToken: data.webhook_verify_token as string,
  };
}

/**
 * Look up the org that owns a given channel by its external_id
 * (phone_number_id for WA, page_id for FB/IG).
 */
export async function findOrgByChannelExternalId(
  externalId: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("channels")
    .select("org_id")
    .eq("external_id", externalId)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

/** Find a verify token belonging to any org. Used during webhook GET handshake. */
export async function findOrgByVerifyToken(token: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("meta_settings")
    .select("org_id")
    .eq("webhook_verify_token", token)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}
