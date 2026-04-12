import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignature } from "@/lib/channels/signature";
import { parseMessengerWebhook } from "@/lib/channels/messenger";
import { handleInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";

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
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const messages = parseMessengerWebhook(body);
  for (const m of messages) {
    await handleInbound({
      platform: "messenger",
      channelExternalId: m.pageId,
      contactExternalId: m.senderPsid,
      text: m.text,
      platformMessageId: m.platformMessageId,
    }).catch((err) => console.error("[messenger webhook] handleInbound failed", err));
  }
  return NextResponse.json({ ok: true });
}
