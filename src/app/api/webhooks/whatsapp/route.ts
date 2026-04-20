import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignatureWithSecret } from "@/lib/channels/signature";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { handleInbound } from "@/lib/channels/inbound";
import {
  findOrgByChannelExternalId,
  findOrgByVerifyToken,
  getMetaCredentials,
} from "@/lib/channels/meta-settings";

export const runtime = "nodejs";

// GET hub.challenge — Meta's handshake. We accept any verify token that
// belongs to *some* org in our database.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("forbidden", { status: 403 });
  }
  // Accept env-level token (legacy) OR any org's token.
  if (token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  const orgId = await findOrgByVerifyToken(token);
  if (orgId) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const messages = parseWhatsAppWebhook(body);
  if (messages.length === 0) return NextResponse.json({ ok: true });

  // Identify the org via the first message's phone_number_id.
  const firstPhoneId = messages[0]!.phoneNumberId;
  const orgId = await findOrgByChannelExternalId(firstPhoneId);

  // Resolve the signing secret: prefer per-org, fall back to global env.
  let appSecret = process.env.META_APP_SECRET;
  if (orgId) {
    const creds = await getMetaCredentials(orgId);
    if (creds) appSecret = creds.appSecret;
  }
  if (!appSecret) {
    console.warn("[whatsapp webhook] no app secret available — rejecting");
    return new NextResponse("not configured", { status: 500 });
  }

  if (!verifyMetaSignatureWithSecret(raw, sig, appSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  for (const m of messages) {
    await handleInbound({
      platform: "whatsapp",
      channelExternalId: m.phoneNumberId,
      contactExternalId: m.from,
      contactName: m.contactName,
      text: m.text,
      platformMessageId: m.platformMessageId,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      mediaMime: m.mediaMime,
    }).catch((err) => console.error("[whatsapp webhook] handleInbound failed", err));
  }
  return NextResponse.json({ ok: true });
}
