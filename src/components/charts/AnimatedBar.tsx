"use client";

import { useEffect, useRef, useState } from "react";

interface BarProps {
  values: { label: string; value: number; color?: string }[];
  height?: number;
}

/**
 * CSS-only animated bar chart. Bars grow from 0 to their target height
 * when they enter the viewport.
 */
export function AnimatedBarChart({ values, height = 128 }: BarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const max = Math.max(...values.map((v) => v.value), 1);

  return (
    <div ref={ref} className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => {
        const pct = (v.value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className={`w-full rounded-t transition-all duration-700 ease-out ${v.color ?? "bg-indigo-500"}`}
              style={{
                height: visible ? `${Math.max(pct, 3)}%` : "0%",
                transitionDelay: `${i * 30}ms`,
              }}
            />
            {v.label && (
              <span className="text-[8px] text-slate-400 truncate w-full text-center">{v.label}</span>
            )}
            {/* Hover tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block rounded bg-slate-900 px-2 py-1 text-[10px] text-white whitespace-nowrap z-10">
              {v.value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
