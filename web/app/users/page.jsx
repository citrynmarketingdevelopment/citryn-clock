"use client";

import { useCallback, useEffect, useState } from "react";
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

function formatCreatedAt(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function UsersPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState(null);
  const [deleteVerifyInput, setDeleteVerifyInput] = useState("");
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/login");
        return;
      }

      const meData = await parseJsonSafe(meRes);
      if (meData.user?.role !== "ADMIN") {
        router.push("/timeclock");
        return;
      }
      setUser(meData.user);

      const usersRes = await fetch("/api/users", { cache: "no-store" });
      const usersData = await parseJsonSafe(usersRes);
      if (!usersRes.ok) {
        setError(usersData.error ?? "Unable to load users.");
        return;
      }

      setUsers(usersData.users ?? []);
    } catch {
      setError("Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openDeleteModal(targetUser) {
    if (!targetUser?.id || targetUser.id === user?.id) return;
    setDeleteVerifyInput("");
    setPendingDeleteUser(targetUser);
    setError(null);
  }

  function closeDeleteModal() {
    if (removingUserId) return;
    setPendingDeleteUser(null);
    setDeleteVerifyInput("");
  }

  async function onDeleteUser() {
    const targetUser = pendingDeleteUser;
    if (!targetUser?.id || targetUser.id === user?.id) return;

    setRemovingUserId(targetUser.id);
    setError(null);
    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUser.id }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to remove user.");
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== targetUser.id));
      closeDeleteModal();
    } catch {
      setError("Unable to remove user.");
    } finally {
      setRemovingUserId(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const typedEmailMatches =
    pendingDeleteUser && deleteVerifyInput.trim() === String(pendingDeleteUser.email || "").trim();

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="card card-strong">
        <div className="topbar">
          <div>
            <h1 className="headline">Users</h1>
            <p className="muted">{user ? `${user.name} (${user.email})` : "Loading admin..."}</p>
          </div>
          <span className="chip" data-status="WORKING">
            Total Users: {users.length}
          </span>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Manage Users</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Admins can remove user accounts. You cannot remove your own account.
        </p>

        {loading ? (
          <p className="muted">Loading users...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const deletingThisUser = removingUserId === item.id;
                const isSelf = item.id === user?.id;
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.role}</td>
                    <td>{formatCreatedAt(item.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openDeleteModal(item)}
                        disabled={deletingThisUser || isSelf}
                        title={isSelf ? "You cannot delete your own account." : "Remove user"}
                      >
                        {deletingThisUser ? "Removing..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>

      {pendingDeleteUser ? (
        <div className="users-delete-modal-backdrop" onClick={closeDeleteModal}>
          <section className="users-delete-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Verify User Deletion</h3>
            <p className="muted">
              Are you sure you want to remove user <strong>{pendingDeleteUser.email}</strong>?
            </p>
            <p className="muted">Type the user&apos;s email to verify deletion.</p>

            <input
              className="users-delete-verify-input"
              type="text"
              placeholder={pendingDeleteUser.email}
              value={deleteVerifyInput}
              onChange={(event) => setDeleteVerifyInput(event.target.value)}
              disabled={Boolean(removingUserId)}
            />

            <div className="users-delete-actions">
              <button type="button" className="secondary" onClick={closeDeleteModal} disabled={Boolean(removingUserId)}>
                Cancel
              </button>
              <button
                type="button"
                className="users-delete-confirm"
                onClick={onDeleteUser}
                disabled={!typedEmailMatches || Boolean(removingUserId)}
              >
                {removingUserId ? "Removing..." : "Remove User"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
