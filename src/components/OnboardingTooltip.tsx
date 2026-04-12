"use client";

import { useEffect, useState } from "react";

interface TooltipProps {
  id: string;
  children: React.ReactNode;
  message: string;
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * Pulsing tooltip shown once per user (tracked in localStorage).
 * Dismisses on click. Use `id` to make each tooltip unique.
 */
export function OnboardingTooltip({ id, children, message, position = "bottom" }: TooltipProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const key = `tooltip_dismissed_${id}`;
    if (!localStorage.getItem(key)) setShow(true);
  }, [id]);

  function dismiss() {
    setShow(false);
    localStorage.setItem(`tooltip_dismissed_${id}`, "1");
  }

  const posClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-block">
      {children}
      {show && (
        <>
          {/* Pulse ring */}
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-500" />
          </span>
          {/* Tooltip */}
          <div
            className={`absolute z-50 ${posClasses[position]} animate-in`}
            onClick={dismiss}
          >
            <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs text-white shadow-xl max-w-[220px] cursor-pointer">
              {message}
              <div className="mt-1 text-[10px] text-slate-400">Click to dismiss</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
