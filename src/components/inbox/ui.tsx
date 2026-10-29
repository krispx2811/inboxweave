import type { ComponentType } from "react";

/** Visible keyboard focus for links and buttons that don't get one from globals.css. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/** Small pill used for filters and quick replies. */
export const chipClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors";

/** A decorative icon, hidden from screen readers. */
export function Deco({ icon: Icon, className }: { icon: ComponentType<{ className?: string }>; className?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <Icon className={className} />
    </span>
  );
}

export function IconDots({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function IconPin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className={className}>
      <path d="M15.5 3.5a1 1 0 0 0-1.6.3l-1.6 3.3-3.7 1.1a1 1 0 0 0-.4 1.7l2.6 2.6-4.5 4.5a.75.75 0 1 0 1 1l4.5-4.5 2.6 2.6a1 1 0 0 0 1.7-.4l1.1-3.7 3.3-1.6a1 1 0 0 0 .3-1.6l-5.3-5.3z" />
    </svg>
  );
}

export function IconMessenger({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className={className}>
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.99-.88a.8.8 0 0 1 .53-.04c.91.25 1.88.39 2.9.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46-2.93 4.67a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63z" />
    </svg>
  );
}
