"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSend } from "@/components/icons";

interface ComposerProps {
  orgId: string;
  conversationId: string;
  send: (formData: FormData) => Promise<void>;
}

/**
 * Controlled chat input with:
 * - Immediate clearing of the field on submit (doesn't wait for server)
 * - Button disabled while sending, to prevent double-submit
 * - Key guard against Enter firing while already sending
 * - router.refresh() after the action to pick up the server-persisted row
 *
 * Realtime will also refresh soon after the DB insert, so this gives a
 * smooth experience — the field clears instantly, the message appears
 * within a couple hundred ms, and the user can type their next line.
 */
export function Composer({ orgId, conversationId, send }: ComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const router = useRouter();

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setError(null);

    // Clear the input immediately — optimistic UX.
    setText("");

    const form = new FormData();
    form.set("orgId", orgId);
    form.set("conversationId", conversationId);
    form.set("text", value);

    startTransition(async () => {
      try {
        await send(form);
        router.refresh();
      } catch (err) {
        // Surface errors so silent failures don't look like "nothing happened".
        // NEXT_REDIRECT is a framework signal, not a real error — ignore.
        const msg = (err as Error)?.message ?? String(err);
        if (!msg.includes("NEXT_REDIRECT")) {
          console.error("[Composer] send failed", err);
          setError(msg);
          setText(value); // Restore text so user can retry / copy.
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter sends; Shift+Enter would be a newline (but this is single-line).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex-1">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          className="input flex-1 !rounded-full !px-5"
          placeholder={isPending ? "Sending..." : "Type a message..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          disabled={isPending}
        />
        <button
          type="submit"
          className="btn !rounded-full !p-3"
          aria-label="Send"
          disabled={isPending || !text.trim()}
        >
          <IconSend className="h-4 w-4" />
        </button>
      </form>
      {error && (
        <div className="mt-1 text-xs text-red-600 truncate" title={error}>
          Send failed: {error}
        </div>
      )}
    </div>
  );
}
