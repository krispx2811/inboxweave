"use client";

import { useNow } from "./useNow";
import { fullDateTime, relativeTime } from "./time";

/**
 * "5m", "3h", "Oct 12". The server and the hydration pass both measure from
 * `serverNow` without a time zone, so their markup matches; after hydration
 * it switches to the browser's clock and zone and ticks every minute.
 */
export function RelativeTime({ iso, serverNow, className }: { iso: string; serverNow: number; className?: string }) {
  const now = useNow();
  const label = now ? relativeTime(iso, now, true) : relativeTime(iso, serverNow, false);
  return (
    <time dateTime={iso} title={now ? fullDateTime(iso) : undefined} className={className}>
      {label}
    </time>
  );
}
