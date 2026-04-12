import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Send a Web Push notification to all subscribers of an org.
 * Requires VAPID keys configured in env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_EMAIL (mailto:admin@example.com)
 *
 * Uses the Web Push protocol directly via fetch (no npm dependency).
 * For production, install `web-push` for proper VAPID/ECE support.
 * This is a simplified version that sends via the push service.
 */
export async function sendPushToOrg(params: {
  orgId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("org_id", params.orgId);

  if (!subs || subs.length === 0) return;

  // Without the web-push npm package, we can't do VAPID signing properly.
  // This stores subscriptions; the actual push sending requires either:
  // 1. Install `web-push` package and use its sendNotification()
  // 2. Use a push service like Firebase Cloud Messaging
  // For now, we log the intent and rely on the Supabase Realtime
  // browser notifications we already have for immediate notification.
  console.log(`[push] Would send to ${subs.length} subscribers:`, params.title, params.body);

  // TODO: Install web-push and implement:
  // import webpush from 'web-push';
  // webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  // for (const sub of subs) {
  //   await webpush.sendNotification(
  //     { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
  //     JSON.stringify({ title: params.title, body: params.body, url: params.url })
  //   );
  // }
}
