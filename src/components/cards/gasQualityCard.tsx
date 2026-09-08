import { useEffect, useState } from "react";
import {
  startSensorSocket,
  subscribeToSensorData,
} from "../utils/sensorSocket";
import AirStatCard, { type Thresholds } from "./airStatCard";

type GasKey = "co" | "so2" | "o3" | "no2";

// Thresholds follow US EPA AQI breakpoints. Units differ by gas (CO in ppm,
// others in ppb) — adjust `unit`, `thresholds` and `max` to match your sensor.
const GASES: {
  key: GasKey;
  formula: string;
  name: string;
  note: string;
  unit: string;
  thresholds: Thresholds;
  max: number;
  aliases: string[]; // possible payload keys from the device
}[] = [
  {
    key: "co",
    formula: "CO",
    name: "Carbon Monoxide",
    note: "Combustion gas",
    unit: "ppm",
    thresholds: [4.4, 9.4, 12.4],
    max: 15,
    aliases: ["co", "CO", "carbon_monoxide"],
  },
  {
    key: "so2",
    formula: "SO₂",
    name: "Sulfur Dioxide",
    note: "Industrial emissions",
    unit: "ppb",
    thresholds: [35, 75, 185],
    max: 200,
    aliases: ["so2", "SO2", "sulfur_dioxide"],
  },
  {
    key: "o3",
    formula: "O₃",
    name: "Ozone",
    note: "Ground-level ozone",
    unit: "ppb",
    thresholds: [54, 70, 85],
    max: 100,
    aliases: ["o3", "O3", "ozone"],
  },
  {
    key: "no2",
    formula: "NO₂",
    name: "Nitrogen Dioxide",
    note: "Traffic & burning",
    unit: "ppb",
    thresholds: [53, 100, 360],
    max: 400,
    aliases: ["no2", "NO2", "nitrogen_dioxide"],
  },
];

function pick(payload: any, aliases: string[]): number | undefined {
  for (const k of aliases) {
    const v = payload?.[k];
    if (v !== undefined && v !== null && !isNaN(parseFloat(v))) {
      return parseFloat(v);
    }
  }
  return undefined;
}

export default function GasQualityCardGroup() {
  const [values, setValues] = useState<Record<GasKey, number>>({
    co: 0,
    so2: 0,
    o3: 0,
    no2: 0,
  });

  useEffect(() => {
    startSensorSocket();
    const unsubscribe = subscribeToSensorData((payload) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const g of GASES) {
          const v = pick(payload, g.aliases);
          if (v !== undefined) next[g.key] = v;
        }
        return next;
      });
    });
    return () => unsubscribe();
  }, []);

  return (
    <section className="mx-auto mt-8 px-4 container">
      <div className="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {GASES.map((g) => (
          <AirStatCard
            key={g.key}
            formula={g.formula}
            name={g.name}
            note={g.note}
            value={values[g.key]}
            unit={g.unit}
            thresholds={g.thresholds}
            max={g.max}
            showMeter={false}
          />
        ))}
      </div>
    </section>
  );
}
