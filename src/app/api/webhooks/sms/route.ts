import { NextResponse, type NextRequest } from "next/server";
import { parseTwilioWebhook } from "@/lib/channels/sms";
import { handleInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";

/**
 * Twilio webhook for inbound SMS.
 * Configure in Twilio Console → Phone Number → Messaging → Webhook URL:
 *   POST https://<host>/api/webhooks/sms
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const msg = parseTwilioWebhook(params);
  if (!msg) return new NextResponse("bad request", { status: 400 });

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
