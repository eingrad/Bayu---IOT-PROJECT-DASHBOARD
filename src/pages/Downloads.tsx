import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import GenerateReportModal from "../components/downloads/GenerateReportModal";

export default function Downloads() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageMeta
        title="Bayu Sense - Downloads"
        description="Generate and download reports"
      />
      <PageBreadcrumb pageTitle="Downloads" />

      <div className="mx-auto mt-8 px-4 container">
        <div className="bg-white dark:bg-white/[0.03] p-8 border border-gray-200 dark:border-gray-800 rounded-2xl">
          <div className="max-w-xl">
            <div className="flex justify-center items-center bg-brand-500/10 mb-5 rounded-2xl w-14 h-14 text-brand-500">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-7 h-7"
              >
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </div>
            <h2 className="mb-2 font-semibold text-gray-800 dark:text-white/90 text-2xl">
              Generate a report
            </h2>
            <p className="mb-6 max-w-lg text-gray-500 dark:text-gray-400">
              Export your sensor data as <b>CSV</b>, <b>PDF</b>, or{" "}
              <b>Excel</b>. You choose the data type, fields, and date range in
              the next step.
            </p>
            <Button
              onClick={() => setOpen(true)}
              startIcon={
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              }
            >
              Generate Report
            </Button>
          </div>
        </div>
      </div>

      <GenerateReportModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
