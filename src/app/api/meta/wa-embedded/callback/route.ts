import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";
import { getMetaCredentials } from "@/lib/channels/meta-settings";
import { requireOrgMember } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  orgId: z.string().uuid(),
  code: z.string().min(8),
});

/**
 * Finalize Meta WhatsApp Embedded Signup.
 *
 * The browser-side <WhatsAppEmbeddedSignup> component completes the
 * Embedded Signup popup and POSTs us:
 *   { orgId, code }
 *
 * We:
 *   1. Look up this org's Meta App credentials (FB app id + secret).
 *   2. Exchange the code for a system-user access token (Embedded Signup
 *      issues a long-lived token tied to the Meta App's system user).
 *   3. List the WABAs that signup gave us access to.
 *   4. For each phone number on those WABAs, upsert a channels row.
 *   5. Subscribe each WABA to the WhatsApp webhook so messages flow.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const parsed = Schema.parse(body);
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") {
    return new NextResponse("only owners can connect channels", { status: 403 });
  }

  const creds = await getMetaCredentials(parsed.orgId, "fb");
  if (!creds) {
    return new NextResponse(
      "Meta App credentials not configured for this org. Set them in Settings → Meta first.",
      { status: 400 },
    );
  }

  // 1. Exchange code → access token.
  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", creds.appId);
  tokenUrl.searchParams.set("client_secret", creds.appSecret);
  tokenUrl.searchParams.set("code", parsed.code);
  // Embedded Signup uses an empty redirect_uri.
  tokenUrl.searchParams.set("redirect_uri", "");

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenBody = await tokenRes.text();
  if (!tokenRes.ok) {
    return new NextResponse(`Token exchange failed (${tokenRes.status}): ${tokenBody.slice(0, 220)}`, { status: 400 });
  }
  const tokenJson = JSON.parse(tokenBody) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return new NextResponse("Meta did not return an access_token", { status: 400 });
  }

  // 2. List WABAs the signup granted access to.
  const wabasRes = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const wabasBody = (await wabasRes.json()) as {
    data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> };
  };
  const wabaIds: string[] = [];
  for (const gs of wabasBody.data?.granular_scopes ?? []) {
    if (gs.scope === "whatsapp_business_messaging" || gs.scope === "whatsapp_business_management") {
      for (const id of gs.target_ids ?? []) wabaIds.push(id);
    }
  }
  const uniqueWabas = Array.from(new Set(wabaIds));

  if (uniqueWabas.length === 0) {
    return new NextResponse(
      "Embedded Signup completed but didn't grant access to any WhatsApp Business Accounts. Try again and make sure to select your business + phone number.",
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const created: Array<{ phone_number_id: string; display_phone_number: string }> = [];

  // 3. For each WABA, list phone numbers and create channels.
  for (const wabaId of uniqueWabas) {
    const phonesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!phonesRes.ok) continue;
    const phonesJson = (await phonesRes.json()) as {
      data?: Array<{ id: string; display_phone_number: string; verified_name: string }>;
    };

    // Subscribe this WABA to our webhook (idempotent on Meta's side).
    await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST" },
    ).catch(() => {});

    for (const phone of phonesJson.data ?? []) {
      const cipher = bufferToPgBytea(encryptSecret(accessToken));
      await admin
        .from("channels")
        .upsert(
          {
            org_id: parsed.orgId,
            platform: "whatsapp",
            external_id: phone.id,
            display_name: phone.verified_name || phone.display_phone_number,
            access_token_ciphertext: cipher,
            status: "active",
          },
          { onConflict: "external_id" },
        );
      created.push({
        phone_number_id: phone.id,
        display_phone_number: phone.display_phone_number,
      });
    }
  }

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "channel_connected",
    payload: {
      platform: "whatsapp",
      method: "embedded_signup",
      wabas: uniqueWabas,
      phones: created.map((p) => p.phone_number_id),
    },
  });

  return NextResponse.json({ ok: true, connected: created });
}
