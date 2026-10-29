"use client";

import { useEffect, useRef } from "react";
import { IconDots, focusRing } from "./ui";

/**
 * A `<details>` menu for the less frequent conversation actions. Closes on
 * Escape or a click outside; everything inside stays a plain server form.
 */
export function OverflowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        title={label}
        className={`btn-icon cursor-pointer list-none border border-slate-200 bg-white [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span aria-hidden="true" className="inline-flex">
          <IconDots className="h-4 w-4" />
        </span>
      </summary>
      <div className="absolute end-0 top-full z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        {children}
      </div>
    </details>
  );
}
