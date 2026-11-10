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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Entries that are objects with an id; anything else is skipped. */
function entriesOf(body: unknown): RawEntry[] {
  const entry = isObject(body) ? body.entry : undefined;
  if (!Array.isArray(entry)) return [];
  return entry.filter((e): e is RawEntry => isObject(e) && e.id != null);
}

function objectsIn(list: unknown): Array<Record<string, unknown>> {
  return Array.isArray(list) ? list.filter(isObject) : [];
}

export function parseCommentEvents(body: unknown): CommentEvent[] {
  const out: CommentEvent[] = [];
  for (const entry of entriesOf(body)) {
    for (const change of objectsIn(entry.changes) as Array<{ field?: string; value?: unknown }>) {
      if (change.field !== "comments" || !isObject(change.value)) continue;
      const v = change.value as RawComment;
      if (v.id == null || !isObject(v.from) || v.from.id == null || !isObject(v.media) || v.media.id == null) continue;
      out.push({
        accountId: String(entry.id),
        commentId: String(v.id),
        mediaId: String(v.media.id),
        commenterId: String(v.from.id),
        commenterUsername: typeof v.from.username === "string" ? v.from.username : undefined,
        text: typeof v.text === "string" ? v.text : "",
      });
    }
  }
  return out;
}

export function parseTapEvents(body: unknown): TapEvent[] {
  const out: TapEvent[] = [];
  for (const entry of entriesOf(body)) {
    const events = [...objectsIn(entry.messaging), ...objectsIn(entry.standby)] as RawMessaging[];
    for (const change of objectsIn(entry.changes) as Array<{ field?: string; value?: unknown }>) {
      if (change.field === "messaging_postbacks" && isObject(change.value)) events.push(change.value as RawMessaging);
    }
    for (const ev of events) {
      const postback = ev.postback;
      if (!isObject(postback) || typeof postback.payload !== "string" || !postback.payload) continue;
      if (!isObject(ev.sender) || ev.sender.id == null) continue;
      const senderId = String(ev.sender.id);
      const mid =
        (typeof postback.mid === "string" && postback.mid) ||
        (ev.timestamp != null ? `postback:${senderId}:${ev.timestamp}` : "");
      // Without a mid or a timestamp every tap would share one dedupe key.
      if (!mid) continue;
      out.push({
        accountId: String(entry.id),
        senderId,
        mid,
        title: typeof postback.title === "string" ? postback.title : "",
        payload: postback.payload,
      });
    }
  }
  return out;
}
