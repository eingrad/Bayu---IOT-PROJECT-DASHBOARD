import { API_BASE } from "../config/api";
import { useState, useEffect } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";

interface AlertRule {
  id: string;
  parameter: string;
  threshold: number;
  username: string; // telegram username (stored in the `username` column)
  enabled: boolean;
  created_at: string;
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const fieldClass =
  "w-full h-11 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 px-4 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const selectClass =
  "w-full h-11 appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 pl-4 pr-10 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const labelClass =
  "block mb-1.5 font-medium text-gray-700 dark:text-gray-300 text-sm";

const PARAM_LABEL: Record<string, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  tsp: "TSP",
};

const Chevron = () => (
  <span className="top-1/2 right-3 absolute text-gray-400 dark:text-gray-500 -translate-y-1/2 pointer-events-none">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </span>
);

export default function AlertSetup() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    parameter: "pm25",
    threshold: "",
    username: "",
    enabled: true,
  });

  const token = localStorage.getItem("token");

  const fetchRules = async () => {
    const res = await fetch(`${API_BASE}/alert-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRules(await res.json());
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/alert-rule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          parameter: form.parameter,
          threshold: parseFloat(form.threshold),
          telegram_username: form.username,
          enabled: form.enabled,
        }),
      });
      const text = await res.text();
      let p: any;
      try {
        p = JSON.parse(text);
      } catch {
        p = { msg: text };
      }
      if (!res.ok) throw new Error(p.msg || `HTTP ${res.status}`);
      setShowModal(false);
      setForm({ parameter: "pm25", threshold: "", username: "", enabled: true });
      fetchRules();
    } catch (err: any) {
      alert(`Failed to create rule: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const atName = (u: string) => (u ? (u.startsWith("@") ? u : `@${u}`) : "—");

  return (
    <div>
      <PageMeta
        title="Alerts & Notifications"
        description="Manage Telegram alert rules"
      />
      <PageBreadcrumb pageTitle="Alert / Notification" />

      <div className={`${cardBase} overflow-hidden mt-2`}>
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-gray-100 dark:border-gray-800 border-b">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
              Alert Rules
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {rules.length} {rules.length === 1 ? "rule" : "rules"} · notified
              via Telegram
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
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
            New Alert Rule
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-gray-400 dark:text-gray-500 text-xs text-left uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Parameter</th>
                <th className="px-5 py-3 font-medium">Threshold</th>
                <th className="px-5 py-3 font-medium">Telegram</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rules.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-gray-400 dark:text-gray-500 text-center"
                  >
                    No alert rules yet. Click{" "}
                    <span className="font-medium">New Alert Rule</span> to add
                    one.
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <span className="inline-flex bg-brand-500/10 px-2.5 py-1 rounded-full font-medium text-brand-600 dark:text-brand-400 text-xs">
                        {PARAM_LABEL[r.parameter] || r.parameter.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white/90 tabular-nums">
                      {r.threshold}{" "}
                      <span className="font-normal text-gray-400 text-xs">
                        µg/m³
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {atName(r.username)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          r.enabled
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            r.enabled ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        />
                        {r.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New-rule modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-8">
          <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90 text-xl">
            New Alert Rule
          </h3>
          <p className="mb-6 text-gray-500 dark:text-gray-400 text-sm">
            Get a Telegram message when a reading crosses your threshold. The
            username must have started the alert bot first.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="gap-4 grid grid-cols-2">
              <div>
                <label className={labelClass}>Parameter</label>
                <div className="relative">
                  <select
                    value={form.parameter}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, parameter: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="pm25">PM2.5</option>
                    <option value="pm10">PM10</option>
                    <option value="tsp">TSP</option>
                  </select>
                  <Chevron />
                </div>
              </div>
              <div>
                <label className={labelClass}>Threshold (µg/m³)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="35"
                  value={form.threshold}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, threshold: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Telegram Username</label>
              <input
                type="text"
                required
                placeholder="@yourname"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                className={fieldClass}
              />
            </div>

            <div className="flex justify-between items-center bg-gray-50 dark:bg-white/[0.02] px-4 py-3 border border-gray-100 dark:border-gray-800 rounded-lg">
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-200 text-sm">
                  Enable this rule
                </div>
                <div className="text-gray-400 text-xs">
                  Turn off to keep the rule without sending alerts.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition ${
                  form.enabled ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    form.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button disabled={loading}>
                {loading ? "Adding…" : "Add Rule"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
