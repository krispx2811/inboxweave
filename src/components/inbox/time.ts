/**
 * Time labels for the inbox. The server renders in UTC but the clinics are in
 * Oman (UTC+4), so anything that depends on the time zone is only shown once
 * the browser has hydrated. `local: false` gives a zone-independent label for
 * the server render and hydration pass, so both produce the same markup.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age for the conversation list: "now", "5m", "3h", "2d", then a date. */
export function relativeTime(iso: string, nowMs: number, local = true): string {
  const then = new Date(iso);
  const diff = nowMs - then.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  const sameYear = new Date(nowMs).getFullYear() === then.getFullYear();
  return new Intl.DateTimeFormat(local ? undefined : "en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    ...(local ? {} : { timeZone: "UTC" }),
  }).format(then);
}

/** Calendar day in the viewer's zone, for grouping messages. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday" or a short date, for the separators in a thread. */
export function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const today = new Date(nowMs);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(d);
}

/** Local clock time of a message, e.g. "3:42 PM". */
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Full local date and time, for tooltips. */
export function fullDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
