import { useState } from "react";
import { saveAs } from "file-saver";
import Flatpickr from "react-flatpickr";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import { CalenderIcon } from "../../icons";

type Format = "csv" | "pdf" | "excel";
type DataType = "wind" | "particle";

const FORMATS: { id: Format; label: string; note: string }[] = [
  { id: "csv", label: "CSV", note: "Raw data" },
  { id: "pdf", label: "PDF", note: "Formatted" },
  { id: "excel", label: "Excel", note: ".xlsx" },
];

const FIELDS: Record<DataType, string[]> = {
  wind: ["temperature", "humidity", "pressure", "wind_speed", "wind_direction"],
  particle: ["pm25", "pm10", "tsp"],
};

const FIELD_LABELS: Record<string, string> = {
  temperature: "Temperature",
  humidity: "Humidity",
  pressure: "Pressure",
  wind_speed: "Wind Speed",
  wind_direction: "Wind Direction",
  pm25: "PM2.5",
  pm10: "PM10",
  tsp: "TSP",
};

const API = "http://localhost:5000";
const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const pickerClass =
  "h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-4 pr-10 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

export default function GenerateReportModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("csv");
  const [dataType, setDataType] = useState<DataType>("wind");
  const [fields, setFields] = useState<string[]>(FIELDS.wind);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const changeDataType = (dt: DataType) => {
    setDataType(dt);
    setFields(FIELDS[dt]); // default: all fields for the new data type
  };

  const toggleField = (f: string) =>
    setFields((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );

  const handleGenerate = async () => {
    setError("");
    if (fields.length === 0) {
      setError("Select at least one field.");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const startISO = start ? start.toISOString() : "";
      const endISO = end ? end.toISOString() : "";

      let url = "";
      let filename = "";
      if (format === "csv") {
        const q = new URLSearchParams({
          fields: fields.join(","),
          start: startISO,
          end: endISO,
        });
        url = `${API}/download/${dataType}-data?${q}`;
        filename = `${dataType}_data.csv`;
      } else if (format === "excel") {
        const q = new URLSearchParams({
          dataType,
          fields: fields.join(","),
          start: startISO,
          end: endISO,
        });
        url = `${API}/download/excel?${q}`;
        filename = `${dataType}_data.xlsx`;
      } else {
        const q = new URLSearchParams({
          dataType,
          fields: fields.join(","),
          start: startISO,
          end: endISO,
        });
        url = `${API}/report/pdf?${q}`;
        filename = `${dataType}_report.pdf`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Could not generate the report. Please try again.");
        return;
      }
      const blob = await res.blob();
      saveAs(blob, filename);
      onClose();
    } catch {
      setError("Something went wrong while generating the report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-[600px] w-full mx-4 max-h-[90vh] overflow-y-auto"
    >
      <div className="p-6 sm:p-8">
        <h4 className="mb-1 font-semibold text-gray-800 dark:text-white/90 text-xl">
          Generate Report
        </h4>
        <p className="mb-6 text-gray-500 dark:text-gray-400 text-sm">
          Choose a format and what to include, then download.
        </p>

        {/* Format */}
        <p className="mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
          Format
        </p>
        <div className="gap-2 grid grid-cols-3 mb-5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-sm transition ${
                format === f.id
                  ? "border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <span className="font-semibold">{f.label}</span>
              <span className="text-gray-400 text-xs">{f.note}</span>
            </button>
          ))}
        </div>

        {/* Data type */}
        <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
          Data type
        </label>
        <select
          value={dataType}
          onChange={(e) => changeDataType(e.target.value as DataType)}
          className={`${inputClass} mb-5`}
        >
          <option value="wind">
            Environment — temperature, humidity, pressure, wind
          </option>
          <option value="particle">Particulates — PM2.5, PM10, TSP</option>
        </select>

        {/* Fields */}
        <p className="mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
          Fields
        </p>
        <div className="gap-2 grid grid-cols-2 mb-5">
          {FIELDS[dataType].map((f) => (
            <label
              key={f}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={fields.includes(f)}
                onChange={() => toggleField(f)}
                className="w-4 h-4 accent-brand-500"
              />
              {FIELD_LABELS[f] ?? f}
            </label>
          ))}
        </div>

        {/* Date range */}
        <div className="gap-4 grid grid-cols-1 sm:grid-cols-2 mb-2">
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
              Start date
            </label>
            <div className="relative flatpickr-wrapper">
              <Flatpickr
                value={start ?? undefined}
                onChange={(dates: Date[]) => setStart(dates[0] ?? null)}
                options={{
                  enableTime: true,
                  dateFormat: "Y-m-d H:i",
                  time_24hr: true,
                }}
                placeholder="Any start time"
                className={pickerClass}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                <CalenderIcon className="size-5" />
              </span>
            </div>
          </div>
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
              End date
            </label>
            <div className="relative flatpickr-wrapper">
              <Flatpickr
                value={end ?? undefined}
                onChange={(dates: Date[]) => setEnd(dates[0] ?? null)}
                options={{
                  enableTime: true,
                  dateFormat: "Y-m-d H:i",
                  time_24hr: true,
                }}
                placeholder="Any end time"
                className={pickerClass}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                <CalenderIcon className="size-5" />
              </span>
            </div>
          </div>
        </div>
        <p className="mb-6 text-gray-400 text-xs">
          Leave dates empty to include all available records.
        </p>

        {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={loading || fields.length === 0}
          >
            {loading ? "Generating…" : "Generate & Download"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
