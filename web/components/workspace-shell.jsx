"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ProjectCreateDialog from "@/components/project-create-dialog";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function isActive(pathname, href) {
  if (href === "/timeclock" && pathname === "/dashboard") {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WorkspaceShell({ user, onLogout, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = user?.role;

  const [projects, setProjects] = useState([]);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadProjects().catch(() => {});
  }, [user?.id, loadProjects]);

  // Secondary nav (Projects is rendered as its own expandable group below).
  const navItems = [{ href: "/my-tasks", label: "My Tasks" }];
  if (role !== "ADMIN") {
    navItems.push({ href: "/timeclock", label: "Timeclock" });
  }
  navItems.push({ href: "/due-dates", label: "Due Dates" });
  navItems.push({ href: "/mojos-kitchen", label: "Mojo's Kitchen" });
  if (role === "ADMIN") {
    navItems.push({ href: "/timesheets", label: "Timesheets" });
    navItems.push({ href: "/users", label: "Users" });
  }

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <div className="ws-brand">
          <p className="ws-brand-kicker">Citryn</p>
          <h1 className="ws-brand-title">Workspace</h1>
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
                  projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className={classNames("ws-proj-item", pathname === `/projects/${project.id}` && "active")}
                    >
                      {project.name}
                    </Link>
                  ))
                )}
                <Link
                  href="/projects"
                  className={classNames("ws-proj-item", "ws-proj-add", pathname === "/projects" && "active")}
                >
                  All projects
                </Link>
              </div>
            ) : null}
          </div>

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames("ws-nav-item", isActive(pathname, item.href) && "active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ws-user-block">
          <div className="ws-user-row">
            <div className="ws-user-name">{user?.name || "Loading..."}</div>
            <Link href="/settings" className="ws-settings-link" aria-label="Profile settings" title="Profile settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.24.1.51.01.64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z" />
              </svg>
            </Link>
          </div>
          <div className="ws-user-email">{user?.email || ""}</div>
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
    </div>
  );
}
