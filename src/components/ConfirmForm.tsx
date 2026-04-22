"use client";

import type { FormHTMLAttributes, PropsWithChildren } from "react";

interface ConfirmFormProps extends FormHTMLAttributes<HTMLFormElement> {
  /** Prompt shown to the user. If they cancel, submission is aborted. */
  confirm: string;
}

/**
 * Thin wrapper around <form> that intercepts submit with a window.confirm()
 * prompt. Used for destructive actions (delete channel, delete knowledge
 * doc, remove member, etc.) so an accidental click can't wipe data.
 */
export function ConfirmForm({
  confirm,
  children,
  onSubmit,
  ...rest
}: PropsWithChildren<ConfirmFormProps>) {
  return (
    <form
      {...rest}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onSubmit?.(e);
      }}
    >
      {children}
    </form>
  );
}
