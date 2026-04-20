import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignatureWithSecret } from "@/lib/channels/signature";
import { parseInstagramWebhook } from "@/lib/channels/instagram";
import { handleInbound } from "@/lib/channels/inbound";
import {
  findOrgByChannelExternalId,
  findOrgByVerifyToken,
  getMetaCredentials,
} from "@/lib/channels/meta-settings";
import { logWebhookDebug } from "@/lib/channels/debug-log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let status = 403;
  let orgId: string | null = null;
  let err: string | undefined;

  if (mode === "subscribe" && token && challenge) {
    if (token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      status = 200;
    } else {
      orgId = await findOrgByVerifyToken(token);
      status = orgId ? 200 : 403;
      if (!orgId) err = `verify_token did not match any org`;
    }
  } else {
    err = "missing hub.mode/token/challenge";
  }

  logWebhookDebug({
    platform: "instagram", method: "GET", statusCode: status,
    orgId, queryString: url.search, error: err,
  });

  if (status === 200 && challenge) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    logWebhookDebug({ platform: "instagram", method: "POST", statusCode: 400, rawBody: raw, error: "bad json" });
    return new NextResponse("bad json", { status: 400 });
  }

  const messages = parseInstagramWebhook(body);

  if (messages.length === 0) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 200,
      parsedCount: 0, rawBody: raw, error: "no parseable messages (may be a non-message event)",
    });
    return NextResponse.json({ ok: true });
  }

  const firstPageId = messages[0]!.pageId;
  const orgId = await findOrgByChannelExternalId(firstPageId);

  let appSecret = process.env.META_APP_SECRET;
  if (orgId) {
    const creds = await getMetaCredentials(orgId, "ig");
    if (creds) appSecret = creds.appSecret;
  }
  if (!appSecret) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 500,
      parsedCount: messages.length, orgId, rawBody: raw,
      error: `no app secret for org=${orgId ?? "unknown"}, channel external_id=${firstPageId}`,
    });
    return new NextResponse("not configured", { status: 500 });
  }

  const sigOk = verifyMetaSignatureWithSecret(raw, sig, appSecret);
  logWebhookDebug({
    platform: "instagram", method: "POST",
    statusCode: sigOk ? 200 : 401,
    signatureOk: sigOk, parsedCount: messages.length, orgId, rawBody: raw,
    error: sigOk ? undefined : `signature mismatch`,
  });
  if (!sigOk) return new NextResponse("invalid signature", { status: 401 });

  for (const m of messages) {
    await handleInbound({
      platform: "instagram",
      channelExternalId: m.pageId,
      contactExternalId: m.senderId,
      text: m.text,
      platformMessageId: m.platformMessageId,
    }).catch((err) => console.error("[instagram webhook] handleInbound failed", err));
  }
  return NextResponse.json({ ok: true });
}
