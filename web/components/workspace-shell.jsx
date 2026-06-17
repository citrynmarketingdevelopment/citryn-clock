"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PageIconBadge } from "@/components/page-icon-picker";
import ProjectCreateDialog from "@/components/project-create-dialog";
import SettingsDialog from "@/components/settings-dialog";
import SidebarSpaces from "@/components/sidebar-spaces";
import GlobalSearch from "@/components/global-search";
import { initials } from "@/lib/task-format";
import { applyAppearanceTheme, readAppearanceTheme, readWorkspaceName } from "@/lib/workspace-preferences";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function isActive(pathname, href) {
  if (href === "/timeclock" && pathname === "/dashboard") {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function favoritesKey(userId) {
  return userId ? `citryn:project-favorites:${userId}` : null;
}

function readFavorites(userId) {
  const key = favoritesKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFavorites(userId, ids) {
  const key = favoritesKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("citryn-favorites-changed"));
  } catch {}
}

export default function WorkspaceShell({
  user,
  onLogout,
  children,
  initialSettingsOpen = false,
  initialSettingsPage = "account",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(user);
  const role = currentUser?.role;

  const [projects, setProjects] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createSpaceId, setCreateSpaceId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(initialSettingsOpen);
  const [settingsPage, setSettingsPage] = useState(initialSettingsPage);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    setFavorites(readFavorites(userId));

    function onChanged() {
      setFavorites(readFavorites(userId));
    }
    window.addEventListener("citryn-favorites-changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("citryn-favorites-changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [currentUser?.id]);

  function toggleFavorite(event, projectId) {
    event.stopPropagation();
    const userId = currentUser?.id;
    if (!userId) return;
    setFavorites((current) => {
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];
      writeFavorites(userId, next);
      return next;
    });
  }

  useEffect(() => {
    setShowSettings(initialSettingsOpen);
    setSettingsPage(initialSettingsPage);
  }, [initialSettingsOpen, initialSettingsPage]);

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    loadProjects().catch(() => {});
  }, [user?.id, loadProjects]);

  useEffect(() => {
    setWorkspaceName(readWorkspaceName());
    applyAppearanceTheme(readAppearanceTheme());
    function syncPreferences() {
      setWorkspaceName(readWorkspaceName());
      applyAppearanceTheme(readAppearanceTheme());
    }
    window.addEventListener("storage", syncPreferences);
    window.addEventListener("citryn-page-icon", syncPreferences);
    window.addEventListener("citryn-preferences", syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener("citryn-page-icon", syncPreferences);
      window.removeEventListener("citryn-preferences", syncPreferences);
    };
  }, []);

  const favoritedProjects = projects.filter((project) => favorites.includes(project.id));

  // Secondary nav (Projects is rendered as its own expandable group below).
  const navItems = [{ href: "/my-tasks", label: "My Tasks", icon: "✅", iconKey: "citryn:page-icon:my-tasks" }];
  if (role !== "ADMIN") {
    navItems.push({ href: "/timeclock", label: "Timeclock", icon: "⏱️", iconKey: "citryn:page-icon:dashboard" });
  }
  navItems.push({ href: "/mojos-kitchen", label: "Mojo's Kitchen", icon: "🍽️" });
  if (role === "ADMIN") {
    navItems.push({ href: "/timesheets", label: "Timesheets", icon: "🧾" });
    navItems.push({ href: "/users", label: "Users", icon: "○" });
  }

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <div className="ws-brand">
          <img src="/Logo Trademark.svg" alt="Citryn" className="ws-brand-logo" />
          <strong>Citryn</strong>
        </div>

        <div className="ws-workspace-row">
          <span className="ws-workspace-avatar">{initials(currentUser?.name || "My Workspace")}</span>
          <span>{workspaceName}</span>
          <button
            type="button"
            className="ws-icon-button"
            aria-label="Profile settings"
            title="Profile settings"
            onClick={() => {
              setSettingsPage("account");
              setShowSettings(true);
            }}
          >
            ⚙
          </button>
        </div>

        <nav className="ws-nav">
          <button type="button" className="ws-nav-item ws-search-trigger" onClick={() => setShowSearch(true)}>
            <span className="ws-nav-icon search">⌕</span>
            <span>Search</span>
          </button>

          <Link
            href="/projects"
            className={classNames("ws-nav-item", pathname === "/projects" && "active")}
          >
            <span className="ws-nav-icon dashboard">⊞</span>
            <span>Dashboard</span>
          </Link>

          <SidebarSpaces
            projects={projects}
            currentUserId={currentUser?.id}
            pathname={pathname}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onCreateProject={(spaceId) => {
              setCreateSpaceId(spaceId ?? null);
              setShowCreate(true);
            }}
            onProjectsReload={loadProjects}
          />

          {favoritedProjects.length > 0 ? (
            <div className="ws-nav-group">
              <div className="ws-nav-group-bar">
                <button
                  type="button"
                  className="ws-nav-group-head"
                  onClick={() => setFavoritesOpen((value) => !value)}
                  aria-expanded={favoritesOpen}
                >
                  <span className={classNames("ws-nav-group-caret", favoritesOpen && "open")}>›</span>
                  <span className="ws-nav-icon fav">★</span>
                  Favorites
                </button>
              </div>

              {favoritesOpen ? (
                <div className="ws-proj-list">
                  {favoritedProjects.map((project) => (
                    <div key={project.id} className="ws-proj-item-row">
                      <button
                        type="button"
                        className={classNames("ws-proj-item", pathname === `/projects/${project.id}` && "active")}
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <PageIconBadge storageKey={`citryn:page-icon:project:${project.id}`} fallback={initials(project.name)} />
                        <span className="ws-proj-item-name">{project.name}</span>
                      </button>
                      <button
                        type="button"
                        className="ws-proj-star starred"
                        onClick={(event) => toggleFavorite(event, project.id)}
                        aria-label="Remove from favorites"
                        title="Remove from favorites"
                      >
                        ★
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames("ws-nav-item", isActive(pathname, item.href) && "active")}
            >
              {item.iconKey ? (
                <PageIconBadge storageKey={item.iconKey} fallback={item.icon} />
              ) : (
                <span className="ws-nav-icon">{item.icon}</span>
              )}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="ws-user-block">
          <div className="ws-user-row">
            <div className="ws-user-name">{currentUser?.name || "Loading..."}</div>
            <button
              type="button"
              className="ws-settings-link"
              aria-label="Profile settings"
              title="Profile settings"
              onClick={() => {
                setSettingsPage("account");
                setShowSettings(true);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.24.1.51.01.64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z" />
              </svg>
            </button>
          </div>
          <div className="ws-user-email">{currentUser?.email || ""}</div>
          <button className="ws-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="ws-content">{children}</main>

      {showCreate ? (
        <ProjectCreateDialog
          spaceId={createSpaceId}
          onClose={() => {
            setShowCreate(false);
            setCreateSpaceId(null);
          }}
          onCreated={(project) => {
            setShowCreate(false);
            setCreateSpaceId(null);
            setProjects((current) => [{ ...project, taskCount: 0, dueSoonCount: 0 }, ...current]);
            router.push(`/projects/${project.id}`);
          }}
        />
      ) : null}

      {showSettings ? (
        <SettingsDialog
          currentUser={currentUser}
          initialPage={settingsPage}
          onClose={() => setShowSettings(false)}
          onLogout={onLogout}
          onUserUpdated={setCurrentUser}
        />
      ) : null}

      {showSearch ? <GlobalSearch onClose={() => setShowSearch(false)} /> : null}
    </div>
  );
}
