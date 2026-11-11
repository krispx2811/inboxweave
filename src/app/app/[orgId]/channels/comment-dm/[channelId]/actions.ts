"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { hasCommentAccess } from "@/lib/channels/ig-scopes";
import { compactTexts, parseSettingsForm } from "@/lib/comment-dm/texts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RefSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

function pagePath(orgId: string, channelId: string): string {
  return `/app/${orgId}/channels/comment-dm/${channelId}`;
}

function backWithError(orgId: string, channelId: string, message: string): never {
  redirect(`${pagePath(orgId, channelId)}?error=${encodeURIComponent(message)}`);
}

// The admin client bypasses RLS: prove the channel belongs to the org the caller was checked against.
async function requireOwnerChannel(orgId: string, channelId: string) {
  const ctx = await requireOrgMember(orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can change Comment to DM");
  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, platform, granted_scopes")
    .eq("id", channelId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!channel || channel.platform !== "instagram") throw new Error("Channel not found");
  return { ctx, admin, channel };
}

export async function saveCommentDmSettings(formData: FormData) {
  const ref = RefSchema.parse({ orgId: formData.get("orgId"), channelId: formData.get("channelId") });
  const { ctx, admin } = await requireOwnerChannel(ref.orgId, ref.channelId);

  const parsed = parseSettingsForm((name) => formData.get(name));
  if (!parsed.success) {
    backWithError(ref.orgId, ref.channelId, parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const s = parsed.data;

  const { data: current } = await admin
    .from("comment_dm_settings")
    .select("enabled")
    .eq("channel_id", ref.channelId)
    .maybeSingle();
  if (current?.enabled && !s.linkUrl) {
    backWithError(ref.orgId, ref.channelId, "Comment to DM is on, so it needs a link. Add one, or turn it off first.");
  }

  const { error } = await admin.from("comment_dm_settings").upsert(
    {
      channel_id: ref.channelId,
      org_id: ref.orgId,
      link_url: s.linkUrl || null,
      default_language: s.defaultLanguage,
      require_follow: s.requireFollow,
      public_reply_enabled: s.publicReplyEnabled,
      texts: compactTexts(s.texts),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: ref.orgId,
    user_id: ctx.userId,
    action: "comment_dm_settings_saved",
    payload: { channel_id: ref.channelId },
  });
  revalidatePath(pagePath(ref.orgId, ref.channelId));
  redirect(`${pagePath(ref.orgId, ref.channelId)}?saved=1`);
}

export async function setCommentDmEnabled(formData: FormData) {
  const parsed = RefSchema.extend({ enabled: z.enum(["true", "false"]) }).parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
    enabled: formData.get("enabled"),
  });
  const { ctx, admin, channel } = await requireOwnerChannel(parsed.orgId, parsed.channelId);
  const enable = parsed.enabled === "true";

  if (enable) {
    if (!hasCommentAccess(channel.granted_scopes as string[] | null)) {
      backWithError(parsed.orgId, parsed.channelId, "Reconnect this account and allow comment access first.");
    }
    const { data: saved } = await admin
      .from("comment_dm_settings")
      .select("link_url")
      .eq("channel_id", parsed.channelId)
      .maybeSingle();
    if (!saved?.link_url) {
      backWithError(parsed.orgId, parsed.channelId, "Add your link and save before turning this on.");
    }
  }

  const { error } = await admin.from("comment_dm_settings").upsert(
    { channel_id: parsed.channelId, org_id: parsed.orgId, enabled: enable, updated_at: new Date().toISOString() },
    { onConflict: "channel_id" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: enable ? "comment_dm_enabled" : "comment_dm_disabled",
    payload: { channel_id: parsed.channelId },
  });
  revalidatePath(pagePath(parsed.orgId, parsed.channelId));
  revalidatePath(`/app/${parsed.orgId}/channels`);
  redirect(pagePath(parsed.orgId, parsed.channelId));
}
