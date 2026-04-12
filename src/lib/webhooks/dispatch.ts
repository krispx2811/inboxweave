import "server-only";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WebhookEventType =
  | "message.inbound"
  | "message.outbound"
  | "conversation.resolved"
  | "conversation.escalated"
  | "csat.received";

/**
 * Fire webhook events to all active subscriptions for an org that listen
 * to the given event type. Non-blocking — errors are logged, never thrown.
 */
export async function dispatchWebhookEvent(params: {
  orgId: string;
  event: WebhookEventType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: subs } = await admin
    .from("webhook_subscriptions")
    .select("id, url, secret, events")
    .eq("org_id", params.orgId)
    .eq("is_active", true);

  if (!subs || subs.length === 0) return;

  const matching = subs.filter((s) =>
    (s.events as string[]).includes(params.event) || (s.events as string[]).includes("*"),
  );

  for (const sub of matching) {
    const body = JSON.stringify({
      event: params.event,
      org_id: params.orgId,
      timestamp: new Date().toISOString(),
      data: params.payload,
    });
    const signature = createHmac("sha256", sub.secret as string)
      .update(body, "utf8")
      .digest("hex");

    const start = Date.now();
    let statusCode = 0;
    try {
      const res = await fetch(sub.url as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
    } catch {
      statusCode = 0;
    }

    await admin.from("webhook_events").insert({
      org_id: params.orgId,
      subscription_id: sub.id,
      event_type: params.event,
      payload: params.payload,
      status_code: statusCode,
      response_ms: Date.now() - start,
    }).then(() => {});
  }
}
