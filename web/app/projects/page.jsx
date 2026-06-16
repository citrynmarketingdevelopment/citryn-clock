"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import ProjectCreateDialog from "@/components/project-create-dialog";
import { initials } from "@/lib/task-format";

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const projectsRes = await fetch("/api/projects", { cache: "no-store" });
      const projectsData = await projectsRes.json();
      if (!projectsRes.ok) {
        setError(projectsData.error ?? "Unable to load projects.");
        return;
      }
      setProjects(projectsData.projects ?? []);
    } finally {
      setLoadingProjects(false);
    }
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load projects."));
  }, [loadData]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="projects-shell">
        <header className="projects-header">
          <div>
            <h1>Projects</h1>
            <p className="muted">Open a project from the sidebar, or create a new one.</p>
          </div>
          <button type="button" className="projects-create-btn" onClick={() => setShowCreate(true)}>
            + Create project
          </button>
        </header>

        {showCreate ? (
          <ProjectCreateDialog
            onClose={() => setShowCreate(false)}
            onCreated={(project) => {
              setShowCreate(false);
              router.push(`/projects/${project.id}`);
            }}
          />
        ) : null}

        {loadingProjects ? (
          <p className="muted">Loading projects...</p>
        ) : projects.length === 0 ? (
          <section className="projects-empty">
            <h2>No projects yet</h2>
            <p className="muted">Create your first project to start planning work.</p>
            <button type="button" className="projects-create-btn" onClick={() => setShowCreate(true)}>
              + Create project
            </button>
          </section>
        ) : (
          <div className="projects-quicklist">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="projects-quicklist-item"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <span className="projects-quicklist-badge">{initials(project.name)}</span>
                <span className="projects-quicklist-main">
                  <strong>{project.name}</strong>
                  <small>{project.taskCount} tasks · {project.dueSoonCount} due soon</small>
                </span>
              </button>
            ))}
          </div>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
