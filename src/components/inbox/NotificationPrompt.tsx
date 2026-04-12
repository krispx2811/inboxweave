"use client";

import { useEffect, useState } from "react";
import { IconBell } from "@/components/icons";

export function NotificationPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      setShow(true);
    }
  }, []);

  async function requestPermission() {
    const perm = await Notification.requestPermission();
    setShow(false);
    if (perm === "granted") {
      new Notification("InboxWeave", { body: "You'll be notified of new messages." });
    }
  }

  if (!show) return null;

  return (
    <div className="mx-4 mb-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
      <IconBell className="h-4 w-4 shrink-0" />
      <span className="flex-1">Enable notifications to get alerted when new messages arrive.</span>
      <button onClick={requestPermission} className="font-semibold hover:underline">Enable</button>
      <button onClick={() => setShow(false)} className="text-indigo-400 hover:text-indigo-600">&times;</button>
    </div>
  );
}
