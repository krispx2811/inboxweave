"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Tiny inline SVG sparkline chart. No dependencies.
 * Pass an array of numbers (e.g. last 7 days of values).
 */
export function Sparkline({ data, width = 60, height = 20, color = "#6366f1", className }: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const trend = data[data.length - 1]! >= data[0]! ? "up" : "down";

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <svg width={width} height={height} className="shrink-0">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot at the end */}
        <circle
          cx={parseFloat(points[points.length - 1]!.split(",")[0]!)}
          cy={parseFloat(points[points.length - 1]!.split(",")[1]!)}
          r="2"
          fill={color}
        />
      </svg>
      <span className={`text-[10px] font-semibold ${trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
        {trend === "up" ? "+" : ""}{Math.round(((data[data.length - 1]! - data[0]!) / (data[0]! || 1)) * 100)}%
      </span>
    </div>
  );
}
