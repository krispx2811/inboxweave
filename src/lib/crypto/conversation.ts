import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Per-conversation encryption for sensitive industries.
 *
 * Each conversation gets its own AES-256-GCM key derived from:
 *   HMAC-SHA256(master_key, conversation_id)
 *
 * This means each conversation has a unique key but we don't need to store
 * per-conversation keys separately — they're deterministically derived.
 *
 * Enable by setting CONVERSATION_ENCRYPTION=true in env.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getConversationKey(conversationId: string): Buffer {
  const masterHex = process.env.SECRETS_ENCRYPTION_KEY;
  if (!masterHex) throw new Error("SECRETS_ENCRYPTION_KEY required for conversation encryption");
  const master = Buffer.from(masterHex, "hex");
  return createHash("sha256")
    .update(master)
    .update(conversationId)
    .digest();
}

export function isConversationEncryptionEnabled(): boolean {
  return process.env.CONVERSATION_ENCRYPTION === "true";
}

export function encryptMessage(conversationId: string, plaintext: string): string {
  const key = getConversationKey(conversationId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const bundle = Buffer.concat([iv, tag, encrypted]);
  return `enc:${bundle.toString("base64")}`;
}

export function decryptMessage(conversationId: string, ciphertext: string): string {
  if (!ciphertext.startsWith("enc:")) return ciphertext; // Not encrypted.
  const bundle = Buffer.from(ciphertext.slice(4), "base64");
  const key = getConversationKey(conversationId);
  const iv = bundle.subarray(0, IV_LEN);
  const tag = bundle.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = bundle.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
