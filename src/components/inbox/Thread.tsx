"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { IconNote, IconPhoto, IconSparkle } from "@/components/icons";
import { RichText } from "./RichText";
import { useNow } from "./useNow";
import { clockTime, dayKey, dayLabel, fullDateTime } from "./time";
import { Deco, focusRing } from "./ui";

export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  sender: "contact" | "ai" | "human";
  content: string;
  createdAt: string;
  mediaUrl: string | null;
  mediaType: string | null;
  /** Who on the team sent it: "You", a teammate, or null for AI/customer. */
  author: string | null;
}

export interface ThreadNote {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

type Item = ({ kind: "message" } & ThreadMessage) | ({ kind: "note" } & ThreadNote);

const GROUP_GAP_MS = 5 * 60_000;

function who(item: Item): string {
  if (item.kind === "note") return "note";
  if (item.sender === "human") return `human:${item.author ?? ""}`;
  return item.sender;
}

/**
 * Messages and internal notes in time order. Rendered in the browser so
 * times and the Today / Yesterday separators use the viewer's time zone
 * (the server is UTC, the clinics are UTC+4). The scroller is
 * column-reversed so it opens at the newest message even before hydration.
 */
export function Thread({
  messages,
  notes,
  earlierHref,
}: {
  messages: ThreadMessage[];
  notes: ThreadNote[];
  /** Set when older messages exist beyond the loaded page. */
  earlierHref: string | null;
}) {
  const now = useNow();
  const hydrated = now !== 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
    ...notes.map((n) => ({ kind: "note" as const, ...n })),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const newestId = items.at(-1)?.id;

  // Jump to the newest message on open and whenever a new one arrives.
  // Loading earlier messages keeps the same newest id, so it doesn't jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, hydrated]);

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain">
      <div role="log" aria-label="Messages" className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
        {earlierHref && (
          <div className="mb-4 text-center">
            <Link
              href={earlierHref}
              scroll={false}
              className={`inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 ${focusRing}`}
            >
              Load earlier messages
            </Link>
          </div>
        )}
        {items.length === 0 && <p className="py-16 text-center text-sm text-slate-500">No messages yet.</p>}
        {items.map((item, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const newDay = hydrated && (!prev || dayKey(prev.createdAt) !== dayKey(item.createdAt));
          const startsGroup =
            !prev || newDay || who(prev) !== who(item) || Date.parse(item.createdAt) - Date.parse(prev.createdAt) > GROUP_GAP_MS;
          const endsGroup =
            !next ||
            (hydrated && dayKey(next.createdAt) !== dayKey(item.createdAt)) ||
            who(next) !== who(item) ||
            Date.parse(next.createdAt) - Date.parse(item.createdAt) > GROUP_GAP_MS;
          return (
            <Fragment key={`${item.kind}:${item.id}`}>
              {newDay && (
                <div className="my-4 flex items-center gap-3 text-[11px] font-medium text-slate-500">
                  <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
                  {dayLabel(item.createdAt, now)}
                  <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              {item.kind === "note" ? (
                <NoteCard note={item} hydrated={hydrated} />
              ) : (
                <Bubble message={item} startsGroup={startsGroup} endsGroup={endsGroup} hydrated={hydrated} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function Bubble({
  message: m,
  startsGroup,
  endsGroup,
  hydrated,
}: {
  message: ThreadMessage;
  startsGroup: boolean;
  endsGroup: boolean;
  hydrated: boolean;
}) {
  const out = m.direction === "out";
  const ai = out && m.sender === "ai";
  const tone = !out
    ? "border border-slate-200 bg-white text-slate-900 rounded-bl-md"
    : ai
      ? "bg-indigo-600 text-white rounded-br-md"
      : "bg-slate-800 text-white rounded-br-md";
  const speaker = !out ? "Customer" : ai ? "AI" : (m.author ?? "Team");
  return (
    <div className={`flex flex-col ${out ? "items-end" : "items-start"} ${startsGroup ? "mt-3" : "mt-1"}`}>
      {startsGroup && out && (
        <span className={`mb-1 flex items-center gap-1 px-1 text-[11px] font-medium ${ai ? "text-indigo-700" : "text-slate-600"}`}>
          {ai && <Deco icon={IconSparkle} className="h-3 w-3" />}
          {speaker}
        </span>
      )}
      <span className="sr-only">{speaker}:</span>
      {m.mediaUrl &&
        (m.mediaType === "image" ? (
          <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className={`mb-1 block rounded-xl ${focusRing}`}>
            {/* Platform CDN media, not worth routing through next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.mediaUrl}
              alt={out ? "Sent image" : "Image from the customer"}
              width={240}
              height={180}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-auto max-h-80 w-60 max-w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
            />
          </a>
        ) : (
          <a
            href={m.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-slate-50 ${focusRing}`}
          >
            <Deco icon={IconPhoto} className="h-4 w-4" /> Open {m.mediaType ?? "attachment"}
          </a>
        ))}
      {m.content.trim() && (
        <div dir="auto" className={`max-w-[85%] break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[75%] ${tone}`}>
          <RichText text={m.content} />
        </div>
      )}
      {endsGroup && (
        <time
          dateTime={m.createdAt}
          title={hydrated ? fullDateTime(m.createdAt) : undefined}
          className="mt-1 px-1 text-[11px] tabular-nums text-slate-500"
        >
          {hydrated ? clockTime(m.createdAt) : " "}
        </time>
      )}
    </div>
  );
}

function NoteCard({ note, hydrated }: { note: ThreadNote; hydrated: boolean }) {
  return (
    <div className="mx-auto my-3 w-full max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-amber-800">
        <Deco icon={IconNote} className="h-3.5 w-3.5" />
        Internal note · <span dir="auto">{note.author}</span>
        {hydrated && (
          <>
            {" · "}
            <time dateTime={note.createdAt} className="tabular-nums">{fullDateTime(note.createdAt)}</time>
          </>
        )}
      </div>
      <p dir="auto" className="mt-0.5 whitespace-pre-wrap break-words text-sm text-amber-950">
        {note.content}
      </p>
    </div>
  );
}
