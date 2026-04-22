import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  bufferToPgBytea,
  encryptSecret,
  decryptSecret,
  pgByteaToBuffer,
} from "@/lib/crypto/secrets";
import { markChannelUnhealthy } from "./health";
import { invalidateCachedDecryptedToken, setCachedDecryptedToken } from "./cache";

const REFRESH_INTERVAL_DAYS = 30;

/**
 * Lazily refresh an Instagram Business Login token when it's been more than
 * REFRESH_INTERVAL_DAYS since its last rotation. Meta IG tokens expire
 * after 60 days, and calling the refresh endpoint any time within that
 * window resets the 60-day clock. This runs non-blocking from hot paths
 * (webhook handlers), so even accounts with no cron stay fresh as long as
 * they receive regular messages.
 */
export async function refreshIgTokenIfStale(params: {
  channelId: string;
  orgId: string;
  token: string;
  refreshedAt: string | null;
}): Promise<void> {
  if (!params.token.startsWith("IGA")) return; // Only Business Login tokens.
  if (params.refreshedAt) {
    const age = Date.now() - new Date(params.refreshedAt).getTime();
    if (age < REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000) return;
  }

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", params.token);

  try {
    const res = await fetch(url.toString());
    const text = await res.text();
    if (!res.ok) {
      invalidateCachedDecryptedToken(params.channelId);
      await markChannelUnhealthy({
        channelId: params.channelId,
        orgId: params.orgId,
        platform: "instagram",
        error: `Token refresh failed: ${text.slice(0, 200)}`,
      }).catch(() => {});
      return;
    }
    const json = JSON.parse(text) as { access_token?: string };
    if (!json.access_token) return;

    const admin = createSupabaseAdminClient();
    const cipher = encryptSecret(json.access_token);
    await admin
      .from("channels")
      .update({
        access_token_ciphertext: bufferToPgBytea(cipher),
        token_refreshed_at: new Date().toISOString(),
      })
      .eq("id", params.channelId);

    // Prime the decryption cache with the new token.
    setCachedDecryptedToken(params.channelId, json.access_token);
  } catch (err) {
    console.error("[ig-token-refresh] failed", err);
  }
}

/**
 * Convenience wrapper that loads the token from DB/cache and calls the
 * staleness check. Used from IG webhook handler.
 */
export async function maybeRefreshIgChannelToken(channelId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: ch } = await admin
    .from("channels")
    .select("id, org_id, platform, access_token_ciphertext, token_refreshed_at, status")
    .eq("id", channelId)
    .maybeSingle();
  if (!ch || ch.platform !== "instagram" || ch.status !== "active") return;
  try {
    const token = decryptSecret(
      pgByteaToBuffer(ch.access_token_ciphertext as unknown as string),
    );
    await refreshIgTokenIfStale({
      channelId: ch.id as string,
      orgId: ch.org_id as string,
      token,
      refreshedAt: ch.token_refreshed_at as string | null,
    });
  } catch {}
}
