"use client";

import { useSyncExternalStore } from "react";

/*
 * "Last active" as relative time, computed in the browser so "today" and the
 * clock time follow the user's own zone (UTC+4 in Oman) rather than the
 * server's UTC. The server renders an empty <time>; the first client render
 * after hydration fills it in. One shared minute ticker serves every row.
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 60_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const currentMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

// Fixed English locale so the labels match the rest of the (English) UI.
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fullDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const titleFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatLastActive(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return timeFmt.format(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayFmt.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayMonthFmt.format(date);
  return fullDateFmt.format(date);
}

export function RelativeTime({ iso, className }: { iso: string | null; className?: string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  const date = iso ? new Date(iso) : null;
  const valid = date !== null && !Number.isNaN(date.getTime());
  const ready = minute !== null && valid;
  return (
    <time
      dateTime={valid ? iso! : undefined}
      title={ready ? titleFmt.format(date) : undefined}
      className={className}
      suppressHydrationWarning
    >
      {ready ? formatLastActive(date, new Date(minute * 60_000)) : valid ? "" : "–"}
    </time>
  );
}
