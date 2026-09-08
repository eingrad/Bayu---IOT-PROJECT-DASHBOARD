import type { ReactNode } from "react";

// 4-tier air-quality status.
// Status colors are RESERVED (good / moderate / unhealthy / hazardous) and are
// always shipped with a text label + dot — identity is never carried by color
// alone, so the card stays readable for colour-blind users and in print.
const STATUS = [
  {
    label: "Good",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  {
    label: "Moderate",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  {
    label: "Unhealthy",
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  },
  {
    label: "Hazardous",
    text: "text-purple-600 dark:text-purple-400",
    bar: "bg-purple-600",
    dot: "bg-purple-600",
    badge:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  },
];

// [good ceiling, moderate ceiling, unhealthy ceiling] — above the last = hazardous
export type Thresholds = [number, number, number];

export function statusIndex(value: number, [t0, t1, t2]: Thresholds): number {
  if (value <= t0) return 0;
  if (value <= t1) return 1;
  if (value <= t2) return 2;
  return 3;
}

export type AirStatCardProps = {
  formula: ReactNode; // e.g. "CO", "SO₂", "PM2.5"
  name: string; // "Carbon Monoxide"
  note?: string; // short descriptor
  value: number;
  unit: string;
  thresholds: Thresholds;
  max: number; // full scale for the level meter
  showMeter?: boolean; // set false to hide the level bar under the value
};

export default function AirStatCard({
  formula,
  name,
  note,
  value,
  unit,
  thresholds,
  max,
  showMeter = true,
}: AirStatCardProps) {
  const s = STATUS[statusIndex(value, thresholds)];
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const shown = Math.round(value * 10) / 10;

  return (
    <div className="flex flex-col bg-white dark:bg-white/[0.03] shadow-sm p-5 border border-gray-200 dark:border-gray-800 rounded-2xl">
      {/* Header: formula badge + status pill */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-3">
          <div
            className={`flex justify-center items-center w-11 h-11 rounded-xl font-bold text-sm leading-none ${s.badge}`}
          >
            {formula}
          </div>
          <div>
            <div className="font-semibold text-gray-800 dark:text-white/90 text-sm leading-tight">
              {name}
            </div>
            {note && (
              <div className="text-gray-400 text-xs leading-tight">{note}</div>
            )}
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium text-xs whitespace-nowrap ${s.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1 mt-4">
        <span className={`font-bold text-3xl tabular-nums ${s.text}`}>
          {shown}
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-sm">{unit}</span>
      </div>

      {/* Level meter */}
      {showMeter && (
        <div className="mt-3 bg-gray-100 dark:bg-gray-800 rounded-full w-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${s.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
