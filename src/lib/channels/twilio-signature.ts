import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request validation (X-Twilio-Signature), per
 * https://www.twilio.com/docs/usage/security#validating-requests
 *
 *   base64(HMAC-SHA1(authToken, fullUrl + name1 + value1 + name2 + value2 ...))
 *
 * where POST params are sorted by name. Pure — no I/O — so it can be tested
 * directly.
 */
export function computeTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Iterable<[string, string]>,
): string {
  const sorted = [...params].sort(([ak, av], [bk, bv]) =>
    ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0,
  );
  let data = fullUrl;
  for (const [k, v] of sorted) data += k + v;
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** Constant-time check of a received X-Twilio-Signature header. */
export function verifyTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Iterable<[string, string]>,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !authToken) return false;
  const ours = Buffer.from(computeTwilioSignature(authToken, fullUrl, params), "utf8");
  const theirs = Buffer.from(signatureHeader, "utf8");
  if (ours.length !== theirs.length) return false;
  return timingSafeEqual(ours, theirs);
}
