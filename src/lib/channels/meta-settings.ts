import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

export type MetaProduct = "ig" | "fb";

export interface MetaCredentials {
  appId: string;
  appSecret: string;
  verifyToken: string;
}

/**
 * Fetch + decrypt the Meta app credentials for a specific org and product.
 * `product = "ig"` returns Instagram Business Login credentials.
 * `product = "fb"` returns Facebook/Messenger/WhatsApp credentials.
 *
 * Falls back to the legacy `app_id`/`app_secret_ciphertext` columns when the
 * product-specific ones aren't set, so rows migrated from the old single-
 * credential schema still work.
 */
export async function getMetaCredentials(
  orgId: string,
  product: MetaProduct = "fb",
): Promise<MetaCredentials | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("meta_settings")
    .select(
      "app_id, app_secret_ciphertext, ig_app_id, ig_app_secret_ciphertext, fb_app_id, fb_app_secret_ciphertext, webhook_verify_token",
    )
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data || !data.webhook_verify_token) return null;

  let id: string | null;
  let cipher: string | null;

  if (product === "ig") {
    id = (data.ig_app_id as string | null) ?? (data.app_id as string | null);
    cipher =
      (data.ig_app_secret_ciphertext as string | null) ??
      (data.app_secret_ciphertext as string | null);
  } else {
    id = (data.fb_app_id as string | null) ?? (data.app_id as string | null);
    cipher =
      (data.fb_app_secret_ciphertext as string | null) ??
      (data.app_secret_ciphertext as string | null);
  }

  if (!id || !cipher) return null;
  return {
    appId: id,
    appSecret: decryptSecret(pgByteaToBuffer(cipher)),
    verifyToken: data.webhook_verify_token as string,
  };
}

/**
 * Find the app secret for a given org, trying both products.
 * Used by webhook signature verification when we don't know which product
 * signed the payload (WhatsApp → fb, IG → ig, Messenger → fb).
 */
export async function getAppSecretForProduct(
  orgId: string,
  product: MetaProduct,
): Promise<string | null> {
  const creds = await getMetaCredentials(orgId, product);
  return creds?.appSecret ?? null;
}

export async function findOrgByChannelExternalId(externalId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("channels")
    .select("org_id")
    .eq("external_id", externalId)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

export async function findOrgByVerifyToken(token: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("meta_settings")
    .select("org_id")
    .eq("webhook_verify_token", token)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}
