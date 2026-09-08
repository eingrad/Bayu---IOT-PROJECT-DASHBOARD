import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
  ChartData,
  ChartOptions,
  ScriptableContext,
} from "chart.js";
import "chartjs-adapter-date-fns";
import {
  startSensorSocket,
  subscribeToSensorData,
} from "../utils/sensorSocket";

ChartJS.register(
  TimeScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
);

interface DataPoint {
  x: number;
  y: number;
}

type SensorType =
  | "pm25"
  | "pm10"
  | "tsp"
  | "temperature"
  | "humidity"
  | "pressure"
  | "co"
  | "so2"
  | "o3"
  | "no2";

// Color follows the metric (identity), aligned with the dashboard cards.
const METRICS: Record<
  SensorType,
  { label: string; unit: string; color: string }
> = {
  pm25: { label: "PM2.5", unit: "µg/m³", color: "#dc2626" },
  pm10: { label: "PM10", unit: "µg/m³", color: "#ea580c" },
  tsp: { label: "TSP", unit: "µg/m³", color: "#78716c" },
  temperature: { label: "Temperature", unit: "°C", color: "#d97706" },
  humidity: { label: "Humidity", unit: "%", color: "#0284c7" },
  pressure: { label: "Pressure", unit: "kPa", color: "#4f46e5" },
  co: { label: "CO", unit: "ppm", color: "#0891b2" },
  so2: { label: "SO₂", unit: "ppb", color: "#db2777" },
  o3: { label: "O₃", unit: "ppb", color: "#059669" },
  no2: { label: "NO₂", unit: "ppb", color: "#7c3aed" },
};
const ORDER: SensorType[] = [
  "pm25",
  "pm10",
  "tsp",
  "co",
  "so2",
  "o3",
  "no2",
  "temperature",
  "humidity",
  "pressure",
];

// Track the app's dark class so the chart's grid/axes match the theme.
function useIsDark() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() =>
      setIsDark(el.classList.contains("dark")),
    );
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export default function RealtimeMultiLineChart() {
  const [selected, setSelected] = useState<SensorType>("pm25");
  const isDark = useIsDark();

  const [data, setData] = useState<Record<SensorType, DataPoint[]>>({
    pm25: [],
    pm10: [],
    tsp: [],
    temperature: [],
    humidity: [],
    pressure: [],
    co: [],
    so2: [],
    o3: [],
    no2: [],
  });

  const maxPoints = 100;

  useEffect(() => {
    startSensorSocket();
    const unsubscribe = subscribeToSensorData((payload) => {
      const now = Date.now();
      setData((prev) => {
        const next = { ...prev };
        const push = (key: SensorType, raw: unknown) => {
          const val = Number(raw);
          if (Number.isFinite(val)) {
            next[key] = [
              ...prev[key].slice(-maxPoints + 1),
              { x: now, y: val },
            ];
          }
        };
        const pick = (keys: string[]) => {
          for (const k of keys) {
            const v = Number(payload[k]);
            if (Number.isFinite(v)) return v;
          }
          return undefined;
        };
        push("pm25", payload.pm25);
        push("pm10", payload.pm10);
        push("tsp", payload.tsp);
        push("temperature", payload.Temperature);
        push("humidity", payload.Humidity);
        push("pressure", payload.Pressure);
        push("co", pick(["co", "CO", "carbon_monoxide"]));
        push("so2", pick(["so2", "SO2", "sulfur_dioxide"]));
        push("o3", pick(["o3", "O3", "ozone"]));
        push("no2", pick(["no2", "NO2", "nitrogen_dioxide"]));
        return next;
      });
    });
    return () => unsubscribe();
  }, []);

  const m = METRICS[selected];
  const series = data[selected];
  const latest = series.length ? series[series.length - 1].y : null;

  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
  const tickColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(71,85,105,0.7)";

  const chartData: ChartData<"line"> = {
    datasets: [
      {
        label: m.label,
        data: series,
        borderColor: m.color,
        borderWidth: 2,
        tension: 0.35,
        spanGaps: true,
        fill: true,
        backgroundColor: (ctx: ScriptableContext<"line">) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return "transparent";
          const g = c.createLinearGradient(
            0,
            chartArea.top,
            0,
            chartArea.bottom,
          );
          g.addColorStop(0, m.color + "40");
          g.addColorStop(1, m.color + "00");
          return g;
        },
        pointRadius: (ctx) => (ctx.dataIndex === series.length - 1 ? 4 : 0),
        pointBackgroundColor: m.color,
        pointBorderColor: isDark ? "#111827" : "#ffffff",
        pointBorderWidth: 2,
        pointHoverRadius: 5,
      },
    ],
  };

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        type: "time",
        time: { unit: "minute", tooltipFormat: "HH:mm:ss" },
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
        ticks: {
          color: tickColor,
          maxRotation: 0,
          autoSkipPadding: 24,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { size: 11 },
          padding: 8,
          maxTicksLimit: 5,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: isDark ? "#1f2937" : "#111827",
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 11 },
        bodyFont: { size: 12, weight: "bold" },
        callbacks: {
          label: (item) => `${item.formattedValue} ${m.unit}`,
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-white/[0.03] p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
      {/* Header: hero value + metric pills */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
            Live Metrics
          </h2>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className="font-bold text-3xl tabular-nums"
              style={{ color: m.color }}
            >
              {latest != null ? Math.round(latest * 10) / 10 : "—"}
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-sm">
              {m.unit}
            </span>
            <span className="ml-1 text-gray-400 dark:text-gray-500 text-sm">
              · {m.label}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ORDER.map((key) => {
            const mm = METRICS[key];
            const active = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? ""
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                }`}
                style={
                  active
                    ? {
                        color: mm.color,
                        backgroundColor: mm.color + "14",
                        boxShadow: `inset 0 0 0 1px ${mm.color}55`,
                      }
                    : undefined
                }
              >
                {mm.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        {series.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-400 dark:text-gray-500 text-sm">
            Waiting for live data…
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
}
