import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

/**
 * Heuristic detector for Meta / WhatsApp / IG access-token failures.
 * These error strings all mean "the saved access token is no longer valid
 * and the user must re-connect the channel".
 */
export function isTokenError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("session has been invalidated") ||
    m.includes("error validating access token") ||
    m.includes("access token") && (m.includes("expired") || m.includes("invalid")) ||
    m.includes("oauthexception") ||
    m.includes("code: 190") ||
    m.includes("code\":190") ||
    m.includes("token has expired") ||
    m.includes("permissions have been removed") ||
    m.includes("this authorization has expired")
  );
}

/**
 * Detect Meta's "24-hour messaging window" error. Happens when we try to
 * reply to a customer whose conversation is in the Requests folder (not
 * yet accepted) or whose last inbound was >24h ago. Not a token failure —
 * needs different handling than the channel going "unhealthy".
 */
export function isOutsideWindowError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("outside of allowed window") ||
    m.includes("outside the 24") ||
    m.includes("messaging window") ||
    m.includes("policy violation") && m.includes("messaging")
  );
}

/**
 * Mark a channel as needing reconnection, persist the error, and notify the
 * org's owners by email (if RESEND_API_KEY is configured). Idempotent: won't
 * re-email if the same error was already recorded within the last hour.
 */
export async function markChannelUnhealthy(params: {
  channelId: string;
  orgId: string;
  platform: string;
  error: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();

  // Load existing state so we can skip duplicate emails.
  const { data: existing } = await admin
    .from("channels")
    .select("status, last_error, last_error_at, display_name, external_id")
    .eq("id", params.channelId)
    .maybeSingle();

  const now = new Date();
  await admin
    .from("channels")
    .update({
      status: "error",
      last_error: params.error.slice(0, 500),
      last_error_at: now.toISOString(),
    })
    .eq("id", params.channelId);

  await admin.from("audit_logs").insert({
    org_id: params.orgId,
    action: "channel_token_invalid",
    payload: {
      channel_id: params.channelId,
      platform: params.platform,
      error: params.error.slice(0, 500),
    },
  });

  // Don't re-email if we already alerted within the last hour for this channel.
  if (existing?.last_error_at) {
    const age = now.getTime() - new Date(existing.last_error_at as string).getTime();
    if (age < 60 * 60 * 1000 && existing.status === "error") return;
  }

  // Fetch owner emails for this org.
  const { data: owners } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", params.orgId)
    .eq("role", "owner");

  const userIds = (owners ?? []).map((o) => o.user_id as string);
  if (userIds.length === 0) return;

  // Pull auth.users emails via the admin API.
  const emails: string[] = [];
  for (const id of userIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return;

  const displayName = existing?.display_name ?? existing?.external_id ?? params.platform;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const channelsUrl = `${appUrl}/app/${params.orgId}/channels`;

  await sendEmail({
    to: emails.join(","),
    subject: `InboxWeave: action needed — ${params.platform} channel disconnected`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 16px">Your ${params.platform} channel needs reconnection</h2>
        <p style="line-height:1.6;color:#475569">
          InboxWeave tried to send an auto-reply on <strong>${displayName}</strong> but the access token has been invalidated by Meta.
          This usually happens after a password change or a Meta security event.
        </p>
        <p style="line-height:1.6;color:#475569">
          Until this is fixed, the AI will not reply on this channel. Customer messages will still appear in your inbox.
        </p>
        <p style="margin:24px 0">
          <a href="${channelsUrl}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Reconnect ${params.platform}
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px">
          Error from Meta: <code>${params.error.slice(0, 200).replace(/</g, "&lt;")}</code>
        </p>
      </div>
    `,
  });
}

/** Called after a successful send. Clears any "error" state on the channel. */
export async function markChannelHealthy(channelId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("channels")
    .update({ status: "active", last_error: null, last_error_at: null })
    .eq("id", channelId)
    .eq("status", "error");
}
