"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

function initials(name) {
  return (name || "P")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const loadData = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) {
      setLoadingProjects(true);
    }
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

  async function onCreateProject(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to create project.");
        return;
      }

      setForm({ name: "", description: "" });
      setShowCreate(false);
      await loadData(false);
    } catch {
      setError("Unable to create project.");
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.name, project.description || ""].join(" ").toLowerCase().includes(needle),
    );
  }, [projects, query]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="projects-shell">
        <header className="projects-header">
          <h1>Browse projects</h1>
          <button type="button" className="projects-create-btn" onClick={() => setShowCreate((value) => !value)}>
            + Create project
          </button>
        </header>

        {showCreate ? (
          <section className="projects-create-panel">
            <form onSubmit={onCreateProject}>
              <div className="row">
                <input
                  required
                  placeholder="Project name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
                <button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <div className="projects-search-row">
          <input
            className="projects-search"
            placeholder="Find a project"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loadingProjects ? (
          <section className="projects-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <article key={`project-skeleton-${index}`} className="project-card skeleton">
                <div className="project-card-top">
                  <span className="project-badge skeleton-block skeleton-shimmer" />
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 80, height: 12 }} />
                </div>
                <div className="skeleton-block skeleton-shimmer" style={{ width: "55%", height: 18, marginBottom: 10 }} />
                <div className="skeleton-block skeleton-shimmer" style={{ width: "96%", height: 12, marginBottom: 6 }} />
                <div className="skeleton-block skeleton-shimmer" style={{ width: "72%", height: 12, marginBottom: 12 }} />
                <div className="project-card-meta">
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 70, height: 11 }} />
                  <span className="skeleton-block skeleton-shimmer" style={{ width: 78, height: 11 }} />
                </div>
              </article>
            ))}
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
                    <span className="project-badge">{initials(project.name)}</span>
                    <span className="project-updated">{new Date(project.updatedAt).toLocaleDateString()}</span>
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
            {filteredProjects.length === 0 ? <p className="mytasks-empty">No matching projects.</p> : null}
          </>
        )}
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
