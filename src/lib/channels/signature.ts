import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Meta webhook signature (sha256=<hex>) using the given app secret.
 * Returns true if the HMAC matches, false otherwise.
 */
export function verifyMetaSignatureWithSecret(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const theirs = signatureHeader.slice("sha256=".length);
  const ours = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (theirs.length !== ours.length) return false;
  try {
    return timingSafeEqual(Buffer.from(theirs, "hex"), Buffer.from(ours, "hex"));
  } catch {
    return false;
  }
}

/** Legacy helper — falls back to the global META_APP_SECRET env var. */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  return verifyMetaSignatureWithSecret(rawBody, signatureHeader, appSecret);
}
