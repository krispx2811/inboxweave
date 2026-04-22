import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { verifyMetaSignatureWithSecret } from "@/lib/channels/signature";
import { parseMessengerWebhook } from "@/lib/channels/messenger";
import { handleInbound } from "@/lib/channels/inbound";
import { handleOwnerEcho } from "@/lib/channels/echo";
import {
  findOrgByChannelExternalId,
  findOrgByVerifyToken,
  getMetaCredentials,
} from "@/lib/channels/meta-settings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("forbidden", { status: 403 });
  }
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

  const messages = parseMessengerWebhook(body);
  if (messages.length === 0) return NextResponse.json({ ok: true });

  const firstPageId = messages[0]!.pageId;
  const orgId = await findOrgByChannelExternalId(firstPageId);

  let appSecret = process.env.META_APP_SECRET;
  if (orgId) {
    const creds = await getMetaCredentials(orgId, "fb");
    if (creds) appSecret = creds.appSecret;
  }
  if (!appSecret) return new NextResponse("not configured", { status: 500 });
  if (!verifyMetaSignatureWithSecret(raw, sig, appSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  after(async () => {
    try {
      for (const m of messages) {
        if (m.isEcho) {
          await handleOwnerEcho({
            platform: "messenger",
            channelExternalId: m.pageId,
            contactExternalId: m.senderPsid,
            text: m.text,
            platformMessageId: m.platformMessageId,
          }).catch((err) => console.error("[messenger webhook] handleOwnerEcho failed", err));
        } else {
          await handleInbound({
            platform: "messenger",
            channelExternalId: m.pageId,
            contactExternalId: m.senderPsid,
            text: m.text,
            platformMessageId: m.platformMessageId,
          }).catch((err) => console.error("[messenger webhook] handleInbound failed", err));
        }
      }
    } catch (err) {
      console.error("[messenger webhook] background processing failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
