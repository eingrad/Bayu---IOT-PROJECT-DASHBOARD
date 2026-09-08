// ====================================================================
//  Unit definitions & conversion — shared by the report endpoints.
//
//  NATIVE = the unit each value is actually stored in (what the sensor
//  writes to the database). If the hardware reports a different base
//  unit, change the matching NATIVE entry and everything downstream
//  (dashboard + reports) stays correct.
//
//  DEFAULT_UNIT = the unit shown when the user has not picked one.
// ====================================================================

const NATIVE = {
  pm25: "µg/m³",
  pm10: "µg/m³",
  tsp: "µg/m³",
  // Gas sensors report CO in ppm and SO2/O3/NO2 in ppb (see BAYU_SENSE reader).
  co: "ppm",
  so2: "ppb",
  o3: "ppb",
  no2: "ppb",
  temperature: "°C",
  humidity: "% RH",
  pressure: "hPa",
};

const DEFAULT_UNIT = {
  pm25: "µg/m³",
  pm10: "µg/m³",
  tsp: "µg/m³",
  co: "ppm",
  so2: "ppb",
  o3: "ppb",
  no2: "ppb",
  temperature: "°C",
  humidity: "% RH",
  pressure: "hPa",
};

// Molecular weights (g/mol) used for gas ppb/ppm <-> µg/m³.
const MW = { co: 28.01, so2: 64.07, o3: 48.0, no2: 46.01 };
const MOLAR_VOLUME = 24.45; // L/mol at 25 °C, 1 atm
const GASES = ["co", "so2", "o3", "no2"];
const PM = ["pm25", "pm10", "tsp"];

function round(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return n;
  const f = Math.pow(10, d);
  return Math.round(Number(n) * f) / f;
}

// Absolute humidity (g/m³) from relative humidity (%) and temperature (°C).
function absoluteHumidity(rh, tempC) {
  const t = tempC === null || tempC === undefined ? 25 : Number(tempC);
  return (
    (6.112 * Math.exp((17.67 * t) / (t + 243.5)) * Number(rh) * 2.1674) /
    (273.15 + t)
  );
}

// Convert a stored (native-unit) value into the chosen display unit.
// ctx.temperature (°C) is used for absolute-humidity conversion.
function convert(field, value, toUnit, ctx = {}) {
  if (value === null || value === undefined || isNaN(value)) return value;
  const v = Number(value);
  const native = NATIVE[field];
  if (!native || !toUnit || toUnit === native) return round(v);

  // Gases — convert the stored value to ppb (canonical), then to the target.
  if (GASES.includes(field)) {
    const mw = MW[field];
    let ppb;
    if (native === "ppm") ppb = v * 1000;
    else if (native === "µg/m³") ppb = (v * MOLAR_VOLUME) / mw;
    else ppb = v; // native already ppb
    if (toUnit === "ppb") return round(ppb);
    if (toUnit === "ppm") return round(ppb / 1000, 4);
    if (toUnit === "µg/m³") return round((ppb * mw) / MOLAR_VOLUME);
    return round(v);
  }

  // Particulate matter — only µg/m³ is physical; ppb/ppm have no standard
  // conversion, so the value is shown unchanged under the chosen label.
  if (PM.includes(field)) return round(v);

  if (field === "temperature") {
    if (toUnit === "°F") return round((v * 9) / 5 + 32);
    if (toUnit === "K") return round(v + 273.15);
    return round(v);
  }

  if (field === "humidity") {
    if (toUnit === "g/m³") return round(absoluteHumidity(v, ctx.temperature));
    return round(v);
  }

  if (field === "pressure") {
    if (toUnit === "kPa") return round(v / 10);
    if (toUnit === "mmHg") return round(v * 0.7500617);
    if (toUnit === "inHg") return round(v * 0.02953);
    return round(v);
  }

  return round(v);
}

// The display unit for a field, given the user's saved preferences map.
function unitFor(prefs, field) {
  if (field === "wind_speed") return "m/s";
  if (field === "wind_direction") return "°";
  const chosen = prefs && prefs[field];
  return chosen || DEFAULT_UNIT[field] || "";
}

module.exports = { NATIVE, DEFAULT_UNIT, convert, unitFor };
