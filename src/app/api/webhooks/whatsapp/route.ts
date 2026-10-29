import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignatureWithSecret } from "@/lib/channels/signature";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { handleInbound } from "@/lib/channels/inbound";
import { logWebhookDebug } from "@/lib/channels/debug-log";
import {
  findOrgByChannelExternalId,
  scopeToSigningOrg,
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
  // Accept env-level token (legacy) OR any org's token. Logged without the
  // query string: it carries the verify token.
  if (token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    logWebhookDebug({ platform: "whatsapp", method: "GET", statusCode: 200 });
    return new NextResponse(challenge, { status: 200 });
  }
  const orgId = await findOrgByVerifyToken(token);
  if (orgId) {
    logWebhookDebug({ platform: "whatsapp", method: "GET", statusCode: 200, orgId });
    return new NextResponse(challenge, { status: 200 });
  }
  logWebhookDebug({ platform: "whatsapp", method: "GET", statusCode: 403, error: "verify token matched no org" });
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
  // Statuses (sent/delivered/read) and other non-message events: log them so
  // "is Meta delivering anything?" is answerable, then acknowledge.
  if (messages.length === 0) {
    logWebhookDebug({ platform: "whatsapp", method: "POST", statusCode: 200, parsedCount: 0, rawBody: raw });
    return NextResponse.json({ ok: true });
  }

  // Identify the org via the first message's phone_number_id.
  const firstPhoneId = messages[0]!.phoneNumberId;
  const orgId = await findOrgByChannelExternalId(firstPhoneId, "whatsapp");

  // Resolve the signing secret: prefer per-org, fall back to global env.
  let appSecret = process.env.META_APP_SECRET;
  let signedByOrg = false;
  if (orgId) {
    const creds = await getMetaCredentials(orgId, "fb");
    if (creds) {
      appSecret = creds.appSecret;
      signedByOrg = true;
    }
  }
  if (!appSecret) {
    console.warn("[whatsapp webhook] no app secret available — rejecting");
    logWebhookDebug({ platform: "whatsapp", method: "POST", statusCode: 500, orgId, parsedCount: messages.length, rawBody: raw, error: "no app secret" });
    return new NextResponse("not configured", { status: 500 });
  }

  if (!verifyMetaSignatureWithSecret(raw, sig, appSecret)) {
    logWebhookDebug({ platform: "whatsapp", method: "POST", statusCode: 401, orgId, signatureOk: false, parsedCount: messages.length, rawBody: raw, error: "invalid signature" });
    return new NextResponse("invalid signature", { status: 401 });
  }
  logWebhookDebug({ platform: "whatsapp", method: "POST", statusCode: 200, orgId, signatureOk: true, parsedCount: messages.length, rawBody: raw });

  const scoped = await scopeToSigningOrg(messages, (m) => m.phoneNumberId, "whatsapp", signedByOrg ? orgId : null);
  for (const m of scoped) {
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
