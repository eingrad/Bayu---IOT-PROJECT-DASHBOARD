import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  startSensorSocket,
  subscribeToSensorData,
} from "../utils/sensorSocket";

// --- inline icons (self-contained; inherit color via currentColor) ---
function ThermometerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z" />
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M12 2.7s6 5.5 6 9.8a6 6 0 1 1-12 0c0-4.3 6-9.8 6-9.8z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M3.5 19a9 9 0 1 1 17 0" />
      <path d="M12 13l3.5-3" />
    </svg>
  );
}

type EnvCardProps = {
  label: string;
  value: number;
  unit: string;
  icon: ReactNode;
  tint: string; // badge background
  iconColor: string; // icon color
};

function EnvStatCard({
  label,
  value,
  unit,
  icon,
  tint,
  iconColor,
}: EnvCardProps) {
  const shown = Math.round(value * 10) / 10;
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-white/[0.03] shadow-sm p-5 border border-gray-200 dark:border-gray-800 rounded-2xl">
      <div
        className={`flex flex-none justify-center items-center w-12 h-12 rounded-xl ${tint} ${iconColor}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-500 dark:text-gray-400 text-sm truncate">
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-bold text-gray-800 dark:text-white/90 text-2xl tabular-nums">
            {shown}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-sm">
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TemperatureCard({ value }: { value: number }) {
  return (
    <EnvStatCard
      label="Ambient Temperature"
      value={value}
      unit="°C"
      icon={<ThermometerIcon />}
      tint="bg-amber-50 dark:bg-amber-500/15"
      iconColor="text-amber-600 dark:text-amber-400"
    />
  );
}

export function HumidityCard({ value }: { value: number }) {
  return (
    <EnvStatCard
      label="Relative Humidity"
      value={value}
      unit="%"
      icon={<DropletIcon />}
      tint="bg-sky-50 dark:bg-sky-500/15"
      iconColor="text-sky-600 dark:text-sky-400"
    />
  );
}

export function PressureCard({ value }: { value: number }) {
  return (
    <EnvStatCard
      label="Ambient Pressure"
      value={value}
      unit="kPa"
      icon={<GaugeIcon />}
      tint="bg-indigo-50 dark:bg-indigo-500/15"
      iconColor="text-indigo-600 dark:text-indigo-400"
    />
  );
}

// Hook: live temperature / humidity / pressure from the sensor socket
export function useEnvStats() {
  const [temperature, setTemperature] = useState(0);
  const [humidity, setHumidity] = useState(0);
  const [pressure, setPressure] = useState(0);

  useEffect(() => {
    startSensorSocket();
    const unsubscribe = subscribeToSensorData((payload, topic) => {
      if (topic !== "v1/devices/me/telemetry") return;
      const t = payload.Temperature;
      const h = payload.Humidity;
      const p = payload.Pressure;
      if (typeof t === "number") setTemperature(t);
      if (typeof h === "number") setHumidity(h);
      if (typeof p === "number") setPressure(p);
    });
    return () => unsubscribe();
  }, []);

  return { temperature, humidity, pressure };
}
