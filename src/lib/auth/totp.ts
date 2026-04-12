import "server-only";
import { createHmac } from "node:crypto";

/**
 * Minimal TOTP implementation (RFC 6238) without external dependencies.
 * Compatible with Google Authenticator / Authy / 1Password.
 */

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/[= ]/g, "").toUpperCase();
  let bits = "";
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val === -1) throw new Error("Invalid base32 character");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

export function generateTotpSecret(): string {
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  return base32Encode(randomBytes(20));
}

export function getTotpUri(params: { secret: string; email: string; issuer?: string }): string {
  const issuer = params.issuer ?? "InboxWeave";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(params.email)}?secret=${params.secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

function generateTotp(secret: string, counter: bigint): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotp(secret: string, token: string, windowSize = 1): boolean {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  for (let i = -windowSize; i <= windowSize; i++) {
    if (generateTotp(secret, counter + BigInt(i)) === token) return true;
  }
  return false;
}
