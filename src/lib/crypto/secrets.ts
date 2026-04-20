import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for per-org secrets. Master key from
 * SECRETS_ENCRYPTION_KEY (32 bytes, hex). Ciphertext layout:
 *   [12-byte IV || 16-byte auth tag || ciphertext]
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SECRETS_ENCRYPTION_KEY is required (32-byte hex).");
  }
  // Trim whitespace/quotes — Netlify UI sometimes stores with surrounding junk.
  const hex = raw.trim().replace(/^["']|["']$/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`SECRETS_ENCRYPTION_KEY must be 64 hex chars. Got length=${hex.length}`);
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): Buffer {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptSecret(bundle: Buffer): string {
  const key = getMasterKey();
  if (bundle.length <= IV_LEN + TAG_LEN) {
    throw new Error(`Ciphertext too short: ${bundle.length} bytes`);
  }
  const iv = bundle.subarray(0, IV_LEN);
  const tag = bundle.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = bundle.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

export function bufferToPgBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/**
 * PostgREST returns bytea values in different shapes depending on version:
 * - `\x<hex>` (most common)
 * - base64 (sometimes after certain Accept header negotiations)
 * - already a Buffer/Uint8Array (when supabase-js returns it natively)
 *
 * Detect carefully — hex-only detection is ambiguous with some base64
 * strings, so we additionally check that hex decode yields the right length.
 */
export function pgByteaToBuffer(value: string | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value !== "string") {
    throw new Error(`pgByteaToBuffer: unexpected type ${typeof value}`);
  }
  // Standard Postgres hex format: \x...
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  // Plain hex (no prefix) — must be even length and only hex chars.
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, "hex");
  }
  // Fallback to base64.
  return Buffer.from(value, "base64");
}
