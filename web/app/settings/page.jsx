"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Unexpected response." };
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyInput, setVerifyInput] = useState("");
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) {
        router.push("/login");
        return;
      }

      const data = await parseJsonSafe(response);
      setUser(data.user);
      setForm({
        name: data.user?.name ?? "",
        email: data.user?.email ?? "",
        password: "",
      });
    } catch {
      setError("Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openVerifyModal(event) {
    event.preventDefault();
    setSuccessMessage(null);
    setError(null);
    setVerifyInput("");
    setShowVerifyModal(true);
  }

  function closeVerifyModal() {
    if (saving) return;
    setShowVerifyModal(false);
    setVerifyInput("");
  }

  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        name: form.name,
        email: form.email,
      };
      if (form.password.trim()) {
        payload.password = form.password;
      }

      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        setError(data.error ?? "Unable to save profile.");
        return;
      }

      setUser(data.user);
      setForm((current) => ({
        ...current,
        name: data.user?.name ?? current.name,
        email: data.user?.email ?? current.email,
        password: "",
      }));
      setShowVerifyModal(false);
      setVerifyInput("");
      setSuccessMessage("Profile updated.");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const expectedEmail = user?.email ?? "";
  const canConfirmSave = useMemo(
    () => verifyInput.trim().toLowerCase() === expectedEmail.toLowerCase() && !saving,
    [expectedEmail, verifyInput, saving],
  );

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="card card-strong">
        <div className="topbar">
          <div>
            <h1 className="headline">Profile Settings</h1>
            <p className="muted">{user ? `${user.name} (${user.email})` : "Loading profile..."}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Edit Profile</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Update your name, email, and password.
        </p>

        {loading ? (
          <p className="muted">Loading profile...</p>
        ) : (
          <form onSubmit={openVerifyModal}>
            <div className="row">
              <input
                required
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <input
                type="password"
                minLength={8}
                placeholder="New password (leave blank to keep current)"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
              <button type="submit">Save Changes</button>
            </div>
          </form>
        )}

        {successMessage ? <p className="space-top" style={{ color: "#0f766e" }}>{successMessage}</p> : null}
        {error ? <p className="error space-top">{error}</p> : null}
      </section>

      {showVerifyModal ? (
        <div className="users-delete-modal-backdrop" onClick={closeVerifyModal}>
          <section className="users-delete-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Verify Profile Update</h3>
            <p className="muted">
              Are you sure you want to save profile changes for <strong>{expectedEmail}</strong>?
            </p>
            <p className="muted">Type your email to verify save.</p>

            <input
              className="users-delete-verify-input"
              type="text"
              placeholder={expectedEmail}
              value={verifyInput}
              onChange={(event) => setVerifyInput(event.target.value)}
              disabled={saving}
            />

            <div className="users-delete-actions">
              <button type="button" className="secondary" onClick={closeVerifyModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="users-delete-confirm" onClick={saveProfile} disabled={!canConfirmSave}>
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
