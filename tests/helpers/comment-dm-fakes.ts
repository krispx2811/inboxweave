import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentDmSettings,
  CommentEvent,
  DmEvent,
  FollowResult,
  InboxMessage,
  TapEvent,
} from "../../src/lib/comment-dm/types.ts";

export const ACCOUNT_ID = "17841400000000001";

export interface SentCall {
  kind: "public" | "private" | "dm";
  target: string;
  text?: string;
  msg?: ButtonMessage;
}

export interface FakeOptions {
  channel?: Partial<ChannelInfo>;
  settings?: Partial<CommentDmSettings> | null;
  follow?: FollowResult;
  publicReplyError?: string;
  privateReplyError?: string;
  dmError?: string;
  /** What Meta returns as recipient_id after the private reply; null = nothing. */
  recipientId?: string | null;
}

/** In-memory store and Instagram fakes for the Comment-to-DM flow. */
export function makeFakes(opts: FakeOptions = {}) {
  const channel: ChannelInfo = {
    id: "ch-1",
    orgId: "org-1",
    externalId: ACCOUNT_ID,
    username: "shop",
    status: "active",
    ...opts.channel,
  };
  const baseSettings: CommentDmSettings = {
    channelId: "ch-1",
    orgId: "org-1",
    enabled: true,
    linkUrl: "https://example.com/trial",
    defaultLanguage: "en",
    requireFollow: true,
    publicReplyEnabled: true,
    texts: {},
  };
  // Mutable so a test can change things between calls.
  const state: { settings: CommentDmSettings | null; follow: FollowResult; privateReplyError?: string } = {
    settings: opts.settings === null ? null : { ...baseSettings, ...opts.settings },
    follow: opts.follow ?? { ok: true, follows: true },
    privateReplyError: opts.privateReplyError,
  };
  const events = new Map<string, DmEvent>();
  const messages: InboxMessage[] = [];
  const sent: SentCall[] = [];
  let followChecks = 0;
  let nextEventId = 1;
  let nextMid = 1;

  const deps: CommentDmDeps = {
    store: {
      async getChannelByExternalId(externalId) {
        return externalId === channel.externalId ? channel : null;
      },
      async getChannelById(id) {
        return id === channel.id ? channel : null;
      },
      async getSettings() {
        return state.settings;
      },
      async claimEvent(input) {
        const existing = [...events.values()].find(
          (e) => e.channelId === input.channelId && e.mediaId === input.mediaId && e.commenterId === input.commenterId,
        );
        if (existing && existing.status !== "failed") return null;
        const event: DmEvent = existing
          ? { ...existing, commentId: input.commentId, language: input.language, status: "pending", error: null }
          : {
              id: `00000000-0000-4000-8000-${String(nextEventId++).padStart(12, "0")}`,
              orgId: input.orgId,
              channelId: input.channelId,
              mediaId: input.mediaId,
              commenterId: input.commenterId,
              commenterUsername: input.commenterUsername,
              commentId: input.commentId,
              recipientId: null,
              conversationId: null,
              language: input.language,
              status: "pending",
              tapCount: 0,
              error: null,
            };
        events.set(event.id, event);
        return event;
      },
      async getEvent(id) {
        return events.get(id) ?? null;
      },
      async updateEvent(id, patch) {
        const e = events.get(id);
        if (e) events.set(id, { ...e, ...patch });
      },
      async ensureConversation() {
        return "conv-1";
      },
      async logMessage(msg) {
        if (msg.platformMessageId && messages.some((m) => m.platformMessageId === msg.platformMessageId)) {
          return "duplicate";
        }
        messages.push(msg);
        return "inserted";
      },
    },
    meta: {
      async replyToComment(_channelId, commentId, text) {
        if (opts.publicReplyError) throw new Error(opts.publicReplyError);
        sent.push({ kind: "public", target: commentId, text });
      },
      async sendPrivateReply(_channelId, commentId, msg) {
        if (state.privateReplyError) throw new Error(state.privateReplyError);
        sent.push({ kind: "private", target: commentId, msg });
        return {
          messageId: `mid-${nextMid++}`,
          recipientId: opts.recipientId === null ? undefined : (opts.recipientId ?? "igsid-1"),
        };
      },
      async sendButtonMessage(_channelId, recipientId, msg) {
        if (opts.dmError) throw new Error(opts.dmError);
        sent.push({ kind: "dm", target: recipientId, msg });
        return { messageId: `mid-${nextMid++}` };
      },
      async checkFollows() {
        followChecks++;
        return state.follow;
      },
    },
  };

  return { deps, channel, state, events, messages, sent, followChecks: () => followChecks };
}

export function comment(over: Partial<CommentEvent> = {}): CommentEvent {
  return {
    accountId: ACCOUNT_ID,
    commentId: "c-1",
    mediaId: "media-1",
    commenterId: "commenter-1",
    commenterUsername: "sara",
    text: "I want it!",
    ...over,
  };
}

export function tap(payload: string, over: Partial<TapEvent> = {}): TapEvent {
  return {
    accountId: ACCOUNT_ID,
    senderId: "igsid-1",
    mid: "tap-1",
    title: "Send me the link",
    payload,
    ...over,
  };
}

/** The payload of a sent message's postback button, or null. */
export function payloadOf(msg: ButtonMessage | undefined): string | null {
  return msg?.button.type === "postback" ? msg.button.payload : null;
}
