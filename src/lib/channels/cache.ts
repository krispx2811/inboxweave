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
