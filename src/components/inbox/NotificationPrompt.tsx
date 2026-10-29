"use client";

import { useState, useSyncExternalStore } from "react";
import { IconBell } from "@/components/icons";

// Permission only changes through requestPermission below, so there's nothing to subscribe to.
const noSubscribe = () => () => {};
const canAsk = () => "Notification" in window && Notification.permission === "default";

export function NotificationPrompt() {
  const askable = useSyncExternalStore(noSubscribe, canAsk, () => false);
  const [dismissed, setDismissed] = useState(false);

  async function requestPermission() {
    const perm = await Notification.requestPermission();
    setDismissed(true);
    if (perm === "granted") {
      new Notification("InboxWeave", { body: "You'll be notified of new messages." });
    }
  }

  if (!askable || dismissed) return null;

  return (
    <div className="mx-4 my-2 flex shrink-0 items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
      <span aria-hidden="true" className="inline-flex shrink-0">
        <IconBell className="h-4 w-4" />
      </span>
      <span className="flex-1">Turn on notifications to hear about new messages while this tab is in the background.</span>
      <button type="button" onClick={requestPermission} className="rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Turn on</button>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="rounded px-1 text-base leading-none text-indigo-600 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">&times;</button>
    </div>
  );
}
