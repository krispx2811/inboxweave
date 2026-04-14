"use client";

import { useEffect, useState } from "react";

interface TooltipProps {
  id: string;
  children: React.ReactNode;
  message: string;
  /** Priority — lower numbers show first. Only one tooltip shows at a time. */
  priority?: number;
}

// Global store for active tooltip coordination.
let globalActiveTooltip: string | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const s of subscribers) s();
}

export function OnboardingTooltip({ id, children, message, priority = 0 }: TooltipProps) {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    const key = `tooltip_dismissed_${id}`;
    const isDismissed = Boolean(localStorage.getItem(key));
    setDismissed(isDismissed);

    // Claim active slot if this tooltip has highest priority among un-dismissed.
    if (!isDismissed) {
      const current = globalActiveTooltip;
      if (!current) {
        globalActiveTooltip = `${priority}-${id}`;
        notify();
      } else {
        const [curPri] = current.split("-");
        if (priority < Number(curPri)) {
          globalActiveTooltip = `${priority}-${id}`;
          notify();
        }
      }
    }

    const sub = () => force((n) => n + 1);
    subscribers.add(sub);
    return () => { subscribers.delete(sub); };
  }, [id, priority]);

  function dismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem(`tooltip_dismissed_${id}`, "1");
    setDismissed(true);
    globalActiveTooltip = null;
    notify();
  }

  const isActive = !dismissed && globalActiveTooltip === `${priority}-${id}`;

  if (!isActive) return <>{children}</>;

  return (
    <div className="relative">
      {children}
      <span className="absolute top-1/2 right-2 -translate-y-1/2 flex h-2 w-2 z-10 pointer-events-none">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
      </span>
      <div
        className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50"
        onClick={dismiss}
        role="button"
      >
        <div className="relative rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg w-[180px] cursor-pointer leading-relaxed">
          {/* Arrow */}
          <span className="absolute top-1/2 -left-1 -translate-y-1/2 h-2 w-2 rotate-45 bg-slate-900" />
          {message}
        </div>
      </div>
    </div>
  );
}
