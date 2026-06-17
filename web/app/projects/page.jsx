"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import { PageIconBadge } from "@/components/page-icon-picker";
import ProjectCreateDialog from "@/components/project-create-dialog";
import { initials } from "@/lib/task-format";

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");

  const loadData = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setLoadingProjects(true);
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

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.name, project.description ?? ""].join(" ").toLowerCase().includes(needle),
    );
  }, [projects, query]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="projects-shell">
        <header className="projects-header">
          <div>
            <h1>Projects</h1>
            <p className="muted">All your active projects in one place.</p>
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
              loadData(false);
              router.push(`/projects/${project.id}`);
            }}
          />
        ) : null}

        <div className="projects-search-row">
          <input
            className="projects-search"
            placeholder="Find a project..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loadingProjects ? (
          <section className="projects-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={`skel-${index}`} className="project-card skeleton">
                <div className="project-card-top">
                  <span className="project-badge skeleton-block skeleton-shimmer" />
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 68, height: 11 }} />
                </div>
                <div className="skeleton-block skeleton-shimmer" style={{ width: "60%", height: 18, marginBottom: 8 }} />
                <div className="skeleton-block skeleton-shimmer" style={{ width: "96%", height: 12, marginBottom: 5 }} />
                <div className="skeleton-block skeleton-shimmer" style={{ width: "74%", height: 12, marginBottom: 12 }} />
                <div className="project-card-meta">
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 64, height: 11 }} />
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 72, height: 11 }} />
                </div>
              </article>
            ))}
          </section>
        ) : projects.length === 0 ? (
          <section className="projects-empty">
            <h2>No projects yet</h2>
            <p className="muted">Create your first project to start planning work.</p>
            <button type="button" className="projects-create-btn" onClick={() => setShowCreate(true)}>
              + Create project
            </button>
          </section>
        ) : (
          <>
            <section className="projects-grid">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="project-card"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <div className="project-card-top">
                    <PageIconBadge
                      storageKey={`citryn:page-icon:project:${project.id}`}
                      fallback={initials(project.name)}
                      className="project-badge"
                    />
                    <span className="project-updated">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h2>{project.name}</h2>
                  <p>{project.description || "No description yet."}</p>
                  <div className="project-card-meta">
                    <span>{project.taskCount} tasks</span>
                    <span>{project.dueSoonCount} due soon</span>
                  </div>
                </button>
              ))}
            </section>
            {filteredProjects.length === 0 && query ? (
              <p className="muted" style={{ marginTop: 16 }}>No projects match &ldquo;{query}&rdquo;.</p>
            ) : null}
          </>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
