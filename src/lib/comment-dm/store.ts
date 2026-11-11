import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ChannelInfo,
  CommentDmSettings,
  CommentDmStore,
  DmEvent,
  EventStatus,
  SavedTexts,
} from "./types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Row = Record<string, unknown>;

const CHANNEL_COLUMNS = "id, org_id, external_id, display_name, status";
const EVENT_COLUMNS =
  "id, org_id, channel_id, media_id, commenter_id, commenter_username, comment_id, recipient_id, conversation_id, language, status, tap_count, error";

function toChannel(r: Row): ChannelInfo {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    externalId: r.external_id as string,
    username: (r.display_name as string | null) ?? null,
    status: r.status as string,
  };
}

export function toSettings(r: Row): CommentDmSettings {
  return {
    channelId: r.channel_id as string,
    orgId: r.org_id as string,
    enabled: r.enabled === true,
    linkUrl: (r.link_url as string | null) ?? null,
    defaultLanguage: r.default_language === "ar" ? "ar" : "en",
    requireFollow: r.require_follow !== false,
    publicReplyEnabled: r.public_reply_enabled !== false,
    texts: (r.texts as SavedTexts | null) ?? {},
  };
}

/** The saved settings, or what a channel that was never set up looks like. */
export function settingsOrDefaults(row: Row | null | undefined, channelId: string, orgId: string): CommentDmSettings {
  if (row) return toSettings(row);
  return {
    channelId,
    orgId,
    enabled: false,
    linkUrl: null,
    defaultLanguage: "en",
    requireFollow: true,
    publicReplyEnabled: true,
    texts: {},
  };
}

function toEvent(r: Row): DmEvent {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    channelId: r.channel_id as string,
    mediaId: r.media_id as string,
    commenterId: r.commenter_id as string,
    commenterUsername: (r.commenter_username as string | null) ?? null,
    commentId: r.comment_id as string,
    recipientId: (r.recipient_id as string | null) ?? null,
    conversationId: (r.conversation_id as string | null) ?? null,
    language: r.language === "ar" ? "ar" : "en",
    status: r.status as EventStatus,
    tapCount: Number(r.tap_count ?? 0),
    error: (r.error as string | null) ?? null,
  };
}

export function createStore(admin: Admin = createSupabaseAdminClient()): CommentDmStore {
  return {
    async getChannelByExternalId(externalId) {
      const { data, error } = await admin
        .from("channels")
        .select(CHANNEL_COLUMNS)
        .eq("platform", "instagram")
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toChannel(data) : null;
    },

    async getChannelById(id) {
      const { data, error } = await admin
        .from("channels")
        .select(CHANNEL_COLUMNS)
        .eq("id", id)
        .eq("platform", "instagram")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toChannel(data) : null;
    },

    async getSettings(channelId) {
      const { data, error } = await admin
        .from("comment_dm_settings")
        .select("*")
        .eq("channel_id", channelId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toSettings(data) : null;
    },

    async claimEvent(input) {
      const { data, error } = await admin.rpc("claim_comment_dm", {
        p_org_id: input.orgId,
        p_channel_id: input.channelId,
        p_media_id: input.mediaId,
        p_commenter_id: input.commenterId,
        p_commenter_username: input.commenterUsername,
        p_comment_id: input.commentId,
        p_comment_text: input.commentText,
        p_language: input.language,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      return rows[0] ? toEvent(rows[0]) : null;
    },

    async getEvent(id) {
      const { data, error } = await admin.from("comment_dm_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toEvent(data) : null;
    },

    async updateEvent(id, patch) {
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.recipientId !== undefined) row.recipient_id = patch.recipientId;
      if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
      if (patch.tapCount !== undefined) row.tap_count = patch.tapCount;
      if (patch.error !== undefined) row.error = patch.error;
      // Idempotent write, so retry once: the dm_sent save right after a private DM
      // must not be lost, or the button stops working and a later comment can DM twice.
      let { error } = await admin.from("comment_dm_events").update(row).eq("id", id);
      if (error) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        ({ error } = await admin.from("comment_dm_events").update(row).eq("id", id));
      }
      if (error) throw new Error(error.message);
    },

    async ensureConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .upsert(
          {
            org_id: input.orgId,
            channel_id: input.channelId,
            contact_external_id: input.contactExternalId,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,contact_external_id" },
        )
        .select("id, contact_username")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to upsert conversation");
      // Fill gaps only; never overwrite what the inbox already knows. conversations.language is
      // left alone: it holds the inbox's own detection and pins the AI reply language.
      const patch: Row = {};
      if (!data.contact_username && input.contactUsername) patch.contact_username = input.contactUsername;
      if (Object.keys(patch).length > 0) {
        await admin.from("conversations").update(patch).eq("id", data.id);
      }
      return data.id as string;
    },

    async logMessage(msg) {
      if (msg.platformMessageId) {
        const { data: dup } = await admin
          .from("messages")
          .select("id")
          .eq("platform_message_id", msg.platformMessageId)
          .limit(1);
        if (dup && dup.length > 0) return "duplicate";
      }
      const { error } = await admin.from("messages").insert({
        org_id: msg.orgId,
        conversation_id: msg.conversationId,
        direction: msg.direction,
        sender: msg.sender,
        content: msg.content,
        platform_message_id: msg.platformMessageId,
      });
      if (error) {
        // Two deliveries of the same tap can race past the pre-check above; the
        // unique index messages_platform_message_id_uniq then rejects the second.
        if (error.code === "23505") return "duplicate";
        throw new Error(error.message);
      }
      await admin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", msg.conversationId);
      return "inserted";
    },
  };
}
