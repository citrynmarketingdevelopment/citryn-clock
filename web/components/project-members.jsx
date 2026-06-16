"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const roles = ["MEMBER", "MANAGER"];

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Unexpected response (${response.status}).` };
  }
}

// Members drawer for a single project. Shown to the owner/managers so they can
// add people by email, change roles, and remove members. Wired to the existing
// GET/POST and the additive DELETE on /api/projects/[projectId]/members.
export default function ProjectMembers({ projectId, project, currentUser, onClose, onChanged }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", role: "MEMBER" });

  const ownerId = project?.owner?.id;

  const canManage = useMemo(() => {
    if (!currentUser || !project) return false;
    if (currentUser.id === ownerId) return true;
    return (project.members ?? []).some(
      (member) => member.user.id === currentUser.id && member.role === "MANAGER",
    );
  }, [currentUser, project, ownerId]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, { cache: "no-store" });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to load members.");
        return;
      }
      setMembers(data.members ?? []);
    } catch {
      setError("Unable to load members.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function onAddMember(event) {
    event.preventDefault();
    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), role: form.role }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to add member.");
        return;
      }
      setForm({ email: "", role: "MEMBER" });
      await loadMembers();
      onChanged?.();
    } catch {
      setError("Unable to add member.");
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(userId, role) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to update role.");
        return;
      }
      await loadMembers();
      onChanged?.();
    } catch {
      setError("Unable to update role.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveMember(userId) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to remove member.");
        return;
      }
      await loadMembers();
      onChanged?.();
    } catch {
      setError("Unable to remove member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="projectboard-modal-backdrop" onClick={() => (busy ? null : onClose())}>
      <section
        className="projectboard-modal members-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Project members"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="projectboard-modal-top">
          <div>
            <h2 className="members-modal-title">Members</h2>
            <p className="members-modal-sub">{project?.name || "Project"}</p>
          </div>
          <button type="button" className="projectboard-modal-close" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <div className="projectboard-modal-body">
          {canManage ? (
            <form className="members-add-form" onSubmit={onAddMember}>
              <input
                type="email"
                placeholder="Add member by email"
                value={form.email}
                disabled={busy}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <select
                aria-label="Member role"
                value={form.role}
                disabled={busy}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Add"}
              </button>
            </form>
          ) : (
            <p className="muted">Only the project owner or managers can change members.</p>
          )}

          <div className="members-list">
            {ownerId ? (
              <article className="members-row">
                <span className="members-avatar">{initials(project?.owner?.name)}</span>
                <div className="members-row-main">
                  <strong>{project?.owner?.name}</strong>
                  <small>{project?.owner?.email}</small>
                </div>
                <span className="members-role-tag owner">Owner</span>
              </article>
            ) : null}

            {loading ? (
              <p className="muted">Loading members...</p>
            ) : members.length === 0 ? (
              <p className="muted">No additional members yet.</p>
            ) : (
              members.map((member) => (
                <article key={member.user.id} className="members-row">
                  <span className="members-avatar">{initials(member.user.name)}</span>
                  <div className="members-row-main">
                    <strong>{member.user.name}</strong>
                    <small>{member.user.email}</small>
                  </div>
                  {canManage ? (
                    <div className="members-row-actions">
                      <select
                        aria-label={`Role for ${member.user.name}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => onChangeRole(member.user.id, event.target.value)}
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="members-remove secondary"
                        disabled={busy}
                        onClick={() => onRemoveMember(member.user.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="members-role-tag">{member.role}</span>
                  )}
                </article>
              ))
            )}
          </div>

          {error ? <p className="error space-top">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
