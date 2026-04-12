import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignature } from "@/lib/channels/signature";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { handleInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";

// Meta calls GET /webhook?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
// when you first register the webhook URL in the developer dashboard.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, sig)) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const messages = parseWhatsAppWebhook(body);
  // Acknowledge quickly; process sequentially to preserve order per convo.
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
