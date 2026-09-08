import { API_BASE } from "../config/api";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "bayu-units";
const API = API_BASE;

type ParamDef = {
  key: string;
  name: string;
  sub?: string; // subscript, e.g. "2.5"
  description: string;
  units: string[];
  default: string;
};

type SectionDef = {
  title: string;
  caption: string;
  accent: string; // tailwind classes for the icon chip
  icon: ReactNode;
  params: ParamDef[];
};

const SECTIONS: SectionDef[] = [
  {
    title: "Particulate Matter",
    caption: "Airborne particle concentrations",
    accent: "bg-cyan-500/10 text-cyan-500",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <circle cx="6" cy="7" r="1.6" />
        <circle cx="13" cy="5" r="1.1" />
        <circle cx="18" cy="9" r="1.8" />
        <circle cx="8" cy="13" r="1.2" />
        <circle cx="15" cy="14" r="1.6" />
        <circle cx="6" cy="18" r="1.4" />
        <circle cx="12" cy="19" r="1" />
        <circle cx="19" cy="17" r="1.2" />
      </svg>
    ),
    params: [
      {
        key: "pm25",
        name: "PM",
        sub: "2.5",
        description: "Fine particulate matter",
        units: ["ppb", "ppm", "µg/m³"],
        default: "µg/m³",
      },
      {
        key: "pm10",
        name: "PM",
        sub: "10",
        description: "Coarse particulate matter",
        units: ["ppb", "ppm", "µg/m³"],
        default: "µg/m³",
      },
      {
        key: "tsp",
        name: "TSP",
        description: "Total suspended particles",
        units: ["ppb", "ppm", "µg/m³"],
        default: "µg/m³",
      },
    ],
  },
  {
    title: "Gases",
    caption: "Gas concentration readings",
    accent: "bg-amber-500/10 text-amber-500",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M4 14c1.5-2 3-2 4 0s2.5 2 4 0 3-2 4 0 2.5 2 4 0" />
        <path d="M4 18c1.5-2 3-2 4 0s2.5 2 4 0 3-2 4 0 2.5 2 4 0" />
        <path d="M4 10c1.5-2 3-2 4 0s2.5 2 4 0 3-2 4 0 2.5 2 4 0" />
      </svg>
    ),
    params: [
      {
        key: "co",
        name: "CO",
        description: "Carbon monoxide",
        units: ["ppb", "ppm", "µg/m³"],
        default: "ppm",
      },
      {
        key: "so2",
        name: "SO",
        sub: "2",
        description: "Sulphur dioxide",
        units: ["ppb", "ppm", "µg/m³"],
        default: "ppb",
      },
      {
        key: "o3",
        name: "O",
        sub: "3",
        description: "Ozone",
        units: ["ppb", "ppm", "µg/m³"],
        default: "ppb",
      },
      {
        key: "no2",
        name: "NO",
        sub: "2",
        description: "Nitrogen dioxide",
        units: ["ppb", "ppm", "µg/m³"],
        default: "ppb",
      },
    ],
  },
  {
    title: "Environment",
    caption: "Ambient conditions",
    accent: "bg-brand-500/10 text-brand-500",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />
      </svg>
    ),
    params: [
      {
        key: "temperature",
        name: "Temperature",
        description: "Ambient air temperature",
        units: ["°C", "°F", "K"],
        default: "°C",
      },
      {
        key: "humidity",
        name: "Humidity",
        description: "Relative / absolute humidity",
        units: ["% RH", "g/m³"],
        default: "% RH",
      },
      {
        key: "pressure",
        name: "Pressure",
        description: "Barometric pressure",
        units: ["hPa", "kPa", "mmHg", "inHg"],
        default: "hPa",
      },
    ],
  },
];

const DEFAULTS: Record<string, string> = SECTIONS.reduce((acc, s) => {
  s.params.forEach((p) => (acc[p.key] = p.default));
  return acc;
}, {} as Record<string, string>);

/* ------------------------------------------------------------------ */
/*  Segmented unit toggle                                              */
/* ------------------------------------------------------------------ */

function UnitToggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              active
                ? "bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-theme-xs"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SensorSettings() {
  const [units, setUnits] = useState<Record<string, string>>(DEFAULTS);
  const [baseline, setBaseline] = useState<Record<string, string>>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved preferences on mount: prefer the server, fall back to
  // localStorage (e.g. offline / not logged in).
  useEffect(() => {
    let active = true;
    const fromStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
      } catch {
        return DEFAULTS;
      }
    };

    (async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API}/me/preferences`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error("failed");
        const prefs = await res.json();
        const merged = { ...DEFAULTS, ...(prefs || {}) };
        if (active) {
          setUnits(merged);
          setBaseline(merged);
        }
      } catch {
        const merged = fromStorage();
        if (active) {
          setUnits(merged);
          setBaseline(merged);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(units) !== JSON.stringify(baseline),
    [units, baseline],
  );

  const setUnit = (key: string, value: string) => {
    setUnits((u) => ({ ...u, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    // Mirror to localStorage so units apply even before the next load.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/me/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(units),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      /* saved locally even if the server call failed */
    } finally {
      setBaseline(units);
      setSaving(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleReset = () => {
    setUnits(DEFAULTS);
    setSaved(false);
  };

  return (
    <>
      <PageMeta
        title="Bayu Sense - Sensor Settings"
        description="Configure display units for each measured parameter"
      />
      <PageBreadcrumb pageTitle="Sensor Settings" />

      <div className="space-y-6">
        {/* Header / intro */}
        <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4 bg-white dark:bg-white/[0.03] p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90 text-xl">
              Measurement Units
            </h2>
            <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
              Choose the unit used to display each parameter across your
              dashboard, charts and reports.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="inline-flex items-center gap-1.5 font-medium text-success-500 text-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="hover:bg-gray-50 dark:hover:bg-white/[0.03] px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg font-medium text-gray-600 dark:text-gray-300 text-sm transition-colors"
            >
              Reset
            </button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div
            key={section.title}
            className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden"
          >
            {/* Section header */}
            <div className="flex items-center gap-3 px-6 py-4 border-gray-100 dark:border-gray-800 border-b">
              <span
                className={`flex items-center justify-center rounded-xl w-10 h-10 ${section.accent}`}
              >
                {section.icon}
              </span>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white/90 text-base">
                  {section.title}
                </h3>
                <p className="text-gray-400 dark:text-gray-500 text-xs">
                  {section.caption}
                </p>
              </div>
            </div>

            {/* Parameter rows */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {section.params.map((p) => (
                <div
                  key={p.key}
                  className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 px-6 py-4"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white/90 text-sm">
                      {p.name}
                      {p.sub && <sub className="text-[0.7em]">{p.sub}</sub>}
                    </p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">
                      {p.description}
                    </p>
                  </div>
                  <UnitToggle
                    options={p.units}
                    value={units[p.key]}
                    onChange={(v) => setUnit(p.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-gray-400 dark:text-gray-500 text-xs text-center">
          Units are display preferences saved to your account and applied to the
          dashboard and generated reports. They do not change the raw values
          recorded by the sensors.
        </p>
      </div>
    </>
  );
}
