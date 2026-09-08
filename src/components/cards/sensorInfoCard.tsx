import { API_BASE } from "../../config/api";
import { useEffect, useState } from "react";
import DeviceImage from "../../icons/dasuto-device.svg";

const SENSOR_ID = "d6fb0a5d-2311-44fd-9657-2f9003e52602";

function batteryColor(pct: number): string {
  if (pct > 50) return "bg-emerald-500";
  if (pct > 20) return "bg-amber-500";
  return "bg-red-500";
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";

export default function SensorInfoCard() {
  const [device, setDevice] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No authentication token found.");
      return;
    }

    fetch(`${API_BASE}/device/${SENSOR_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(setDevice)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className={`${cardBase} flex items-center gap-2 p-6 text-red-500 text-sm`}>
        <span>⚠️</span> {error}
      </div>
    );
  }

  if (!device) {
    return (
      <div className={`${cardBase} p-6 text-gray-500 dark:text-gray-400 text-sm`}>
        Loading device info…
      </div>
    );
  }

  const online = String(device.status).toLowerCase() === "online";
  const battery = Number(device.battery ?? 0);
  const lastData = device.updated_at ? new Date(device.updated_at) : null;

  const details: { label: string; value: string; mono?: boolean }[] = [
    { label: "Model", value: device.model || "—" },
    { label: "Serial Number", value: device.serial_number || "—" },
    { label: "Location", value: device.location || "—" },
    { label: "Firmware", value: "2.1.4" },
    { label: "Last Data", value: lastData ? lastData.toLocaleString() : "—" },
    { label: "Device ID", value: device.id, mono: true },
  ];

  return (
    <div className={`${cardBase} p-6`}>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-none">
            <div className="flex justify-center items-center bg-gradient-to-br from-brand-500/15 dark:from-brand-500/25 to-brand-500/0 dark:to-transparent border border-brand-500/20 rounded-2xl w-20 h-20 overflow-hidden">
              <img
                src={DeviceImage}
                alt={device.device_name}
                className="drop-shadow-sm w-12 h-12 object-contain"
              />
            </div>
            {/* live presence indicator on the device */}
            <span className="-top-1 -right-1 absolute flex w-3.5 h-3.5">
              {online && (
                <span className="absolute inline-flex bg-emerald-400 opacity-75 rounded-full w-full h-full animate-ping" />
              )}
              <span
                className={`relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white dark:border-gray-900 ${
                  online ? "bg-emerald-500" : "bg-gray-400"
                }`}
              />
            </span>
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90 text-lg leading-tight">
              {device.device_name}
            </h2>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {device.model || "Air quality sensor"}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            online
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              online ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
          {online ? "Online" : device.status || "Offline"}
        </span>
      </div>

      {/* Battery */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
            Battery
          </span>
          <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm tabular-nums">
            {battery}%
          </span>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${batteryColor(battery)}`}
            style={{ width: `${Math.max(0, Math.min(100, battery))}%` }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="my-6 border-gray-100 dark:border-gray-800 border-t" />

      {/* Details */}
      <dl className="gap-x-6 gap-y-5 grid grid-cols-2 sm:grid-cols-3">
        {details.map((d) => (
          <div key={d.label} className="min-w-0">
            <dt className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
              {d.label}
            </dt>
            <dd
              className={`mt-1 font-medium text-gray-800 dark:text-white/90 ${
                d.mono ? "font-mono text-xs break-all" : "text-sm truncate"
              }`}
            >
              {d.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Footnote */}
      <p className="mt-6 text-gray-400 dark:text-gray-500 text-xs">
        Last connection: {lastData ? lastData.toUTCString() : "—"}
      </p>
    </div>
  );
}
