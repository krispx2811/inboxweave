import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta (WhatsApp, Facebook, Instagram) signs webhook payloads with
 * `X-Hub-Signature-256: sha256=<hex>` using the app secret. We verify the
 * HMAC in constant time over the RAW request body.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
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
