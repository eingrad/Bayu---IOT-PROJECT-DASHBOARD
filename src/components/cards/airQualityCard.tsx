import { useEffect, useState } from "react";
import {
  startSensorSocket,
  subscribeToSensorData,
} from "../utils/sensorSocket";
import AirStatCard, { type Thresholds } from "./airStatCard";

type PmKey = "pm25" | "pm10" | "tsp";

const PARTICULATES: {
  key: PmKey;
  formula: string;
  name: string;
  note: string;
  unit: string;
  thresholds: Thresholds;
  max: number;
}[] = [
  {
    key: "pm25",
    formula: "PM2.5",
    name: "PM2.5",
    note: "Fine airborne particles",
    unit: "µg/m³",
    thresholds: [12, 35.4, 55.4],
    max: 150,
  },
  {
    key: "pm10",
    formula: "PM10",
    name: "PM10",
    note: "Inhalable dust particles",
    unit: "µg/m³",
    thresholds: [54, 154, 254],
    max: 424,
  },
  {
    key: "tsp",
    formula: "TSP",
    name: "TSP",
    note: "Total suspended particulates",
    unit: "µg/m³",
    thresholds: [100, 200, 300],
    max: 500,
  },
];

export default function AirQualityCardGroup() {
  const [values, setValues] = useState<Record<PmKey, number>>({
    pm25: 0,
    pm10: 0,
    tsp: 0,
  });

  useEffect(() => {
    startSensorSocket();
    const unsubscribe = subscribeToSensorData((payload, topic) => {
      if (topic !== "v1/devices/me/telemetry2") return;
      setValues((prev) => ({
        pm25: payload.pm25 != null ? parseFloat(payload.pm25) : prev.pm25,
        pm10: payload.pm10 != null ? parseFloat(payload.pm10) : prev.pm10,
        tsp: payload.tsp != null ? parseFloat(payload.tsp) : prev.tsp,
      }));
    });
    return () => unsubscribe();
  }, []);

  return (
    <section className="mx-auto mt-8 px-4 container">
      <div className="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {PARTICULATES.map((p) => (
          <AirStatCard
            key={p.key}
            formula={p.formula}
            name={p.name}
            note={p.note}
            value={values[p.key]}
            unit={p.unit}
            thresholds={p.thresholds}
            max={p.max}
            showMeter={false}
          />
        ))}
      </div>
    </section>
  );
}
