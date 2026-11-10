import { encodePayload } from "./parse.ts";
import { pickLanguage, resolveTexts } from "./texts.ts";
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentEvent,
  SendResult,
} from "./types.ts";

/**
 * Comment-to-DM decisions. All database and Instagram access goes through
 * `deps`, so this file stays pure and is unit-tested with fakes.
 */

export type CommentOutcome =
  | "no_channel"
  | "own_comment"
  | "disabled"
  | "channel_inactive"
  | "already_sent"
  | "dm_sent"
  | "failed";

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

/** How a sent DM reads in the InboxWeave inbox. */
export function inboxText(msg: ButtonMessage): string {
  const b = msg.button;
  return b.type === "web_url" ? `${msg.text}\n\n[${b.title}] ${b.url}` : `${msg.text}\n\n[${b.title}]`;
}

function isOwnComment(ev: CommentEvent, channel: ChannelInfo): boolean {
  if (ev.commenterId === channel.externalId) return true;
  return (
    !!ev.commenterUsername &&
    !!channel.username &&
    ev.commenterUsername.toLowerCase() === channel.username.toLowerCase()
  );
}

export async function handleComment(ev: CommentEvent, { store, meta }: CommentDmDeps): Promise<CommentOutcome> {
  const channel = await store.getChannelByExternalId(ev.accountId);
  if (!channel) return "no_channel";
  // Includes our own public replies, which come back as comments: no loops.
  if (isOwnComment(ev, channel)) return "own_comment";

  const settings = await store.getSettings(channel.id);
  if (!settings?.enabled || !settings.linkUrl) return "disabled";
  if (channel.status !== "active") return "channel_inactive";

  const language = pickLanguage(ev.text, settings.defaultLanguage);
  const event = await store.claimEvent({
    orgId: channel.orgId,
    channelId: channel.id,
    mediaId: ev.mediaId,
    commenterId: ev.commenterId,
    commenterUsername: ev.commenterUsername ?? null,
    commentId: ev.commentId,
    commentText: ev.text.slice(0, 500),
    language,
  });
  if (!event) return "already_sent";

  const texts = resolveTexts(settings.texts, language);

  // The public reply is a nice-to-have: if it fails, still send the DM.
  let publicReplyError: string | null = null;
  if (settings.publicReplyEnabled) {
    try {
      await meta.replyToComment(channel.id, ev.commentId, texts.publicReply);
    } catch (err) {
      publicReplyError = `public reply: ${errorText(err)}`;
    }
  }

  const opening: ButtonMessage = {
    text: texts.opening,
    button: { type: "postback", title: texts.openingButton, payload: encodePayload(event.id) },
  };
  let sent: SendResult;
  try {
    sent = await meta.sendPrivateReply(channel.id, ev.commentId, opening);
  } catch (err) {
    await store.updateEvent(event.id, { status: "failed", error: errorText(err) });
    return "failed";
  }

  const recipientId = sent.recipientId ?? ev.commenterId;
  const conversationId = await store.ensureConversation({
    orgId: channel.orgId,
    channelId: channel.id,
    contactExternalId: recipientId,
    contactUsername: ev.commenterUsername ?? null,
    language,
  });
  await store.logMessage({
    orgId: channel.orgId,
    conversationId,
    direction: "out",
    sender: "ai",
    content: inboxText(opening),
    platformMessageId: sent.messageId ?? null,
  });
  await store.updateEvent(event.id, { status: "dm_sent", recipientId, conversationId, error: publicReplyError });
  return "dm_sent";
}
