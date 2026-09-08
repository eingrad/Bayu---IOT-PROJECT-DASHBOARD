import { useEffect, useState, Fragment } from "react";
import { Modal } from "../../ui/modal";
import Button from "../../ui/button/Button";
import Label from "../../form/Label";
import Input from "../../form/input/InputField";

interface User {
  id: string;
  username: string;
  role: string;
  created_at: string;
  company_id: string;
}

interface Company {
  id: string;
  name: string;
}

const cardBase =
  "bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl";
const selectClass =
  "w-full h-11 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent dark:bg-gray-900 px-4 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

function initials(username: string): string {
  const local = (username.split("@")[0] || username).replace(/[^a-zA-Z0-9]/g, "");
  return (local.slice(0, 2) || "U").toUpperCase();
}

function RoleBadge({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        admin
          ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          admin ? "bg-brand-500" : "bg-gray-400"
        }`}
      />
      {admin ? "Admin" : "User"}
    </span>
  );
}

export default function BasicTableOneX() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "user",
    company_id: "",
  });

  useEffect(() => {
    fetch("http://localhost:5000/users", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data: User[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("http://localhost:5000/companies", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data: Company[]) => setCompanies(data))
      .catch(console.error);
  }, []);

  const emptyForm = { username: "", password: "", role: "user", company_id: "" };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setForm({
      username: u.username,
      password: "",
      role: u.role,
      company_id: u.company_id || "",
    });
    setEditingId(u.id);
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
        ? `http://localhost:5000/users/${editingId}`
        : "http://localhost:5000/users";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });

      const text = await res.text();
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { msg: text };
      }
      if (!res.ok) throw new Error(payload.msg || `HTTP ${res.status}`);

      if (editingId) {
        setUsers((u) =>
          u.map((x) => (x.id === editingId ? (payload as User) : x))
        );
      } else {
        setUsers((u) => [payload as User, ...u]);
      }
      closeModal();
    } catch (err: any) {
      console.error("SaveUser failed:", err.message);
      alert(`Error saving user: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`http://localhost:5000/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (res.ok) {
      setUsers((u) => u.filter((x) => x.id !== id));
    } else {
      const t = await res.text();
      let p: any;
      try {
        p = JSON.parse(t);
      } catch {
        p = { msg: t };
      }
      alert(`Failed to delete user: ${p.msg || res.status}`);
    }
  };

  return (
    <Fragment>
      <div className={`${cardBase} overflow-hidden`}>
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-gray-100 dark:border-gray-800 border-b">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90 text-lg">
              Users
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {users.length} {users.length === 1 ? "account" : "accounts"}
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
            Create User
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-gray-400 dark:text-gray-500 text-xs text-left uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-12 text-gray-400 dark:text-gray-500 text-center"
                  >
                    No users yet. Click{" "}
                    <span className="font-medium">Create User</span> to add one.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-none justify-center items-center bg-brand-500/10 rounded-full w-9 h-9 font-semibold text-brand-600 dark:text-brand-400 text-xs">
                          {initials(u.username)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 dark:text-white/90 truncate">
                            {u.username}
                          </div>
                          <div className="font-mono text-gray-400 dark:text-gray-500 text-xs">
                            {u.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="inline-flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-white/[0.05] px-3 py-2 rounded-lg font-medium text-gray-600 dark:text-gray-300 text-sm transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
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

      {/* Create-user modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-8">
          <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90 text-xl">
            {editingId ? "Edit User" : "Create New User"}
          </h3>
          <p className="mb-6 text-gray-500 dark:text-gray-400 text-sm">
            {editingId
              ? "Update the user's details. Leave the password blank to keep it unchanged."
              : "Add a new user account and assign them to a company."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label>Username</Label>
              <Input
                placeholder="user@company.com"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder={
                  editingId ? "Leave blank to keep current" : "••••••••"
                }
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                required={!editingId}
              />
            </div>

            <div className="gap-4 grid grid-cols-2">
              <div>
                <Label>Role</Label>
                <select
                  className={selectClass}
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role: e.target.value }))
                  }
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <Label>Company</Label>
                <select
                  className={selectClass}
                  value={form.company_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, company_id: e.target.value }))
                  }
                  required
                >
                  <option value="" disabled>
                    -- Select --
                  </option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                    : "Creating…"
                  : editingId
                  ? "Save Changes"
                  : "Create User"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </Fragment>
  );
}
