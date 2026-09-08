import { useEffect, useState } from "react";

interface DailyForecast {
  date: string;
  day: {
    maxtemp_c: number;
    mintemp_c: number;
    condition: { text: string; icon: string };
  };
}

interface HourlyForecast {
  dt: number;
  main: { temp: number };
  weather: { description: string; icon: string }[];
}

// Fallback location (used when the logged-in user has no saved coordinates).
const DEFAULT_LOCATION = {
  name: "Seri Kembangan",
  lat: 3.021998,
  lon: 101.7055411,
};

const WEATHERAPI_KEY = "28122d4b1d0d4e3d91663638250206";
const OWM_KEY = "71f0b99db82d05f93ec4503ae929fd4e";

// WeatherAPI returns protocol-relative icon URLs (//cdn…) — force https.
const iconUrl = (url: string) =>
  url && url.startsWith("//") ? `https:${url}` : url;

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const tile =
  "bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-gray-800 rounded-xl";
const sectionLabel =
  "mb-3 text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide";

const WeatherForecast = () => {
  const [daily, setDaily] = useState<DailyForecast[]>([]);
  const [hourly, setHourly] = useState<HourlyForecast[]>([]);
  const [locationName, setLocationName] = useState(DEFAULT_LOCATION.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadForecast = (lat: number, lon: number, name: string) => {
      setLocationName(name);

      // 3-day daily forecast (WeatherAPI) — query by coordinates.
      fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=3`
      )
        .then((res) => res.json())
        .then((data) => setDaily(data.forecast.forecastday))
        .catch((err) => {
          console.error("Daily forecast error:", err);
          setError("Failed to load daily forecast.");
        });

      // 3-hour forecast (OpenWeatherMap).
      fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`
      )
        .then((res) => res.json())
        .then((data) => setHourly(data.list.slice(0, 8)))
        .catch((err) => {
          console.error("Hourly forecast error:", err);
          setError("Failed to load 3-hour forecast.");
        });
    };

    // Use the first station (device) that has coordinates.
    const token = localStorage.getItem("token");
    const fallback = () =>
      loadForecast(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name
      );

    if (token) {
      fetch("http://localhost:5000/my-devices", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((devices) => {
          const station = Array.isArray(devices)
            ? devices.find(
                (d: any) => d.latitude != null && d.longitude != null
              )
            : null;
          if (station) {
            loadForecast(
              Number(station.latitude),
              Number(station.longitude),
              station.location || station.device_name || "Station"
            );
          } else {
            fallback();
          }
        })
        .catch(fallback);
    } else {
      fallback();
    }
  }, []);

  return (
    <div className={`${cardBase} p-6`}>
      {/* Header */}
      <div className="flex justify-between items-start gap-3 mb-6">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
            Weather Forecast
          </h2>
          <p className="flex items-center gap-1.5 mt-0.5 text-gray-400 dark:text-gray-500 text-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {locationName}
          </p>
        </div>
      </div>

      {/* 3-day */}
      <p className={sectionLabel}>Next 3 days</p>
      <div className="gap-3 grid grid-cols-3 mb-8">
        {daily.length === 0
          ? [0, 1, 2].map((i) => (
              <div key={i} className={`${tile} h-36 animate-pulse`} />
            ))
          : daily.map((d) => (
              <div
                key={d.date}
                className={`${tile} flex flex-col items-center p-4 text-center`}
              >
                <div className="font-medium text-gray-700 dark:text-gray-200 text-sm">
                  {new Date(d.date).toLocaleDateString("en-US", {
                    weekday: "short",
                  })}
                </div>
                <img
                  src={iconUrl(d.day.condition.icon)}
                  alt={d.day.condition.text}
                  className="my-2 w-12 h-12"
                />
                <div className="w-full text-gray-400 dark:text-gray-500 text-xs truncate">
                  {d.day.condition.text}
                </div>
                <div className="mt-1.5 text-sm">
                  <span className="font-semibold text-gray-800 dark:text-white/90">
                    {Math.round(d.day.maxtemp_c)}°
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {" "}
                    / {Math.round(d.day.mintemp_c)}°
                  </span>
                </div>
              </div>
            ))}
      </div>

      {/* Hourly */}
      <p className={sectionLabel}>Hourly · 3-hour steps</p>
      <div className="flex gap-3 pb-1 overflow-x-auto">
        {hourly.length === 0
          ? [...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`${tile} h-32 w-24 flex-none animate-pulse`}
              />
            ))
          : hourly.map((h) => (
              <div
                key={h.dt}
                className={`${tile} flex flex-col flex-none items-center p-3 w-24 text-center`}
              >
                <div className="font-semibold text-gray-700 dark:text-gray-200 text-sm">
                  {new Date(h.dt * 1000).toLocaleString("en-US", {
                    hour: "numeric",
                    hour12: true,
                  })}
                </div>
                <div className="text-gray-400 dark:text-gray-500 text-[10px]">
                  {new Date(h.dt * 1000).toLocaleDateString("en-US", {
                    weekday: "short",
                  })}
                </div>
                <img
                  src={`https://openweathermap.org/img/wn/${h.weather[0].icon}@2x.png`}
                  alt={h.weather[0].description}
                  className="my-1 w-11 h-11"
                />
                <div className="font-semibold text-gray-800 dark:text-white/90 text-sm tabular-nums">
                  {Math.round(h.main.temp)}°C
                </div>
              </div>
            ))}
      </div>

      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
};

export default WeatherForecast;
