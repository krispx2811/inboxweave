"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that shows it's working while its form's server action
 * runs, so slow actions (AI summary, suggestions) don't look ignored.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  name,
  value,
  ariaLabel,
  title,
  onClick,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  ariaLabel?: string;
  title?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      aria-label={ariaLabel}
      title={title}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={onClick}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
