"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, decryptSecret, encryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { assertChannelNotOwnedElsewhere } from "@/lib/channels/ownership";
import {
  checkWhatsAppConnection,
  inspectToken,
  subscribeWhatsAppWebhooks,
  tokenExpiry,
  type WhatsAppHealth,
} from "@/lib/channels/whatsapp-health";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// The admin client bypasses RLS: a channel id from the form must be proven
// to belong to the org the caller was checked against.
async function assertChannelInOrg(admin: AdminClient, channelId: string, orgId: string) {
  const { data } = await admin
    .from("channels")
    .select("org_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!data || data.org_id !== orgId) throw new Error("Channel not found");
}

const WhatsAppSchema = z.object({
  orgId: z.string().uuid(),
  phoneNumberId: z.string().min(3),
  displayName: z.string().min(1).max(80),
  accessToken: z.string().min(20),
});

export async function connectWhatsApp(formData: FormData) {
  const parsed = WhatsAppSchema.parse({
    orgId: formData.get("orgId"),
    phoneNumberId: formData.get("phoneNumberId"),
    displayName: formData.get("displayName"),
    accessToken: formData.get("accessToken"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can connect channels");

  // Live validation: hit Meta's Cloud API with the supplied phone number
  // ID + token. If either is wrong / expired / from a different account,
  // we error immediately with a useful message instead of silently
  // saving credentials that won't work.
  const verifyUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(
    parsed.phoneNumberId,
  )}?fields=display_phone_number,verified_name,quality_rating`;
  const verify = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${parsed.accessToken}` },
  });
  if (!verify.ok) {
    const body = await verify.text();
    throw new Error(
      `Meta rejected these credentials (${verify.status}). Common causes: wrong Phone Number ID, expired or revoked token, token doesn't have whatsapp_business_messaging scope. Details: ${body.slice(0, 220)}`,
    );
  }
  const info = (await verify.json()) as {
    display_phone_number?: string;
    verified_name?: string;
  };

  // A temporary or user-login token stops working (when it expires, or when
  // that person logs out of Facebook), and the channel silently goes dead.
  // Only accept tokens that never expire, i.e. System User tokens.
  const expiry = tokenExpiry(await inspectToken(parsed.accessToken));
  if (!expiry.permanent) {
    throw new Error(
      `This token isn't permanent (${expiry.detail.toLowerCase()}), so WhatsApp would stop working when it does. In Meta Business Settings → Users → System users, generate a token with "Never" expiry and the whatsapp_business_messaging and whatsapp_business_management permissions, then connect with that.`,
    );
  }

  const admin = createSupabaseAdminClient();
  await assertChannelNotOwnedElsewhere(admin, {
    platform: "whatsapp",
    externalId: parsed.phoneNumberId,
    orgId: parsed.orgId,
  });
  const { error } = await admin.from("channels").upsert(
    {
      org_id: parsed.orgId,
      platform: "whatsapp",
      external_id: parsed.phoneNumberId,
      // Prefer the human-friendly display name from Meta if the user
      // didn't pick a great one — falls back to whatever they typed.
      display_name:
        info.verified_name ?? info.display_phone_number ?? parsed.displayName,
      access_token_ciphertext: bufferToPgBytea(encryptSecret(parsed.accessToken)),
      status: "active",
    },
    { onConflict: "external_id" },
  );
  if (error) throw new Error(error.message);

  // Without this subscription Meta never delivers incoming messages. Best
  // effort: "Test connection" shows and fixes it if this didn't work.
  const health = await checkWhatsAppConnection(parsed.accessToken, parsed.phoneNumberId);
  const webhook = health.canSubscribe && health.wabaId
    ? await subscribeWhatsAppWebhooks(parsed.accessToken, health.wabaId)
    : { ok: health.checks.at(-1)?.ok ?? false };

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "channel_connected",
    payload: { platform: "whatsapp", external_id: parsed.phoneNumberId, webhook_subscribed: webhook.ok },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}

const ChannelRefSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

export type WhatsAppCheckState = { health?: WhatsAppHealth; message?: string; error?: string } | null;

async function loadWhatsAppChannel(formData: FormData) {
  const parsed = ChannelRefSchema.parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await assertChannelInOrg(admin, parsed.channelId, parsed.orgId);
  const { data: channel, error } = await admin
    .from("channels")
    .select("external_id, platform, access_token_ciphertext")
    .eq("id", parsed.channelId)
    .eq("org_id", parsed.orgId)
    .single();
  if (error || !channel || channel.platform !== "whatsapp") throw new Error("WhatsApp channel not found");
  const token = decryptSecret(pgByteaToBuffer(channel.access_token_ciphertext as unknown as string));
  return { ctx, admin, parsed, token, phoneNumberId: channel.external_id as string };
}

/** "Test connection" on a WhatsApp channel. */
export async function checkWhatsAppChannel(_prev: WhatsAppCheckState, formData: FormData): Promise<WhatsAppCheckState> {
  try {
    const { token, phoneNumberId } = await loadWhatsAppChannel(formData);
    return { health: await checkWhatsAppConnection(token, phoneNumberId) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** One-click fix when the only problem is the missing webhook subscription. */
export async function subscribeWhatsAppChannel(_prev: WhatsAppCheckState, formData: FormData): Promise<WhatsAppCheckState> {
  try {
    const { ctx, admin, parsed, token, phoneNumberId } = await loadWhatsAppChannel(formData);
    if (ctx.role !== "owner") return { error: "Only owners can change channel settings" };
    const before = await checkWhatsAppConnection(token, phoneNumberId);
    if (!before.wabaId) return { health: before, error: "Couldn't find this number's WhatsApp Business Account" };
    const res = await subscribeWhatsAppWebhooks(token, before.wabaId);
    await admin.from("audit_logs").insert({
      org_id: parsed.orgId,
      user_id: ctx.userId,
      action: "whatsapp_webhook_subscribed",
      payload: { channel_id: parsed.channelId, ok: res.ok, error: res.error ?? null },
    });
    const after = await checkWhatsAppConnection(token, phoneNumberId);
    return res.ok
      ? { health: after, message: "Subscribed. New WhatsApp messages will now reach the inbox." }
      : { health: after, error: `Meta refused the subscription: ${res.error}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

const DisconnectSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

export async function disconnectChannel(formData: FormData) {
  const parsed = DisconnectSchema.parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can disconnect channels");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("channels")
    .delete()
    .eq("id", parsed.channelId)
    .eq("org_id", parsed.orgId);
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "channel_disconnected",
    payload: { channel_id: parsed.channelId },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}

const ScanRequestsSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

/**
 * Manually trigger a pending-requests scan for a single IG channel.
 * Processes every pending message in the Requests folder through the
 * normal AI pipeline immediately.
 */
export async function scanIgRequestsNow(formData: FormData) {
  const parsed = ScanRequestsSchema.parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can scan for requests");

  const admin = createSupabaseAdminClient();
  await assertChannelInOrg(admin, parsed.channelId, parsed.orgId);

  const { acceptIgPendingRequests } = await import("@/lib/channels/ig-requests");
  const result = await acceptIgPendingRequests(parsed.channelId);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "ig_requests_scan",
    payload: { channel_id: parsed.channelId, ...result },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}

const AutoAcceptSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
  enabled: z.coerce.boolean(),
});

/**
 * Toggle auto-accept of IG message requests. When enabled, requests are
 * picked up on every webhook arrival and by the 1-minute cron, so new
 * message-requests get answered near-instantly without manual approval.
 */
export async function toggleAutoAcceptRequests(formData: FormData) {
  const parsed = AutoAcceptSchema.parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
    enabled: formData.get("enabled"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can change channel settings");

  const admin = createSupabaseAdminClient();
  await assertChannelInOrg(admin, parsed.channelId, parsed.orgId);
  await admin
    .from("channels")
    .update({ auto_accept_requests: parsed.enabled })
    .eq("id", parsed.channelId)
    .eq("org_id", parsed.orgId);

  // Immediate scan when just enabled so the effect is visible right away.
  if (parsed.enabled) {
    import("@/lib/channels/ig-requests")
      .then(({ acceptIgPendingRequests }) => acceptIgPendingRequests(parsed.channelId))
      .catch(() => {});
  }

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: parsed.enabled ? "ig_auto_accept_enabled" : "ig_auto_accept_disabled",
    payload: { channel_id: parsed.channelId },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}
