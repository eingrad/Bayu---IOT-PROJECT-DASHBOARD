import { PUBLIC_API_BASE } from "../config/api";
import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";

const BASE = PUBLIC_API_BASE;
const POSTMAN = `${BASE}/files/Dasuto_Public_API_v1_Wind_and_Particle.postman_collection.json`;

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  auth: boolean;
  request: string;
  response: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/auth/login",
    title: "Login",
    desc: "Authenticate with your credentials and receive a bearer token.",
    auth: false,
    request: `curl -X POST ${BASE}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"you@company.com","password":"secret"}'`,
    response: `{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...<jwt>"
}`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/all",
    title: "All parameters (latest)",
    desc: "Latest reading from every source — particulates, wind/environment and gases — in a single call.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/all \\
  -H "Authorization: Bearer <token>"`,
    response: `{
  "particle": { "measured_at": "2026-07-08T04:15:00Z", "pm25": 18.4, "pm10": 42.1, "tsp": 120.5 },
  "wind":     { "measured_at": "2026-07-08T04:15:00Z", "wind_speed": 3.2, "wind_direction": 120, "temperature": 29.5, "humidity": 68, "pressure": 101.2 },
  "gas":      { "measured_at": "2026-07-08T04:15:00Z", "co": 3.1, "so2": 88, "o3": 61, "no2": 40 }
}`,
  },
  {
    method: "GET",
    path: "/api/sensor-data",
    title: "Particle data (latest)",
    desc: "Latest PM2.5, PM10 and TSP readings (up to 100, newest first).",
    auth: true,
    request: `curl ${BASE}/api/sensor-data \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  {
    "id": 128,
    "measured_at": "2026-07-08T04:15:00.000Z",
    "pm25": 18.4,
    "pm10": 42.1,
    "tsp": 120.5,
    "device_id": "d6fb0a5d-2311-44fd-9657-2f9003e52602"
  }
]`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/recent/10",
    title: "Recent particle records",
    desc: "The most recent N particle readings — change 10 to any number.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/recent/10 \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  { "id": 128, "measured_at": "2026-07-08T04:15:00.000Z", "pm25": 18.4, "pm10": 42.1, "tsp": 120.5 },
  { "id": 127, "measured_at": "2026-07-08T04:10:00.000Z", "pm25": 17.9, "pm10": 40.8, "tsp": 118.2 }
]`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/gas",
    title: "Gas data (latest)",
    desc: "Latest CO, SO₂, O₃ and NO₂ readings.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/gas \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  {
    "id": 55,
    "measured_at": "2026-07-08T04:15:00.000Z",
    "co": 3.1,
    "so2": 88,
    "o3": 61,
    "no2": 40,
    "device_id": "d6fb0a5d-2311-44fd-9657-2f9003e52602"
  }
]`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/gas/recent/10",
    title: "Recent gas records",
    desc: "The most recent N gas readings — change 10 to any number.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/gas/recent/10 \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  { "id": 55, "measured_at": "2026-07-08T04:15:00.000Z", "co": 3.1, "so2": 88, "o3": 61, "no2": 40 },
  { "id": 54, "measured_at": "2026-07-08T04:10:00.000Z", "co": 2.9, "so2": 84, "o3": 59, "no2": 38 }
]`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/wind",
    title: "Wind & environment (latest)",
    desc: "Latest wind speed/direction, temperature, humidity and pressure.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/wind \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  {
    "id": 92,
    "measured_at": "2026-07-08T04:15:00.000Z",
    "wind_speed": 3.2,
    "wind_direction": 120,
    "temperature": 29.5,
    "humidity": 68,
    "pressure": 101.2,
    "device_id": "d6fb0a5d-2311-44fd-9657-2f9003e52602"
  }
]`,
  },
  {
    method: "GET",
    path: "/api/sensor-data/wind/recent/10",
    title: "Recent wind records",
    desc: "The most recent N wind readings — change 10 to any number.",
    auth: true,
    request: `curl ${BASE}/api/sensor-data/wind/recent/10 \\
  -H "Authorization: Bearer <token>"`,
    response: `[
  { "id": 92, "measured_at": "2026-07-08T04:15:00.000Z", "wind_speed": 3.2, "wind_direction": 120, "temperature": 29.5, "humidity": 68, "pressure": 101.2 },
  { "id": 91, "measured_at": "2026-07-08T04:10:00.000Z", "wind_speed": 2.9, "wind_direction": 118, "temperature": 29.2, "humidity": 70, "pressure": 101.3 }
]`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex flex-none items-center gap-1 hover:bg-gray-50 dark:hover:bg-white/[0.05] px-2.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg font-medium text-gray-500 dark:text-gray-400 text-xs transition"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const styles =
    method === "POST"
      ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-bold ${styles}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-medium text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 dark:bg-gray-950 p-4 rounded-lg overflow-x-auto font-mono text-gray-100 text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function EndpointRow({
  ep,
  defaultOpen = false,
}: {
  ep: Endpoint;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${cardBase} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] p-5 w-full text-left transition-colors"
      >
        <MethodBadge method={ep.method} />
        <code className="flex-1 min-w-0 font-mono text-gray-800 dark:text-white/90 text-sm break-all">
          {ep.path}
        </code>
        <span className="hidden md:inline max-w-[38%] text-gray-400 dark:text-gray-500 text-sm truncate">
          {ep.title}
        </span>
        <ChevronDown
          className={`h-5 w-5 flex-none text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="px-5 pt-4 pb-5 border-gray-100 dark:border-gray-800 border-t">
          <p className="text-gray-500 dark:text-gray-400 text-sm">{ep.desc}</p>

          {ep.auth && (
            <div className="inline-flex items-center gap-1.5 bg-gray-50 dark:bg-white/[0.03] mt-3 px-2.5 py-1 border border-gray-100 dark:border-gray-800 rounded-md font-mono text-gray-500 dark:text-gray-400 text-xs">
              Authorization: Bearer &lt;token&gt;
            </div>
          )}

          <CodeBlock label="Request" code={ep.request} />
          <CodeBlock label="Response" code={ep.response} />
        </div>
      )}
    </div>
  );
}

export default function ApiTutorial() {
  return (
    <div>
      <PageMeta
        title="API Usage Guide | Bayu Sense Dashboard"
        description="How to use the Bayu Sense Public API securely"
      />
      <PageBreadcrumb pageTitle="API Usage Guide" />

      <div className="space-y-5 mx-auto mt-2 w-full max-w-4xl">
        {/* Intro */}
        <div className={`${cardBase} p-6`}>
          <h3 className="font-semibold text-gray-800 dark:text-white/90 text-xl">
            Bayu Public API
          </h3>
          <p className="mt-1 max-w-2xl text-gray-500 dark:text-gray-400 text-sm">
            Authenticate to get a token, then pull air-quality and wind data
            programmatically. Below are the available endpoints with example
            requests and responses.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
              Base URL
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 dark:bg-white/[0.03] px-3 py-2 border border-gray-100 dark:border-gray-800 rounded-lg min-w-0 font-mono text-gray-800 dark:text-white/90 text-sm break-all">
                {BASE}
              </code>
              <CopyButton text={BASE} />
            </div>
          </div>

          <a
            href={POSTMAN}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 mt-5 px-5 py-3 rounded-lg font-medium text-white text-sm transition"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12 3v12" />
              <path d="m7 12 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Download Postman Collection
          </a>
        </div>

        {/* Auth note */}
        <div className={`${cardBase} flex items-start gap-3 p-4`}>
          <span className="flex flex-none justify-center items-center bg-amber-50 dark:bg-amber-500/15 rounded-lg w-8 h-8 text-amber-600 dark:text-amber-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Every endpoint except <span className="font-medium">Login</span>{" "}
            requires a header{" "}
            <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            .
          </p>
        </div>

        {/* Endpoints (click to expand) */}
        <div className="space-y-4">
          {ENDPOINTS.map((ep, i) => (
            <EndpointRow key={ep.path} ep={ep} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
