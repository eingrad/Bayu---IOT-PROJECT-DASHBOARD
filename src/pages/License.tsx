import { API_BASE } from "../config/api";
import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";

interface LicenseInfo {
  license_key: string;
  company: string;
  issued_at: string;
  expires_at: string;
  status: "active" | "expired";
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const FEATURES = [
  "Real-time air quality dashboard",
  "Live station map & locations",
  "Telegram alerts & notifications",
  "CSV, PDF & Excel data exports",
  "Historical data & reports",
];

const Check = () => (
  <span className="flex flex-none justify-center items-center bg-emerald-50 dark:bg-emerald-500/15 mt-0.5 rounded-full w-5 h-5 text-emerald-600 dark:text-emerald-400">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </span>
);

export default function License() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchLicense = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/license`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setLicense(await res.json());
          setState("ready");
        } else {
          setState("none");
        }
      } catch {
        setState("none");
      }
    };
    fetchLicense();
  }, []);

  const copyKey = () => {
    if (!license) return;
    navigator.clipboard?.writeText(license.license_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Validity math
  let pct = 0;
  let daysLeft = 0;
  let expired = false;
  if (license) {
    const issued = new Date(license.issued_at).getTime();
    const expires = new Date(license.expires_at).getTime();
    const now = Date.now();
    const total = Math.max(1, expires - issued);
    pct = Math.min(100, Math.max(0, ((now - issued) / total) * 100));
    daysLeft = Math.ceil((expires - now) / 86400000);
    expired = license.status === "expired" || now > expires;
  }

  const months = license
    ? (new Date(license.expires_at).getFullYear() -
        new Date(license.issued_at).getFullYear()) *
        12 +
      (new Date(license.expires_at).getMonth() -
        new Date(license.issued_at).getMonth())
    : 0;

  return (
    <div>
      <PageMeta
        title="License Details | Bayu Sense Dashboard"
        description="View your current license subscription and validity details"
      />
      <PageBreadcrumb pageTitle="License Details" />

      <div className="gap-6 grid grid-cols-1 lg:grid-cols-3 mx-auto mt-2 w-full max-w-5xl">
        {/* Left: license card */}
        <div className="lg:col-span-2">
          {state === "loading" && (
            <div className={`${cardBase} h-72 animate-pulse`} />
          )}

          {state === "none" && (
            <div className={`${cardBase} p-10 h-full text-center`}>
              <div className="flex justify-center items-center bg-gray-100 dark:bg-gray-800 mx-auto mb-4 rounded-2xl w-14 h-14 text-gray-400">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-7 h-7"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
                No license assigned
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-gray-500 dark:text-gray-400 text-sm">
                You don't have a license yet. Contact your administrator to get
                one assigned to your account.
              </p>
            </div>
          )}

          {state === "ready" && license && (
            <div className={`${cardBase} flex flex-col h-full overflow-hidden`}>
              {/* Gradient header with the key */}
              <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-2 font-medium text-white/85 text-sm">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Bayu Sense License
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold ${
                      expired ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        expired ? "bg-red-500" : "bg-emerald-500"
                      }`}
                    />
                    {expired ? "Expired" : "Active"}
                  </span>
                </div>

                <div className="mt-5 text-white/70 text-xs uppercase tracking-wider">
                  License Key
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="font-mono font-semibold text-xl tracking-wide break-all">
                    {license.license_key}
                  </span>
                  <button
                    onClick={copyKey}
                    className="inline-flex flex-none items-center gap-1 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg font-medium text-white text-xs transition"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="mt-3 text-white/85 text-sm">
                  {license.company}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 p-6">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-1.5 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Validity
                    </span>
                    <span
                      className={`font-medium ${
                        expired
                          ? "text-red-600 dark:text-red-400"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {expired
                        ? "Expired"
                        : `${daysLeft} day${
                            daysLeft !== 1 ? "s" : ""
                          } remaining`}
                    </span>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        expired
                          ? "bg-red-500"
                          : daysLeft < 30
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <dl className="gap-x-6 gap-y-5 grid grid-cols-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                      Issued
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90 text-sm">
                      {fmtDate(license.issued_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                      Expires
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90 text-sm">
                      {fmtDate(license.expires_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
                      Duration
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90 text-sm">
                      {months} month{months !== 1 ? "s" : ""}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Right: what's included + renew note */}
        <aside className="lg:col-span-1">
          <div className={`${cardBase} p-6`}>
            <h3 className="mb-4 font-semibold text-gray-800 dark:text-white/90 text-base">
              What's included
            </h3>
            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check />
                  <span className="text-gray-600 dark:text-gray-300 text-sm">
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            <div className="bg-brand-500/5 mt-6 p-4 border border-brand-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-1 font-medium text-brand-600 dark:text-brand-400 text-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                Need to renew?
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Licenses are managed by your administrator. Contact them to renew
                or upgrade your plan.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
