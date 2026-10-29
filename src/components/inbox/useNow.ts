"use client";

import { useSyncExternalStore } from "react";

// One shared minute ticker for every time label on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 60_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Stable within a minute, as useSyncExternalStore requires.
const getSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const getServerSnapshot = () => 0;

/**
 * The current time, to the minute, in the browser. Returns 0 on the server
 * and during hydration, so callers render zone-independent markup first and
 * switch to local times right after.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
