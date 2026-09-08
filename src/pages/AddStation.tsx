import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";

interface Station {
  id: string;
  device_id: string | null;
  device_name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  battery: number | null;
  user_id: string | null;
  owner: string | null;
}

interface UserOpt {
  id: string;
  username: string;
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const fieldClass =
  "w-full h-11 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 px-4 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const selectClass =
  "w-full h-11 appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 pl-4 pr-10 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
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

function StatusPill({ status }: { status: string }) {
  const online = String(status).toLowerCase() === "online";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        online
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          online ? "bg-emerald-500" : "bg-gray-400"
        }`}
      />
      {online ? "Online" : status || "Offline"}
    </span>
  );
}

export default function AddStation() {
  const [stations, setStations] = useState<Station[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    device_name: "",
    device_id: "",
    location: "",
    latitude: "",
    longitude: "",
    status: "online",
    user_id: "",
  });

  const token = localStorage.getItem("token");

  const fetchStations = async () => {
    const res = await fetch("http://localhost:5000/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setStations(await res.json());
  };

  const fetchUsers = async () => {
    const res = await fetch("http://localhost:5000/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUsers(await res.json());
  };

  useEffect(() => {
    fetchStations();
    fetchUsers();
  }, []);

  const emptyForm = {
    device_name: "",
    device_id: "",
    location: "",
    latitude: "",
    longitude: "",
    status: "online",
    user_id: "",
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (s: Station) => {
    setForm({
      device_name: s.device_name || "",
      device_id: s.device_id || "",
      location: s.location || "",
      latitude: s.latitude != null ? String(s.latitude) : "",
      longitude: s.longitude != null ? String(s.longitude) : "",
      status: s.status || "offline",
      user_id: s.user_id || "",
    });
    setEditingId(s.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingId
        ? `http://localhost:5000/devices/${editingId}`
        : "http://localhost:5000/devices";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const text = await res.text();
      let p: any;
      try {
        p = JSON.parse(text);
      } catch {
        p = { msg: text };
      }
      if (!res.ok) throw new Error(p.msg || `HTTP ${res.status}`);
      closeModal();
      fetchStations();
    } catch (err: any) {
      alert(`Error saving station: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this station?")) return;
    const res = await fetch(`http://localhost:5000/devices/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchStations();
    else {
      const t = await res.text();
      alert(`Failed to delete: ${t}`);
    }
  };

  const coords = (s: Station) =>
    s.latitude != null && s.longitude != null
      ? `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}`
      : "—";

  return (
    <div>
      <PageMeta title="Add Station" description="Create and manage stations" />
      <PageBreadcrumb pageTitle="Add Station" />

      <div className={`${cardBase} overflow-hidden mt-2`}>
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-gray-100 dark:border-gray-800 border-b">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
              Stations
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {stations.length} {stations.length === 1 ? "station" : "stations"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={openCreate}
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
            Add Station
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-gray-400 dark:text-gray-500 text-xs text-left uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Station</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Coordinates</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stations.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-gray-400 dark:text-gray-500 text-center"
                  >
                    No stations yet. Click{" "}
                    <span className="font-medium">Add Station</span> to create one.
                  </td>
                </tr>
              ) : (
                stations.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {s.device_name}
                      </div>
                      <div className="font-mono text-gray-400 dark:text-gray-500 text-xs">
                        {s.device_id || s.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {s.location || "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {coords(s)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {s.owner || (
                        <span className="text-gray-300 dark:text-gray-600">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-white/[0.05] px-3 py-2 rounded-lg font-medium text-gray-600 dark:text-gray-300 text-sm transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
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

      {/* Add-station modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-8">
          <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90 text-xl">
            {editingId ? "Edit Station" : "Add New Station"}
          </h3>
          <p className="mb-6 text-gray-500 dark:text-gray-400 text-sm">
            The coordinates place the station on the map and drive its owner's
            weather forecast.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="gap-4 grid grid-cols-2">
              <div>
                <label className={labelClass}>Station Name</label>
                <input
                  type="text"
                  required
                  placeholder="Station A"
                  value={form.device_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, device_name: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Device ID</label>
                <input
                  type="text"
                  placeholder="BAYU-XXXX"
                  value={form.device_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, device_id: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Location (city / area)</label>
              <input
                type="text"
                placeholder="e.g. Kuala Lumpur"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                className={fieldClass}
              />
            </div>

            <div className="gap-4 grid grid-cols-2">
              <div>
                <label className={labelClass}>Latitude</label>
                <input
                  type="text"
                  placeholder="3.139"
                  value={form.latitude}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, latitude: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Longitude</label>
                <input
                  type="text"
                  placeholder="101.6869"
                  value={form.longitude}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, longitude: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="gap-4 grid grid-cols-2">
              <div>
                <label className={labelClass}>Status</label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                  <Chevron />
                </div>
              </div>
              <div>
                <label className={labelClass}>Assign to User</label>
                <div className="relative">
                  <select
                    value={form.user_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, user_id: e.target.value }))
                    }
                    className={selectClass}
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
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button disabled={loading}>
                {loading
                  ? editingId
                    ? "Saving…"
                    : "Adding…"
                  : editingId
                  ? "Save Changes"
                  : "Add Station"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
