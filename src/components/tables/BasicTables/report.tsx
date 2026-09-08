import React, { useState } from "react";
import { saveAs } from "file-saver";

const ReportViewer: React.FC = () => {
  const [startDate, setStartDate] = useState("2025-05-07");
  const [endDate, setEndDate] = useState("2025-05-14");
  const [reportType, setReportType] = useState("weekly");

  const handleDownload = async () => {
    const params = new URLSearchParams({
      dataType: "wind",
      start: `${startDate}T00:00:00Z`,
      end: `${endDate}T23:59:59Z`,
      fields: "temperature,humidity,pressure,wind_speed,wind_direction",
    });

    const token = localStorage.getItem("token");

    const response = await fetch(`http://localhost:5000/report/pdf?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      alert("Failed to download report");
      return;
    }

    const blob = await response.blob();
    saveAs(blob, `environmental_report_${reportType}.pdf`);
  };

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.05] rounded-xl overflow-hidden">
      <div className="p-4 overflow-x-auto">
        <table className="min-w-full text-gray-500 dark:text-gray-400 text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-800 dark:text-gray-300 text-xs uppercase">
            <tr>
              <th className="px-6 py-3">Report Type</th>
              <th className="px-6 py-3">Start Date</th>
              <th className="px-6 py-3">End Date</th>
              <th className="px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y dark:divide-gray-700">
            <tr>
              <td className="px-6 py-4">
                <select
                  className="px-2 py-1 border rounded w-full"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </td>
              <td className="px-6 py-4">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 border rounded w-full"
                />
              </td>
              <td className="px-6 py-4">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 border rounded w-full"
                />
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={handleDownload}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
                >
                  Download PDF
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportViewer;
