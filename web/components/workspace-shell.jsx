"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PageIconBadge } from "@/components/page-icon-picker";
import ProjectCreateDialog from "@/components/project-create-dialog";
import SettingsDialog from "@/components/settings-dialog";
import { reorderProjects } from "@/lib/task-client";
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
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [showSettings, setShowSettings] = useState(initialSettingsOpen);
  const [settingsPage, setSettingsPage] = useState(initialSettingsPage);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");

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

  function onDropProject(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...projects];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setProjects(reordered);
    setDragIndex(null);
    reorderProjects(reordered.map((project) => project.id)).catch(() => loadProjects());
  }

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
          <div className="ws-appflowy-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>citryn</strong>
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
          <div className="ws-nav-group">
            <div className="ws-nav-group-bar">
              <button
                type="button"
                className="ws-nav-group-head"
                onClick={() => setProjectsOpen((value) => !value)}
                aria-expanded={projectsOpen}
              >
                <span className={classNames("ws-nav-group-caret", projectsOpen && "open")}>›</span>
                <span className="ws-nav-icon home">⌂</span>
                Projects
              </button>
              <button
                type="button"
                className="ws-nav-group-add"
                onClick={() => setShowCreate(true)}
                aria-label="New project"
                title="New project"
              >
                +
              </button>
            </div>

            {projectsOpen ? (
              <div className="ws-proj-list">
                {projects.length === 0 ? (
                  <p className="ws-proj-empty">No projects yet.</p>
                ) : (
                  projects.map((project, index) => (
                    <button
                      key={project.id}
                      type="button"
                      draggable
                      className={classNames(
                        "ws-proj-item",
                        pathname === `/projects/${project.id}` && "active",
                        dragIndex === index && "dragging",
                      )}
                      onClick={() => router.push(`/projects/${project.id}`)}
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onDropProject(index)}
                      onDragEnd={() => setDragIndex(null)}
                    >
                      <PageIconBadge storageKey={`citryn:page-icon:project:${project.id}`} fallback={initials(project.name)} />
                      <span>{project.name}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

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
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
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
    </div>
  );
}
