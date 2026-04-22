import "server-only";

/**
 * Short-lived in-memory cache for channel rows, keyed by (platform, external_id).
 * Lives for the lifetime of the serverless function instance. On cache hit,
 * the typing indicator can fire without any DB round-trip — the customer sees
 * the bubble at the speed of Meta's Graph API only.
 *
 * TTL is intentionally short (60s) so reconnects / token changes propagate
 * quickly across other instances. Misses fall back to the DB and repopulate.
 */
export interface CachedChannel {
  id: string;
  org_id: string;
  platform: string;
  status: string;
  access_token_ciphertext: string;
}

interface Entry {
  row: CachedChannel;
  expires: number;
}

const TTL_MS = 60_000;
const store = new Map<string, Entry>();

function key(platform: string, externalId: string): string {
  return `${platform}:${externalId}`;
}

export function getCachedChannel(platform: string, externalId: string): CachedChannel | null {
  const entry = store.get(key(platform, externalId));
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    store.delete(key(platform, externalId));
    return null;
  }
  return entry.row;
}

export function setCachedChannel(platform: string, externalId: string, row: CachedChannel): void {
  store.set(key(platform, externalId), { row, expires: Date.now() + TTL_MS });
}

export function invalidateCachedChannel(platform: string, externalId: string): void {
  store.delete(key(platform, externalId));
}

// ─────────────────────────────────────────────────────────────────
// Decrypted access token cache. AES-GCM decryption is not expensive
// per call, but doing it on every webhook, every typing indicator,
// and every sendOutbound adds up. Cache by channel.id for 60s.
// ─────────────────────────────────────────────────────────────────

const tokenStore = new Map<string, { token: string; expires: number }>();

export function getCachedDecryptedToken(channelId: string): string | null {
  const entry = tokenStore.get(channelId);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    tokenStore.delete(channelId);
    return null;
  }
  return entry.token;
}

export function setCachedDecryptedToken(channelId: string, token: string): void {
  tokenStore.set(channelId, { token, expires: Date.now() + TTL_MS });
}

export function invalidateCachedDecryptedToken(channelId: string): void {
  tokenStore.delete(channelId);
}
