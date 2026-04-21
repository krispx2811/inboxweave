"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { IconSend } from "@/components/icons";

interface ComposerProps {
  orgId: string;
  conversationId: string;
  send: (formData: FormData) => Promise<void>;
}

/**
 * Inbox composer. Uses the native Next.js 15 `<form action={serverAction}>`
 * pattern — the form element submits the action directly, ensuring the
 * server action is always invoked whether the user clicks Send or hits
 * Enter. Keeps an optimistic clear of the input on submit by resetting
 * the form in the button's onClick.
 */
export function Composer({ orgId, conversationId, send }: ComposerProps) {
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleAction(formData: FormData) {
    // Optimistic: clear the visible input right when the submit starts,
    // before the server round-trip completes.
    setText("");
    return send(formData);
  }

  return (
    <form
      ref={formRef}
      action={handleAction}
      className="flex flex-1 items-center gap-2"
    >
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <ComposerInput text={text} setText={setText} />
      <ComposerSubmit disabled={!text.trim()} />
    </form>
  );
}

function ComposerInput({ text, setText }: { text: string; setText: (v: string) => void }) {
  const { pending } = useFormStatus();
  return (
    <input
      className="input flex-1 !rounded-full !px-5"
      name="text"
      placeholder={pending ? "Sending..." : "Type a message..."}
      value={text}
      onChange={(e) => setText(e.target.value)}
      autoComplete="off"
      disabled={pending}
    />
  );
}

function ComposerSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn !rounded-full !p-3"
      aria-label="Send"
      disabled={pending || disabled}
    >
      <IconSend className="h-4 w-4" />
    </button>
  );
}
