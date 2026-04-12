import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for per-org secrets (OpenAI API keys, Meta page access
 * tokens). The master key lives in SECRETS_ENCRYPTION_KEY (32 bytes, hex).
 * Ciphertext layout: [12-byte IV || 16-byte auth tag || ciphertext].
 * We store the whole bundle as a Postgres `bytea`.
 *
 * Why not pgsodium/Vault? It is being deprecated on Supabase Cloud; doing
 * encryption in Node keeps the app portable across hosting and means the
 * master key is never in the database.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const hex = process.env.SECRETS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is required (32-byte hex). Generate with: openssl rand -hex 32",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
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
    throw new Error("Ciphertext too short");
  }
  const iv = bundle.subarray(0, IV_LEN);
  const tag = bundle.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = bundle.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Supabase returns `bytea` values over PostgREST as hex-prefixed strings
 * (`\x0102...`). Normalise both directions here.
 */
export function bufferToPgBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

export function pgByteaToBuffer(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  // Fallback: base64-ish — try hex then base64.
  if (/^[0-9a-f]+$/i.test(value)) return Buffer.from(value, "hex");
  return Buffer.from(value, "base64");
}
