import { API_BASE } from "../config/api";
import { useState, useEffect } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";

interface User {
  id: string;
  username: string;
}

interface License {
  id: string;
  license_key: string;
  company: string;
  issued_at: string;
  expires_at: string;
  status: string;
  user_id: string | null;
  username?: string;
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const fieldClass =
  "w-full h-11 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 px-4 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const selectClass =
  "w-full h-11 appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 pl-4 pr-10 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const tableSelectClass =
  "w-44 h-9 appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 pl-3 pr-9 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const labelClass =
  "block mb-1.5 font-medium text-gray-700 dark:text-gray-300 text-sm";

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

function StatusBadge({ status, expires }: { status: string; expires: string }) {
  const expired = status === "expired" || new Date(expires) < new Date();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        expired
          ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          expired ? "bg-red-500" : "bg-emerald-500"
        }`}
      />
      {expired ? "Expired" : "Active"}
    </span>
  );
}

export default function AdminLicensePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLicense, setNewLicense] = useState({
    license_key: "",
    company: "",
    issued_at: "",
    expires_at: "",
    status: "active",
  });

  const token = localStorage.getItem("token");

  const fetchUsers = async () => {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUsers(await res.json());
  };

  const fetchLicenses = async () => {
    const res = await fetch(`${API_BASE}/licenses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLicenses(data);
      const mapped: Record<string, string> = {};
      data.forEach((l: License) => {
        if (l.user_id) mapped[l.id] = l.user_id;
      });
      setAssignments(mapped);
    }
  };

  const handleAssign = async (licenseId: string) => {
    const userId: string | null = assignments[licenseId] || null;
    const res = await fetch(`${API_BASE}/licenses/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ license_id: licenseId, user_id: userId }),
    });
    if (!res.ok) alert("❌ Failed to assign license");
    else fetchLicenses();
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/licenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newLicense),
      });
      if (res.ok) {
        setShowModal(false);
        setNewLicense({
          license_key: "",
          company: "",
          issued_at: "",
          expires_at: "",
          status: "active",
        });
        fetchLicenses();
      } else {
        const t = await res.text();
        let p: any;
        try {
          p = JSON.parse(t);
        } catch {
          p = { msg: t };
        }
        alert(`Failed to create license: ${p.msg || res.status}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLicense = async (id: string) => {
    if (!confirm("Delete this license?")) return;
    const res = await fetch(`${API_BASE}/licenses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchLicenses();
    else alert("❌ Failed to delete license");
  };

  useEffect(() => {
    fetchUsers();
    fetchLicenses();
  }, []);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div>
      <PageMeta title="Manage Licenses" description="Create and assign licenses" />
      <PageBreadcrumb pageTitle="License Management" />

      <div className={`${cardBase} overflow-hidden mt-2`}>
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-gray-100 dark:border-gray-800 border-b">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
              Licenses
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {licenses.length} {licenses.length === 1 ? "license" : "licenses"}
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
            New License
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-gray-400 dark:text-gray-500 text-xs text-left uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">License Key</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Validity</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Assigned To</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {licenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-gray-400 dark:text-gray-500 text-center"
                  >
                    No licenses yet. Click{" "}
                    <span className="font-medium">New License</span> to add one.
                  </td>
                </tr>
              ) : (
                licenses.map((lic) => (
                  <tr
                    key={lic.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-4 font-mono text-gray-800 dark:text-white/90 whitespace-nowrap">
                      {lic.license_key}
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {lic.company || "—"}
                    </td>
                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {fmt(lic.issued_at)} → {fmt(lic.expires_at)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lic.status} expires={lic.expires_at} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative w-44">
                        <select
                          className={tableSelectClass}
                          value={assignments[lic.id] || ""}
                          onChange={(e) =>
                            setAssignments({
                              ...assignments,
                              [lic.id]: e.target.value,
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                            </option>
                          ))}
                        </select>
                        <Chevron />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => handleAssign(lic.id)}>
                          Assign
                        </Button>
                        <button
                          onClick={() => handleDeleteLicense(lic.id)}
                          className="inline-flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 text-sm transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create-license modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-8">
          <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90 text-xl">
            Create New License
          </h3>
          <p className="mb-6 text-gray-500 dark:text-gray-400 text-sm">
            Generate a license — you can assign it to a user afterwards.
          </p>

          <form onSubmit={handleCreateLicense} className="space-y-5">
            <div>
              <label className={labelClass}>License Key</label>
              <input
                type="text"
                required
                placeholder="BAYU-XXXX-XXXX"
                value={newLicense.license_key}
                onChange={(e) =>
                  setNewLicense({ ...newLicense, license_key: e.target.value })
                }
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Company</label>
              <input
                type="text"
                placeholder="EETSB"
                value={newLicense.company}
                onChange={(e) =>
                  setNewLicense({ ...newLicense, company: e.target.value })
                }
                className={fieldClass}
              />
            </div>
            <div className="gap-4 grid grid-cols-2">
              <div>
                <label className={labelClass}>Issued</label>
                <input
                  type="date"
                  required
                  value={newLicense.issued_at}
                  onChange={(e) =>
                    setNewLicense({ ...newLicense, issued_at: e.target.value })
                  }
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Expires</label>
                <input
                  type="date"
                  required
                  value={newLicense.expires_at}
                  onChange={(e) =>
                    setNewLicense({ ...newLicense, expires_at: e.target.value })
                  }
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <div className="relative">
                <select
                  value={newLicense.status}
                  onChange={(e) =>
                    setNewLicense({ ...newLicense, status: e.target.value })
                  }
                  className={selectClass}
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
                <Chevron />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button disabled={creating}>
                {creating ? "Creating…" : "Create License"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
