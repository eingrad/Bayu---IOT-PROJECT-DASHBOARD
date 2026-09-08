import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { Layout, PlotData } from "plotly.js";
import {
  startSensorSocket,
  subscribeToSensorData,
} from "../utils/sensorSocket";

const directionSet = {
  N: true,
  NNE: true,
  NE: true,
  ENE: true,
  E: true,
  ESE: true,
  SE: true,
  SSE: true,
  S: true,
  SSW: true,
  SW: true,
  WSW: true,
  W: true,
  WNW: true,
  NW: true,
  NNW: true,
};
type Dir = keyof typeof directionSet;
const DIRECTIONS = Object.keys(directionSet) as Dir[];

const SPEED_RANGES = [
  { label: "0–2 m/s", min: 0, max: 2, color: "#1f77b4" },
  { label: "2–5 m/s", min: 2, max: 5, color: "#ff7f0e" },
  { label: "5–8 m/s", min: 5, max: 8, color: "#2ca02c" },
  { label: "8–10 m/s", min: 8, max: 10, color: "#9467bd" },
  { label: "10–15 m/s", min: 10, max: 15, color: "#8c564b" },
  { label: "> 15 m/s", min: 15, max: Infinity, color: "#d62728" },
];

type WindMapLayer = Record<Dir, number>;

const initData = (): WindMapLayer[] =>
  SPEED_RANGES.map(() =>
    DIRECTIONS.reduce((acc, dir) => {
      acc[dir] = 0;
      return acc;
    }, {} as WindMapLayer)
  );

const degToCardinal = (deg: number): Dir => {
  // 16 sectors of 22.5°, shifted so 0°→N
  const index = Math.floor((deg + 11.25) / 22.5) % 16;
  return DIRECTIONS[index];
};

export default function WindRoseChart() {
  const [windMap, setWindMap] = useState<WindMapLayer[]>(initData);

  useEffect(() => {
    startSensorSocket();
    const unsubscribe = subscribeToSensorData((payload, topic) => {
      if (topic !== "v1/devices/me/telemetry") return;
      const speed = payload.Wind_Speed as number;
      const deg = payload.Wind_Direction as number;
      const dir = degToCardinal(deg);
      const bin = SPEED_RANGES.findIndex(
        (r) => speed >= r.min && speed < r.max
      );

      if (bin >= 0) {
        setWindMap((prev) => {
          const next = prev.map((layer) => ({ ...layer }));
          next[bin][dir] += 1;
          return next;
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const totalCount = windMap.reduce(
    (sum, layer) => sum + DIRECTIONS.reduce((s, d) => s + layer[d], 0),
    0
  );

  if (totalCount === 0) {
    return <div className="py-8 text-center">Waiting for wind data…</div>;
  }

  const traces: Partial<PlotData>[] = windMap.map((layer, i) => ({
    type: "barpolar",
    r: DIRECTIONS.map((d) => (layer[d] / totalCount) * 100),
    theta: DIRECTIONS,
    name: SPEED_RANGES[i].label,
    marker: { color: SPEED_RANGES[i].color },
    hovertemplate:
      "%{theta}<br>%{r:.1f}%<extra>" + SPEED_RANGES[i].label + "</extra>",
  }));

  const layout: Partial<Layout> = {
    barmode: "stack",
    title: {
      text: "Wind Rose – Frequency by Direction & Speed",
      font: { size: 18 },
    },
    polar: {
      radialaxis: {
        ticksuffix: "%",
        tickformat: ".0f",
        angle: 22.5,
        dtick: 10,
      },
      angularaxis: {
        rotation: 90,
        direction: "clockwise",
      },
    },
    showlegend: true,
    legend: { orientation: "v", x: 1.05, y: 1 },
  };

  return (
    <div className="flex justify-center items-center">
      <Plot
        data={traces}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
