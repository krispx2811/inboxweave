"use client";

import { useState } from "react";
import { IconClock } from "@/components/icons";
import { SubmitButton } from "./SubmitButton";
import { Deco, focusRing } from "./ui";

/**
 * `datetime-local` has no time zone, and the server runs in UTC, so convert
 * the picked local time to an ISO instant in the browser before sending.
 */
export function ScheduleForm({
  orgId,
  conversationId,
  action,
}: {
  orgId: string;
  conversationId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [iso, setIso] = useState("");
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scheduledAt" value={iso} />
      <label htmlFor="schedule-content" className="flex items-center gap-1 text-xs font-medium text-slate-700">
        <Deco icon={IconClock} className="h-3.5 w-3.5 text-indigo-600" /> Schedule a message
      </label>
      <textarea
        id="schedule-content"
        name="content"
        dir="auto"
        rows={2}
        className="input !text-sm"
        placeholder="Message to send later…"
        autoComplete="off"
        required
      />
      <label htmlFor="schedule-at" className="sr-only">Send at</label>
      <input
        id="schedule-at"
        type="datetime-local"
        className="input !text-sm"
        required
        onChange={(e) => {
          const d = new Date(e.target.value);
          setIso(Number.isNaN(d.getTime()) ? "" : d.toISOString());
        }}
      />
      <SubmitButton className={`btn-ghost btn-sm ${focusRing}`} pendingLabel="Scheduling…">
        Schedule
      </SubmitButton>
    </form>
  );
}
