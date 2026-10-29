import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth `state` parameter: base64url(json) + "." + base64url(HMAC-SHA256).
 * Keyed with SECRETS_ENCRYPTION_KEY so a state can't be forged or altered
 * (CSRF / org-swap). Carries an issued-at timestamp; states older than
 * STATE_MAX_AGE_MS are rejected.
 */

export const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export interface OAuthState {
  orgId: string;
  /** Supabase user id of the user who started the flow. */
  uid: string;
  /** Issued-at, ms since epoch. */
  iat: number;
  flow?: "ig" | "fb" | "wa";
}

function getKey(): string {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY is required to sign OAuth state.");
  return raw.trim().replace(/^["']|["']$/g, "");
}

function mac(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update(payload, "utf8").digest();
}

export function signState(obj: Omit<OAuthState, "iat"> & { iat?: number }): string {
  const payload = Buffer.from(
    JSON.stringify({ ...obj, iat: obj.iat ?? Date.now() }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${mac(payload, getKey()).toString("base64url")}`;
}

/**
 * Returns the decoded state if the signature is valid and it isn't expired,
 * otherwise null. Callers must still check `uid` against the session user.
 */
export function verifyState(str: string): OAuthState | null {
  const dot = str.indexOf(".");
  if (dot <= 0) return null;
  const payload = str.slice(0, dot);
  const sig = Buffer.from(str.slice(dot + 1), "base64url");
  let key: string;
  try {
    key = getKey();
  } catch {
    return null;
  }
  const expected = mac(payload, key);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

  let decoded: Partial<OAuthState>;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthState>;
  } catch {
    return null;
  }
  if (typeof decoded.orgId !== "string" || typeof decoded.uid !== "string" || typeof decoded.iat !== "number") {
    return null;
  }
  const age = Date.now() - decoded.iat;
  // Small allowance for clock skew between instances.
  if (age < -60_000 || age > STATE_MAX_AGE_MS) return null;
  return decoded as OAuthState;
}
