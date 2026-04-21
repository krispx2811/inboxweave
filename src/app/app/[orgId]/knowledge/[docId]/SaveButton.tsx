"use client";

import { useFormStatus } from "react-dom";

export function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
