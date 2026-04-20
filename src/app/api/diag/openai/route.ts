import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

export const runtime = "nodejs";

/**
 * Diagnostic endpoint: tests the OpenAI key flow end-to-end.
 * Returns redacted info about what the server is seeing.
 *
 * Auth: any signed-in user. Doesn't leak the actual key.
 */
export async function GET() {
  await requireUser();

  const result: Record<string, unknown> = {};

  // 1. Check env var presence
  const secretsKey = process.env.SECRETS_ENCRYPTION_KEY;
  result.env_SECRETS_ENCRYPTION_KEY = secretsKey
    ? {
        present: true,
        length: secretsKey.length,
        prefix: secretsKey.slice(0, 8) + "...",
        isValidHex: /^[0-9a-fA-F]+$/.test(secretsKey),
        is32Bytes: secretsKey.length === 64,
      }
    : { present: false };

  result.env_NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  result.env_SUPABASE_URL = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  result.env_SUPABASE_SERVICE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 2. Read the org_secrets row
  try {
    const admin = createSupabaseAdminClient();
    const { data: orgs } = await admin.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    if (!orgId) {
      result.error = "no org found";
      return NextResponse.json(result);
    }

    const { data: secret } = await admin
      .from("org_secrets")
      .select("openai_api_key_ciphertext, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!secret?.openai_api_key_ciphertext) {
      result.openai_key = { stored: false };
      return NextResponse.json(result);
    }

    result.openai_key_stored_at = secret.updated_at;

    // 3. Decrypt
    let decrypted: string | null = null;
    try {
      decrypted = decryptSecret(
        pgByteaToBuffer(secret.openai_api_key_ciphertext as unknown as string),
      );
      result.decrypt = {
        ok: true,
        length: decrypted.length,
        prefix: decrypted.slice(0, 10),
        looksLikeKey: decrypted.startsWith("sk-"),
        hasWhitespace: /\s/.test(decrypted),
        firstCharCode: decrypted.charCodeAt(0),
        lastCharCode: decrypted.charCodeAt(decrypted.length - 1),
      };
    } catch (err) {
      result.decrypt = { ok: false, error: (err as Error).message };
      return NextResponse.json(result);
    }

    // 4. Raw OpenAI call (no SDK, direct fetch)
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decrypted}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const openaiText = await openaiRes.text();
    result.openai_direct = {
      status: openaiRes.status,
      bodyPreview: openaiText.slice(0, 300),
    };

    // 5. Also try with SDK
    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: decrypted });
      const sdkRes = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      });
      result.openai_sdk = { ok: true, id: sdkRes.id };
    } catch (err) {
      result.openai_sdk = { ok: false, error: (err as Error).message };
    }
  } catch (err) {
    result.error = (err as Error).message;
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
