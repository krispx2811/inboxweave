import { NextResponse, type NextRequest } from "next/server";
import { parseTwilioWebhook } from "@/lib/channels/sms";
import { handleInbound } from "@/lib/channels/inbound";
import { verifyTwilioSignature } from "@/lib/channels/twilio-signature";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

export const runtime = "nodejs";

/**
 * Twilio webhook for inbound SMS.
 * Configure in Twilio Console → Phone Number → Messaging → Webhook URL:
 *   POST https://<host>/api/webhooks/sms
 * The URL must match NEXT_PUBLIC_APP_URL exactly, since it's part of the
 * signed X-Twilio-Signature payload.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const msg = parseTwilioWebhook(params);
  if (!msg) return new NextResponse("bad request", { status: 400 });

  // Resolve the org that owns the receiving number, then verify the request
  // was signed with that org's Twilio auth token.
  const authToken = await findAuthTokenForNumber(msg.to);
  if (!authToken) return new NextResponse("forbidden", { status: 403 });

  // Twilio signs the public URL it called; behind Netlify req.url may differ,
  // so rebuild it from NEXT_PUBLIC_APP_URL plus the path and query.
  const reqUrl = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? reqUrl.origin).replace(/\/+$/u, "");
  const fullUrl = `${base}${reqUrl.pathname}${reqUrl.search}`;
  const sig = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(authToken, fullUrl, params.entries(), sig)) {
    console.warn(`[sms webhook] invalid Twilio signature for To=${msg.to}`);
    return new NextResponse("forbidden", { status: 403 });
  }

  await handleInbound({
    platform: "sms",
    channelExternalId: msg.to, // The Twilio phone number is the channel external_id.
    contactExternalId: msg.from,
    text: msg.body,
    platformMessageId: msg.messageSid,
  }).catch((err) => console.error("[sms webhook] handleInbound failed", err));

  // Twilio expects TwiML response.
  return new NextResponse("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}

async function findAuthTokenForNumber(phoneNumber: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: channel } = await admin
      .from("channels")
      .select("org_id")
      .eq("platform", "sms")
      .eq("external_id", phoneNumber)
      .maybeSingle();
    if (!channel?.org_id) return null;

    const { data: settings } = await admin
      .from("sms_settings")
      .select("twilio_auth_token_ciphertext")
      .eq("org_id", channel.org_id as string)
      .maybeSingle();
    if (!settings?.twilio_auth_token_ciphertext) return null;
    return decryptSecret(pgByteaToBuffer(settings.twilio_auth_token_ciphertext as unknown as string));
  } catch (err) {
    console.error("[sms webhook] auth token lookup failed", err);
    return null;
  }
}
