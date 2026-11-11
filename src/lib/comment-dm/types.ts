/**
 * Shared types for Comment-to-DM. Pure: no imports, so unit tests and server
 * code can both use it.
 */

export type Lang = "en" | "ar";

export const TEXT_KEYS = [
  "publicReply",
  "opening",
  "openingButton",
  "followFirst",
  "followedButton",
  "linkMessage",
  "linkButton",
] as const;
export type TextKey = (typeof TEXT_KEYS)[number];
export type Texts = Record<TextKey, string>;
/** What the owner saved: only the texts they changed, per language. */
export type SavedTexts = Partial<Record<Lang, Partial<Texts>>>;

export interface CommentDmSettings {
  channelId: string;
  orgId: string;
  enabled: boolean;
  linkUrl: string | null;
  defaultLanguage: Lang;
  requireFollow: boolean;
  publicReplyEnabled: boolean;
  texts: SavedTexts;
}

/** A new comment, from a `comments` webhook change. */
export interface CommentEvent {
  /** entry.id: the Instagram account the comment was left on. */
  accountId: string;
  commentId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername?: string;
  text: string;
}

/** A button tap, from a `messaging_postbacks` webhook event. */
export interface TapEvent {
  accountId: string;
  /** IGSID of the person who tapped. */
  senderId: string;
  mid: string;
  title: string;
  payload: string;
}

export type EventStatus = "pending" | "dm_sent" | "awaiting_follow" | "link_sent" | "failed";

/** One row of comment_dm_events: one person, one post. */
export interface DmEvent {
  id: string;
  orgId: string;
  channelId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername: string | null;
  commentId: string;
  recipientId: string | null;
  conversationId: string | null;
  language: Lang;
  status: EventStatus;
  tapCount: number;
  error: string | null;
}

export type EventPatch = Partial<
  Pick<DmEvent, "status" | "recipientId" | "conversationId" | "tapCount" | "error">
>;

export interface ClaimInput {
  orgId: string;
  channelId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername: string | null;
  commentId: string;
  commentText: string;
  language: Lang;
}

export interface ChannelInfo {
  id: string;
  orgId: string;
  externalId: string;
  /** The account's @username (channels.display_name), when known. */
  username: string | null;
  status: string;
}

export type Button =
  | { type: "postback"; title: string; payload: string }
  | { type: "web_url"; title: string; url: string };

export interface ButtonMessage {
  text: string;
  button: Button;
}

export interface SendResult {
  messageId?: string;
  recipientId?: string;
}

export type FollowResult = { ok: true; follows: boolean } | { ok: false; error: string };

export interface InboxMessage {
  orgId: string;
  conversationId: string;
  direction: "in" | "out";
  sender: "contact" | "ai";
  content: string;
  platformMessageId: string | null;
}

export interface ConversationInput {
  orgId: string;
  channelId: string;
  contactExternalId: string;
  contactUsername: string | null;
  language: Lang;
}

/** Database access the flow needs. Real one: store.ts. Tests pass a fake. */
export interface CommentDmStore {
  getChannelByExternalId(externalId: string): Promise<ChannelInfo | null>;
  getChannelById(id: string): Promise<ChannelInfo | null>;
  getSettings(channelId: string): Promise<CommentDmSettings | null>;
  /** Atomically claim the person+post row; null when it's already taken. */
  claimEvent(input: ClaimInput): Promise<DmEvent | null>;
  getEvent(id: string): Promise<DmEvent | null>;
  updateEvent(id: string, patch: EventPatch): Promise<void>;
  /** Upsert the inbox conversation; returns its id. */
  ensureConversation(input: ConversationInput): Promise<string>;
  /** "duplicate" when a message with the same platform id already exists. */
  logMessage(msg: InboxMessage): Promise<"inserted" | "duplicate">;
  /** This channel's events created at or after `since` whose status isn't "failed" or "pending". */
  countRecentDms(channelId: string, since: Date): Promise<number>;
}

/** Instagram calls the flow needs. Real one: meta.ts. Tests pass a fake. */
export interface CommentDmMeta {
  replyToComment(channelId: string, commentId: string, text: string): Promise<void>;
  sendPrivateReply(channelId: string, commentId: string, msg: ButtonMessage): Promise<SendResult>;
  sendButtonMessage(channelId: string, recipientId: string, msg: ButtonMessage): Promise<SendResult>;
  checkFollows(channelId: string, igsid: string): Promise<FollowResult>;
}

export interface CommentDmDeps {
  store: CommentDmStore;
  meta: CommentDmMeta;
  /** Random source for picking a public reply variant; tests inject one. Default Math.random. */
  random?: () => number;
}
