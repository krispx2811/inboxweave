import { decodePayload, encodePayload } from "./parse.ts";
import { pickLanguage, pickPublicReply, resolveTexts } from "./texts.ts";
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentEvent,
  SendResult,
  TapEvent,
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

/** Cut to `max` code points (not UTF-16 units), so an emoji is never split. */
export function clip(text: string, max = 300): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

export function errorText(err: unknown): string {
  return clip(err instanceof Error ? err.message : String(err));
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

/** Public replies pause once this many DMs went out in the last hour (the DMs themselves never do). */
export const PUBLIC_REPLY_HOURLY_CAP = 30;
const HOUR_MS = 60 * 60 * 1000;

export async function handleComment(ev: CommentEvent, { store, meta, random }: CommentDmDeps): Promise<CommentOutcome> {
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
    commentText: clip(ev.text, 500),
    language,
  });
  if (!event) return "already_sent";

  const texts = resolveTexts(settings.texts, language);

  // 1. The DM first. If it fails nothing else goes out.
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

  // 2. Record it at once, so the button works even if everything after this fails.
  const recipientId = sent.recipientId ?? ev.commenterId;
  await store.updateEvent(event.id, { status: "dm_sent", recipientId });

  const problems: string[] = [];

  // 3. The inbox copy is best-effort. It goes before the public reply so the saved
  // platform message id is in place before Instagram's echo of the DM arrives.
  try {
    const conversationId = await store.ensureConversation({
      orgId: channel.orgId,
      channelId: channel.id,
      contactExternalId: recipientId,
      contactUsername: ev.commenterUsername ?? null,
      language,
    });
    await store.updateEvent(event.id, { conversationId });
    await store.logMessage({
      orgId: channel.orgId,
      conversationId,
      direction: "out",
      sender: "ai",
      content: inboxText(opening),
      platformMessageId: sent.messageId ?? null,
    });
  } catch (err) {
    problems.push(`inbox: ${errorText(err)}`);
  }

  // 4. The public reply is a nice-to-have, and only goes out once the DM did. Past the
  // hourly cap it's skipped, so Instagram doesn't see hundreds of replies an hour.
  if (settings.publicReplyEnabled) {
    let overCap = false;
    try {
      const recent = await store.countRecentDms(channel.id, new Date(Date.now() - HOUR_MS));
      overCap = recent >= PUBLIC_REPLY_HOURLY_CAP;
    } catch {
      // Best-effort: if we can't count, treat it as under the cap.
    }
    if (overCap) {
      problems.push(`public reply skipped: more than ${PUBLIC_REPLY_HOURLY_CAP} DMs in the last hour`);
    } else {
      try {
        await meta.replyToComment(channel.id, ev.commentId, pickPublicReply(texts.publicReply, random));
      } catch (err) {
        problems.push(`public reply: ${errorText(err)}`);
      }
    }
  }

  if (problems.length > 0) {
    await store.updateEvent(event.id, { error: clip(problems.join("; ")) }).catch(() => {});
  }
  return "dm_sent";
}

/** Past this many taps on one person+post, stop answering (spam guard). */
export const MAX_TAPS = 10;

export type TapOutcome =
  | "not_ours"
  | "unknown_event"
  | "mismatch"
  | "duplicate"
  | "tap_limit"
  | "no_link"
  | "link_sent"
  | "awaiting_follow"
  | "failed";

export async function handleTap(ev: TapEvent, { store, meta }: CommentDmDeps): Promise<TapOutcome> {
  const eventId = decodePayload(ev.payload);
  if (!eventId) return "not_ours";
  const event = await store.getEvent(eventId);
  if (!event) return "unknown_event";
  const channel = await store.getChannelById(event.channelId);
  // Only the person we DMed, on the account we DMed them from, can use the button.
  if (!channel || channel.externalId !== ev.accountId || event.recipientId !== ev.senderId) return "mismatch";

  const conversationId =
    event.conversationId ??
    (await store.ensureConversation({
      orgId: event.orgId,
      channelId: channel.id,
      contactExternalId: ev.senderId,
      contactUsername: event.commenterUsername,
      language: event.language,
    }));

  // Saving the tap doubles as the redelivery check: Meta can send the same tap twice.
  const logged = await store.logMessage({
    orgId: event.orgId,
    conversationId,
    direction: "in",
    sender: "contact",
    content: ev.title || "[button]",
    platformMessageId: ev.mid,
  });
  if (logged === "duplicate") return "duplicate";

  const tapCount = event.tapCount + 1;
  if (tapCount > MAX_TAPS) {
    await store.updateEvent(event.id, { tapCount });
    return "tap_limit";
  }

  // Answer even if the owner has since turned the feature off: they were promised a link.
  const settings = await store.getSettings(channel.id);
  if (!settings?.linkUrl) {
    await store.updateEvent(event.id, { tapCount, conversationId, status: "failed", error: "no link set" });
    return "no_link";
  }
  const texts = resolveTexts(settings.texts, event.language);

  let sendLink = true;
  let followError: string | null = null;
  if (settings.requireFollow) {
    const follow = await meta.checkFollows(channel.id, ev.senderId);
    if (follow.ok) sendLink = follow.follows;
    else followError = clip(`follow check: ${follow.error}`); // fail open: send the link
  }

  const reply: ButtonMessage = sendLink
    ? { text: texts.linkMessage, button: { type: "web_url", title: texts.linkButton, url: settings.linkUrl } }
    : {
        text: texts.followFirst,
        button: { type: "postback", title: texts.followedButton, payload: encodePayload(event.id) },
      };

  let sent: SendResult;
  try {
    sent = await meta.sendButtonMessage(channel.id, ev.senderId, reply);
  } catch (err) {
    await store.updateEvent(event.id, { tapCount, conversationId, status: "failed", error: errorText(err) });
    return "failed";
  }

  // Record the send first; the inbox copy is best-effort.
  const status = sendLink ? "link_sent" : "awaiting_follow";
  await store.updateEvent(event.id, { tapCount, conversationId, status, error: followError });
  try {
    await store.logMessage({
      orgId: event.orgId,
      conversationId,
      direction: "out",
      sender: "ai",
      content: inboxText(reply),
      platformMessageId: sent.messageId ?? null,
    });
  } catch (err) {
    const error = clip([followError, `inbox: ${errorText(err)}`].filter(Boolean).join("; "));
    await store.updateEvent(event.id, { error }).catch(() => {});
  }
  return status;
}
