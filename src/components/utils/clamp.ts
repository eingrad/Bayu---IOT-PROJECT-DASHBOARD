// Display-only flooring of sensor readings.
//
// Air-quality sensors (gas + particulate) commonly read slightly below zero at
// a clean baseline because of electrode/calibration drift. A negative
// concentration is physically meaningless, so for DISPLAY we floor every
// reading at 0.
//
// EXCEPTION: temperature can be genuinely negative (cold weather), so it is
// never clamped.
//
// This is display-only — the raw values are left untouched in the database.

/** True for any field whose name refers to temperature (e.g. "temperature", "Temperature"). */
export function isTemperatureKey(key: string): boolean {
  return /temp/i.test(key);
}

/**
 * Floor a single numeric reading at 0, unless its field is temperature.
 * Non-finite values (null/undefined/NaN) pass through unchanged.
 */
export function clampDisplay(key: string, value: number): number {
  if (isTemperatureKey(key)) return value;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : value;
}

/**
 * Return a shallow copy of a flat telemetry object with every numeric field
 * floored at 0, temperature excluded. Used at the socket boundary so every
 * live card and chart receives already-clamped values.
 */
export function clampReadings<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "number" && Number.isFinite(v) && !isTemperatureKey(key)) {
      out[key] = Math.max(0, v);
    }
  }
  return out as T;
}
