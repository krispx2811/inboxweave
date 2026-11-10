import type { CommentEvent, TapEvent } from "./types.ts";

/**
 * Reads Comment-to-DM events out of an Instagram webhook body. Pure.
 * Comments arrive as entry.changes[{ field: "comments" }]. Button taps arrive
 * as entry.messaging[].postback, or on newer payloads as
 * entry.changes[{ field: "messaging_postbacks" }].
 */

const PAYLOAD_PREFIX = "cdm:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodePayload(eventId: string): string {
  return `${PAYLOAD_PREFIX}${eventId}`;
}

/** The event id inside one of our button payloads, or null for anything else. */
export function decodePayload(payload: string | null | undefined): string | null {
  if (!payload || !payload.startsWith(PAYLOAD_PREFIX)) return null;
  const id = payload.slice(PAYLOAD_PREFIX.length);
  return UUID.test(id) ? id.toLowerCase() : null;
}

interface RawComment {
  id?: string | number;
  text?: unknown;
  from?: { id?: string | number; username?: string };
  media?: { id?: string | number };
}

interface RawMessaging {
  sender?: { id?: string | number };
  timestamp?: number;
  postback?: { mid?: string; title?: string; payload?: string };
}

interface RawEntry {
  id?: string | number;
  changes?: Array<{ field?: string; value?: unknown }>;
  messaging?: RawMessaging[];
  standby?: RawMessaging[];
}

function entriesOf(body: unknown): RawEntry[] {
  const entry = (body as { entry?: unknown } | null)?.entry;
  return Array.isArray(entry) ? (entry as RawEntry[]) : [];
}

export function parseCommentEvents(body: unknown): CommentEvent[] {
  const out: CommentEvent[] = [];
  for (const entry of entriesOf(body)) {
    if (entry.id == null) continue;
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      const v = change.value as RawComment;
      if (v.id == null || v.from?.id == null || v.media?.id == null) continue;
      out.push({
        accountId: String(entry.id),
        commentId: String(v.id),
        mediaId: String(v.media.id),
        commenterId: String(v.from.id),
        commenterUsername: v.from.username,
        text: typeof v.text === "string" ? v.text : "",
      });
    }
  }
  return out;
}

export function parseTapEvents(body: unknown): TapEvent[] {
  const out: TapEvent[] = [];
  for (const entry of entriesOf(body)) {
    if (entry.id == null) continue;
    const events: RawMessaging[] = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
    for (const change of entry.changes ?? []) {
      if (change.field === "messaging_postbacks" && change.value) events.push(change.value as RawMessaging);
    }
    for (const ev of events) {
      const postback = ev.postback;
      if (!postback?.payload || ev.sender?.id == null) continue;
      const senderId = String(ev.sender.id);
      out.push({
        accountId: String(entry.id),
        senderId,
        mid: postback.mid ?? `postback:${senderId}:${ev.timestamp ?? ""}`,
        title: postback.title ?? "",
        payload: postback.payload,
      });
    }
  }
  return out;
}
