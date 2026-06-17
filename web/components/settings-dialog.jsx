"use client";

import { useEffect, useMemo, useState } from "react";
import { PageIconBadge } from "@/components/page-icon-picker";
import PageIconPicker from "@/components/page-icon-picker";
import { initials } from "@/lib/task-format";
import {
  WORKSPACE_ICON_KEY,
  appearanceThemes,
  applyAppearanceTheme,
  readAppearanceTheme,
  readWorkspaceName,
  writeAppearanceTheme,
  writeWorkspaceName,
} from "@/lib/workspace-preferences";

const roleOptions = ["ADMIN", "EMPLOYEE"];

const settingsPages = [
  { key: "account", label: "My Account", icon: "◌" },
  { key: "workspace", label: "Workspace", icon: "□" },
  { key: "members", label: "Members", icon: "◎", adminOnly: true },
  { key: "appearance", label: "Appearance", icon: "◈" },
];

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Unexpected response (${response.status}).` };
  }
}

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function SettingsSection({ title, description, children, action = null }) {
  return (
    <section className="afsettings-section">
      <div className="afsettings-section-head">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="afsettings-section-body">{children}</div>
    </section>
  );
}

export default function SettingsDialog({
  currentUser,
  initialPage = "account",
  onClose,
  onLogout,
  onUserUpdated,
}) {
  const [activePage, setActivePage] = useState(initialPage);
  const [user, setUser] = useState(currentUser);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [appearanceTheme, setAppearanceTheme] = useState("midnight");
  const [accountForm, setAccountForm] = useState({ name: "", email: "", password: "" });
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
  });

  const visiblePages = useMemo(
    () => settingsPages.filter((page) => !page.adminOnly || user?.role === "ADMIN"),
    [user?.role],
  );

  useEffect(() => {
    setWorkspaceName(readWorkspaceName());
    const theme = readAppearanceTheme();
    setAppearanceTheme(theme);
    applyAppearanceTheme(theme);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = await parseJsonSafe(response);
        if (!response.ok || !data.user) {
          setError(data.error ?? "Unable to load settings.");
          return;
        }
        if (cancelled) return;
        setUser(data.user);
        onUserUpdated?.(data.user);
        setAccountForm({
          name: data.user.name ?? "",
          email: data.user.email ?? "",
          password: "",
        });
      } catch {
        if (!cancelled) setError("Unable to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, [onUserUpdated]);

  useEffect(() => {
    if (activePage !== "members" || user?.role !== "ADMIN") return;
    let cancelled = false;
    async function loadUsers() {
      setLoadingUsers(true);
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const data = await parseJsonSafe(response);
        if (!cancelled) {
          if (!response.ok) setError(data.error ?? "Unable to load users.");
          else setUsers(data.users ?? []);
        }
      } catch {
        if (!cancelled) setError("Unable to load users.");
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [activePage, user?.role]);

  async function saveAccount() {
    setSavingAccount(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: accountForm.name,
        email: accountForm.email,
      };
      if (accountForm.password.trim()) payload.password = accountForm.password;

      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.user) {
        setError(data.error ?? "Unable to save account.");
        return;
      }
      setUser(data.user);
      onUserUpdated?.(data.user);
      setAccountForm((current) => ({ ...current, password: "" }));
      setSuccess("Account updated.");
    } catch {
      setError("Unable to save account.");
    } finally {
      setSavingAccount(false);
    }
  }

  function saveWorkspace() {
    setSavingWorkspace(true);
    setError(null);
    setSuccess(null);
    writeWorkspaceName(workspaceName);
    setTimeout(() => {
      setSavingWorkspace(false);
      setSuccess("Workspace updated.");
    }, 120);
  }

  function applyTheme(theme) {
    setAppearanceTheme(theme);
    writeAppearanceTheme(theme);
    setSuccess("Appearance updated.");
  }

  async function createUser(event) {
    event.preventDefault();
    setCreatingUser(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserForm),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.user) {
        setError(data.error ?? "Unable to create user.");
        return;
      }
      setUsers((current) => [...current, data.user]);
      setNewUserForm({ name: "", email: "", password: "", role: "EMPLOYEE" });
      setSuccess("User created.");
    } catch {
      setError("Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  }

  async function changeUserRole(userId, role) {
    setBusyUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.user) {
        setError(data.error ?? "Unable to update role.");
        return;
      }
      setUsers((current) => current.map((item) => (item.id === userId ? data.user : item)));
      setSuccess("User updated.");
    } catch {
      setError("Unable to update role.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeUser(userId) {
    setBusyUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to remove user.");
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== userId));
      setSuccess("User removed.");
    } catch {
      setError("Unable to remove user.");
    } finally {
      setBusyUserId(null);
    }
  }

  const activeMeta = visiblePages.find((page) => page.key === activePage) ?? visiblePages[0];

  return (
    <div className="afsettings-backdrop" onClick={onClose}>
      <section className="afsettings-dialog" role="dialog" aria-modal="true" aria-label="Settings" onClick={(event) => event.stopPropagation()}>
        <aside className="afsettings-menu">
          <div className="afsettings-menu-head">
            <h2>Settings</h2>
          </div>
          <nav className="afsettings-menu-list">
            {visiblePages.map((page) => (
              <button
                key={page.key}
                type="button"
                className={classNames("afsettings-menu-item", activeMeta.key === page.key && "active")}
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setActivePage(page.key);
                }}
              >
                <span className="afsettings-menu-icon">{page.icon}</span>
                <span>{page.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="afsettings-panel">
          <header className="afsettings-panel-head">
            <div>
              <h1>{activeMeta.label}</h1>
              <p>{activeMeta.key === "account" ? "Manage your profile and account access." : null}</p>
            </div>
            <button type="button" className="afsettings-close" onClick={onClose}>
              Close
            </button>
          </header>

          <div className="afsettings-panel-body">
            {loading ? <p className="muted">Loading settings...</p> : null}

            {!loading && activeMeta.key === "account" ? (
              <>
                <SettingsSection title="My Profile">
                  <div className="afsettings-profile-row">
                    <span className="afsettings-profile-avatar">{initials(accountForm.name || user?.name || "U")}</span>
                    <div className="afsettings-profile-main">
                      <strong>{accountForm.name || user?.name}</strong>
                      <span>{user?.email}</span>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection title="My Account">
                  <div className="afsettings-form-grid">
                    <label className="afsettings-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={accountForm.name}
                        onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="afsettings-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={accountForm.email}
                        onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
                      />
                    </label>
                    <label className="afsettings-field">
                      <span>New Password</span>
                      <input
                        type="password"
                        placeholder="Leave blank to keep current password"
                        value={accountForm.password}
                        onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="afsettings-actions">
                    <button type="button" onClick={saveAccount} disabled={savingAccount}>
                      {savingAccount ? "Saving..." : "Save account"}
                    </button>
                    <button type="button" className="secondary" onClick={onLogout}>
                      Log out
                    </button>
                  </div>
                </SettingsSection>
              </>
            ) : null}

            {!loading && activeMeta.key === "workspace" ? (
              <>
                <SettingsSection title="Workspace Profile" description="Mirror AppFlowy's workspace identity with a local workspace name and icon.">
                  <div className="afsettings-workspace-row">
                    <PageIconPicker storageKey={WORKSPACE_ICON_KEY} fallback="⌂" label="Workspace icon" />
                    <label className="afsettings-field workspace-name">
                      <span>Workspace Name</span>
                      <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                    </label>
                  </div>
                  <div className="afsettings-actions">
                    <button type="button" onClick={saveWorkspace} disabled={savingWorkspace}>
                      {savingWorkspace ? "Saving..." : "Save workspace"}
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection title="Workspace Preview">
                  <div className="afsettings-preview">
                    <PageIconBadge storageKey={WORKSPACE_ICON_KEY} fallback="⌂" className="afsettings-preview-icon" />
                    <div>
                      <strong>{workspaceName}</strong>
                      <p>Shown in the sidebar workspace header.</p>
                    </div>
                  </div>
                </SettingsSection>
              </>
            ) : null}

            {!loading && activeMeta.key === "members" && user?.role === "ADMIN" ? (
              <>
                <SettingsSection title="Add User" description="Create a new workspace user account.">
                  <form className="afsettings-user-create" onSubmit={createUser}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newUserForm.name}
                      onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newUserForm.email}
                      onChange={(event) => setNewUserForm((current) => ({ ...current, email: event.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Temporary password"
                      value={newUserForm.password}
                      onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))}
                    />
                    <select
                      value={newUserForm.role}
                      onChange={(event) => setNewUserForm((current) => ({ ...current, role: event.target.value }))}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={creatingUser}>
                      {creatingUser ? "Creating..." : "Add user"}
                    </button>
                  </form>
                </SettingsSection>

                <SettingsSection title="Members" description="Manage user roles and remove access.">
                  {loadingUsers ? (
                    <p className="muted">Loading users...</p>
                  ) : (
                    <div className="afsettings-members-list">
                      {users.map((item) => (
                        <article key={item.id} className="afsettings-member-row">
                          <span className="afsettings-member-avatar">{initials(item.name)}</span>
                          <div className="afsettings-member-main">
                            <strong>{item.name}</strong>
                            <span>{item.email}</span>
                          </div>
                          <select
                            value={item.role}
                            disabled={busyUserId === item.id || item.id === user.id}
                            onChange={(event) => changeUserRole(item.id, event.target.value)}
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="secondary danger"
                            disabled={busyUserId === item.id || item.id === user.id}
                            onClick={() => removeUser(item.id)}
                          >
                            {busyUserId === item.id ? "Working..." : "Remove"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </SettingsSection>
              </>
            ) : null}

            {!loading && activeMeta.key === "appearance" ? (
              <>
                <SettingsSection title="Theme">
                  <div className="afsettings-theme-grid">
                    {appearanceThemes.map((theme) => (
                      <button
                        key={theme.key}
                        type="button"
                        className={classNames("afsettings-theme-card", appearanceTheme === theme.key && "active")}
                        onClick={() => applyTheme(theme.key)}
                      >
                        <span className={`afsettings-theme-swatch ${theme.key}`} />
                        <strong>{theme.label}</strong>
                        <small>{theme.key === "midnight" ? "Current dark Citryn palette" : "Purple AppFlowy accent palette"}</small>
                      </button>
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection title="Current Preference">
                  <div className="afsettings-inline-note">
                    <span className="chip" data-status="WORKING">
                      {appearanceThemes.find((theme) => theme.key === appearanceTheme)?.label ?? appearanceTheme}
                    </span>
                    <p>This updates the app theme locally on this device.</p>
                  </div>
                </SettingsSection>
              </>
            ) : null}

            {success ? <p className="space-top" style={{ color: "#0f766e" }}>{success}</p> : null}
            {error ? <p className="error space-top">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
