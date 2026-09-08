import { API_BASE } from "../config/api";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";

interface Station {
  lat: number;
  lng: number;
  title: string;
  deviceId: string;
}

// Custom SVG pin — avoids Leaflet's default marker images (which 404 in bundlers).
const makePin = (color: string) =>
  L.divIcon({
    className: "bayu-pin",
    html: `<svg width="30" height="42" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 8.5 12 24 12 24s12-15.5 12-24C24 5.37 18.63 0 12 0z" fill="${color}"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });

const pinDefault = makePin("#465fff");
const pinActive = makePin("#dc2626");

// Fit the view to all stations once they load.
function FitBounds({ stations }: { stations: Station[] }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length === 0) return;
    const pts = stations.map((s) => [s.lat, s.lng]) as [number, number][];
    if (pts.length === 1) map.setView(pts[0], 13);
    else map.fitBounds(pts, { padding: [50, 50] });
  }, [stations, map]);
  return null;
}

// Zoom & center on the clicked station; revert to the overview when closed.
function FlyToSelected({
  selected,
  stations,
}: {
  selected: Station | null;
  stations: Station[];
}) {
  const map = useMap();
  const flew = useRef(false);
  useEffect(() => {
    if (selected) {
      flew.current = true;
      map.flyTo([selected.lat, selected.lng], 15, { duration: 0.8 });
    } else if (flew.current && stations.length > 0) {
      flew.current = false;
      const pts = stations.map((s) => [s.lat, s.lng]) as [number, number][];
      if (pts.length === 1) map.flyTo(pts[0], 13, { duration: 0.8 });
      else map.flyToBounds(pts, { padding: [50, 50], duration: 0.8 });
    }
  }, [selected, stations, map]);
  return null;
}

// Track the app's light/dark theme so the basemap can follow it.
function useIsDark() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() =>
      setIsDark(el.classList.contains("dark"))
    );
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function StatusPill({ status }: { status?: string }) {
  const online = String(status).toLowerCase() === "online";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        online
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          online ? "bg-emerald-500" : "bg-gray-400"
        }`}
      />
      {online ? "Online" : status || "Offline"}
    </span>
  );
}

export default function MapComponent() {
  const [markers, setMarkers] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);
  const [info, setInfo] = useState<any | null>(null);

  const isDark = useIsDark();
  const center: [number, number] = [4.456, 108.894];
  const zoom = 6;

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/my-devices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch devices");
        const devices = await res.json();
        const formatted: Station[] = devices
          .filter((d: any) => d.latitude != null && d.longitude != null)
          .map((d: any) => ({
            lat: Number(d.latitude),
            lng: Number(d.longitude),
            title: d.device_name || "Station",
            deviceId: d.id,
          }));
        setMarkers(formatted);
      } catch (err) {
        console.error("Error loading user devices:", err);
      }
    };
    load();
  }, []);

  const openDevice = async (m: Station) => {
    setSelected(m);
    setInfo(null);
    try {
      const res = await fetch(`${API_BASE}/device-info/${m.deviceId}`);
      if (!res.ok) throw new Error("Failed to fetch device info");
      setInfo(await res.json());
    } catch (err) {
      console.error("Error fetching device data:", err);
      setInfo(null);
    }
  };

  // Move to the next/previous station (wraps around).
  const step = (dir: number) => {
    if (markers.length === 0) return;
    const idx = markers.findIndex((m) => m.deviceId === selected?.deviceId);
    const base = idx === -1 ? 0 : idx;
    const next = markers[(base + dir + markers.length) % markers.length];
    openDevice(next);
  };

  const params: [string, any, string][] = info
    ? [
        ["PM2.5", info.pm25, "µg/m³"],
        ["PM10", info.pm10, "µg/m³"],
        ["TSP", info.tsp, "µg/m³"],
        ["CO", info.co, "ppm"],
        ["SO₂", info.so2, "ppb"],
        ["O₃", info.o3, "ppb"],
        ["NO₂", info.no2, "ppb"],
        ["Humidity", info.humidity, "%"],
        ["Temperature", info.temperature, "°C"],
        ["Pressure", info.pressure, "hPa"],
      ]
    : [];

  return (
    <div>
      <PageMeta title="Station Location" description="Monitoring station map" />
      <PageBreadcrumb pageTitle="Station Location" />

      <div className="bg-white dark:bg-white/[0.03] p-4 border border-gray-200 dark:border-gray-800 rounded-2xl">
        {/* Header */}
        <div className="flex justify-between items-center gap-3 mb-4 px-1">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
              Station Location
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {markers.length} {markers.length === 1 ? "station" : "stations"} on
              the map
            </p>
          </div>
        </div>

        <div className="relative rounded-xl ring-1 ring-gray-200 dark:ring-gray-800 h-[calc(100vh-260px)] min-h-[420px] overflow-hidden">
          <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            {/* OpenStreetMap standard tiles: fully open, no API key required.
                OSM has no dark basemap, so dark mode is done with a CSS filter
                on the tile layer (see .osm-tiles-dark in index.css). */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              className={isDark ? "osm-tiles-dark" : "osm-tiles-light"}
            />
            <FitBounds stations={markers} />
            <FlyToSelected selected={selected} stations={markers} />
            {markers.map((m) => (
              <Marker
                key={m.deviceId}
                position={[m.lat, m.lng]}
                icon={selected?.deviceId === m.deviceId ? pinActive : pinDefault}
                eventHandlers={{ click: () => openDevice(m) }}
              />
            ))}
          </MapContainer>

          {/* Info overlay */}
          {selected && (
            <div className="top-4 right-4 z-[1100] absolute bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-800 rounded-2xl w-[320px] max-w-[calc(100%-2rem)] overflow-hidden">
              <div className="flex justify-between items-start gap-2 p-4 border-gray-100 dark:border-gray-800 border-b">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-white/90 truncate">
                    {selected.title}
                  </div>
                  <div className="text-gray-400 dark:text-gray-500 text-xs">
                    Last updated:{" "}
                    {info?.last_updated
                      ? new Date(info.last_updated).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelected(null);
                    setInfo(null);
                  }}
                  className="flex-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-4">
                {info ? (
                  <>
                    <div className="flex justify-between items-center mb-3">
                      <StatusPill status={info.status} />
                      <span className="font-medium text-gray-600 dark:text-gray-300 text-sm tabular-nums">
                        {info.battery ?? "—"}% battery
                      </span>
                    </div>
                    <div className="mb-4 text-gray-500 dark:text-gray-400 text-sm">
                      {info.location || "—"}
                    </div>
                    <div className="gap-2 grid grid-cols-2">
                      {params.map(([label, value, unit]) => (
                        <div
                          key={label}
                          className="bg-gray-50 dark:bg-white/[0.03] p-2.5 border border-gray-100 dark:border-gray-800 rounded-lg"
                        >
                          <div className="text-gray-400 dark:text-gray-500 text-xs">
                            {label}
                          </div>
                          <div className="font-semibold text-gray-800 dark:text-white/90 text-sm tabular-nums">
                            {value != null ? `${value} ${unit}` : "N/A"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-gray-400 dark:text-gray-500 text-sm text-center">
                    Loading station data…
                  </div>
                )}
              </div>

              {markers.length > 1 && (
                <div className="flex justify-between items-center gap-2 p-3 border-gray-100 dark:border-gray-800 border-t">
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    Station{" "}
                    {markers.findIndex(
                      (m) => m.deviceId === selected.deviceId
                    ) + 1}{" "}
                    of {markers.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => step(-1)}
                      className="inline-flex items-center hover:bg-gray-100 dark:hover:bg-white/[0.05] px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg font-medium text-gray-600 dark:text-gray-300 text-xs transition"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => step(1)}
                      className="inline-flex items-center gap-1 bg-brand-500 hover:bg-brand-600 px-2.5 py-1.5 rounded-lg font-medium text-white text-xs transition"
                    >
                      Next
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-3.5 h-3.5"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {markers.length === 0 && (
            <div className="top-1/2 left-1/2 z-[1100] absolute bg-white/90 dark:bg-gray-900/90 shadow px-5 py-4 border border-gray-200 dark:border-gray-800 rounded-xl max-w-[80%] text-gray-500 dark:text-gray-400 text-sm text-center -translate-x-1/2 -translate-y-1/2">
              No stations with coordinates to show. Set a device or user location
              to see it here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
