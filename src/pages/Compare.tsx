import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useState } from "react";
import stationImg from "../icons/try.png";

type Station = {
  id: string;
  label: string;
  image: string;
  battery: number;
  temperature: number;
  humidity: number;
  pm25: number;
  pm10: number;
  tsp: number;
};

function batteryColor(pct: number): string {
  if (pct > 50) return "bg-emerald-500";
  if (pct > 20) return "bg-amber-500";
  return "bg-red-500";
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const selectClass =
  "w-full h-11 appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 pl-4 pr-10 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

export default function Compare() {
  const [devices] = useState<Station[]>([
    {
      id: "deviceA",
      label: "Station A",
      image: stationImg,
      battery: 78,
      temperature: 24.5,
      humidity: 55,
      pm25: 12,
      pm10: 25,
      tsp: 40,
    },
    {
      id: "deviceB",
      label: "Station B",
      image: stationImg,
      battery: 93,
      temperature: 23.8,
      humidity: 60,
      pm25: 15,
      pm10: 28,
      tsp: 42,
    },
  ]);

  // Which station each of the two panels shows.
  const [selected, setSelected] = useState<[string, string]>([
    "deviceA",
    "deviceB",
  ]);

  const getStation = (id: string) =>
    devices.find((d) => d.id === id) ?? devices[0];

  const setPanel = (idx: number, id: string) =>
    setSelected((prev) => {
      const next = [...prev] as [string, string];
      next[idx] = id;
      return next;
    });

  return (
    <div>
      <PageMeta
        title="Compare Station"
        description="Compare two monitoring stations side by side"
      />
      <PageBreadcrumb pageTitle="Compare Station" />

      <div className="gap-x-6 lg:gap-x-16 gap-y-28 grid grid-cols-1 lg:grid-cols-2 mx-auto mt-24 px-4 max-w-5xl">
        {selected.map((selId, idx) => {
          const dev = getStation(selId);
          const metrics = [
            { label: "Temperature", value: `${dev.temperature}°C` },
            { label: "Humidity", value: `${dev.humidity}%` },
            { label: "PM2.5", value: `${dev.pm25} µg/m³` },
            { label: "PM10", value: `${dev.pm10} µg/m³` },
            { label: "TSP", value: `${dev.tsp} µg/m³` },
          ];

          return (
            <div key={idx} className={`${cardBase} relative px-6 pt-24 pb-6`}>
              {/* Floating circular picture (kept) */}
              <div className="-top-20 left-1/2 absolute -translate-x-1/2">
                <img
                  src={dev.image}
                  alt={dev.label}
                  className="border-4 border-white dark:border-gray-900 rounded-full ring-1 ring-gray-200 dark:ring-gray-700 w-40 h-40 object-cover shadow-lg"
                />
              </div>

              {/* Name */}
              <div className="text-center">
                <h3 className="font-semibold text-gray-800 dark:text-white/90 text-xl">
                  {dev.label}
                </h3>
                <p className="mt-0.5 text-gray-400 dark:text-gray-500 text-sm">
                  Live station snapshot
                </p>
              </div>

              {/* Station picker */}
              <div className="mt-5">
                <label
                  htmlFor={`select-${idx}`}
                  className="block mb-1.5 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide"
                >
                  Select Station
                </label>
                <div className="relative">
                  <select
                    id={`select-${idx}`}
                    value={selId}
                    onChange={(e) => setPanel(idx, e.target.value)}
                    className={selectClass}
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <span className="top-1/2 right-3 absolute text-gray-400 dark:text-gray-500 -translate-y-1/2 pointer-events-none">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Battery */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                    Battery
                  </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm tabular-nums">
                    {dev.battery}%
                  </span>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${batteryColor(
                      dev.battery
                    )}`}
                    style={{ width: `${dev.battery}%` }}
                  />
                </div>
              </div>

              {/* Metrics */}
              <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
                {metrics.map((m) => (
                  <li
                    key={m.label}
                    className="flex justify-between items-center py-2.5"
                  >
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      {m.label}
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-white/90 text-sm tabular-nums">
                      {m.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
