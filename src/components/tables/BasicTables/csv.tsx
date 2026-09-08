import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { useState } from "react";

const DATA_OPTIONS = {
  wind: ["temperature", "humidity", "pressure", "wind_speed", "wind_direction"],
  particle: ["pm25", "pm10", "tsp"],
};

export default function CSV() {
  const [dataType, setDataType] = useState<keyof typeof DATA_OPTIONS>("wind");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const toggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const toUTC = (local: string): string => {
    return new Date(local).toISOString(); // converts to UTC string
  };

  const handleDownload = async () => {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
      fields: selectedFields.join(","),
      start: startDate ? toUTC(startDate) : "",
      end: endDate ? toUTC(endDate) : "",
    }).toString();

    const endpoint =
      dataType === "wind"
        ? `/download/wind-data?${query}`
        : `/download/particle-data?${query}`;

    const response = await fetch(`http://localhost:5000${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      alert("Download failed");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataType}_data.csv`;
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-white/[0.03] p-6 border border-gray-200 dark:border-white/[0.05] rounded-xl overflow-hidden">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 text-xl">
          Export CSV
        </h2>
        <div className="space-y-4 mt-4">
          <div>
            <label className="block mb-1 text-gray-600 dark:text-gray-300">
              Select Data Type
            </label>
            <select
              value={dataType}
              onChange={(e) => {
                setDataType(e.target.value as "wind" | "particle");
                setSelectedFields([]);
              }}
              className="bg-white dark:bg-zinc-800 p-2 border dark:border-white/[0.05] rounded w-full text-gray-700 dark:text-gray-200"
            >
              <option value="wind">Environment Data</option>
              <option value="particle">Particle Data</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-gray-600 dark:text-gray-300">
              Select Fields
            </label>
            <div className="gap-2 grid grid-cols-2">
              {DATA_OPTIONS[dataType].map((field) => (
                <label key={field} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={() => toggleField(field)}
                    className="accent-blue-600"
                  />
                  <span className="text-gray-700 dark:text-gray-200 capitalize">
                    {field.replace(/_/g, " ")}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-1 text-gray-600 dark:text-gray-300">
              Start Date
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="dark:bg-zinc-800 p-2 border rounded w-full dark:text-white"
            />
          </div>

          <div>
            <label className="block mb-1 text-gray-600 dark:text-gray-300">
              End Date
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="dark:bg-zinc-800 p-2 border rounded w-full dark:text-white"
            />
          </div>

          <button
            onClick={handleDownload}
            disabled={selectedFields.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 mt-2 px-4 py-2 rounded text-white"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-gray-100 dark:border-white/[0.05] border-b">
            <TableRow>
              <TableCell className="text-gray-500 dark:text-gray-400">
                CSV Export Table
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                Choose data type, fields, and date range to export as CSV.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
