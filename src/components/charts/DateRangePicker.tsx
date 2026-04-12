"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [
  { label: "7d", value: "7" },
  { label: "14d", value: "14" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
];

export function DateRangePicker({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("days") ?? "14";

  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {RANGES.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => router.push(`${basePath}?days=${value}`)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            current === value
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
