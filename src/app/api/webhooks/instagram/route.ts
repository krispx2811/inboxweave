import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { verifyMetaSignatureWithSecret } from "@/lib/channels/signature";
import { parseInstagramWebhook } from "@/lib/channels/instagram";
import { handleInbound } from "@/lib/channels/inbound";
import { handleOwnerEcho } from "@/lib/channels/echo";
import { acceptIgPendingRequests } from "@/lib/channels/ig-requests";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  // No channel matches this external_id. Most likely this is Meta's Test
  // button (which sends entry.id = "0") or a webhook for an account that
  // hasn't been connected yet. Ack with 200 so Meta doesn't retry; log for
  // debugging.
  if (!orgId) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 200,
      parsedCount: messages.length, rawBody: raw,
      error: `no channel matches external_id=${firstPageId} — test payload or disconnected account?`,
    });
    return NextResponse.json({ ok: true, note: "no matching channel" });
  }

  let appSecret = process.env.META_APP_SECRET;
  const creds = await getMetaCredentials(orgId, "ig");
  if (creds) appSecret = creds.appSecret;

  if (!appSecret) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 500,
      parsedCount: messages.length, orgId, rawBody: raw,
      error: `no app secret configured for org=${orgId}`,
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

  // Defer the heavy lifting (AI generate + send + DB writes) until AFTER
  // the 200 response is out the door. Keeps us well under Meta's ~5s
  // webhook retry threshold even when OpenAI or Meta's send API is slow.
  after(async () => {
    try {
      const admin = createSupabaseAdminClient();

      // Piggyback: scan pending message-requests for this account.
      const { data: ch } = await admin
        .from("channels")
        .select("id, auto_accept_requests")
        .eq("platform", "instagram")
        .eq("external_id", firstPageId)
        .maybeSingle();
      if (ch?.auto_accept_requests) {
        acceptIgPendingRequests(ch.id as string).catch(() => {});
      }

      // Dedupe — Meta sometimes redelivers the same event.
      const ids = messages.map((m) => m.platformMessageId).filter((x): x is string => !!x);
      let seenIds = new Set<string>();
      if (ids.length > 0) {
        const { data: dupes } = await admin
          .from("messages")
          .select("platform_message_id")
          .in("platform_message_id", ids);
        seenIds = new Set((dupes ?? []).map((d) => d.platform_message_id as string));
      }

      for (const m of messages) {
        if (m.platformMessageId && seenIds.has(m.platformMessageId)) continue;
        if (m.isEcho) {
          await handleOwnerEcho({
            platform: "instagram",
            channelExternalId: m.pageId,
            contactExternalId: m.senderId,
            text: m.text,
            platformMessageId: m.platformMessageId,
          }).catch((err) => console.error("[instagram webhook] handleOwnerEcho failed", err));
        } else {
          await handleInbound({
            platform: "instagram",
            channelExternalId: m.pageId,
            contactExternalId: m.senderId,
            text: m.text,
            platformMessageId: m.platformMessageId,
          }).catch((err) => console.error("[instagram webhook] handleInbound failed", err));
        }
      }
    } catch (err) {
      console.error("[instagram webhook] background processing failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
