"use client";

import { useEffect, useState } from "react";
import { initials } from "@/lib/task-format";

// AppFlowy-style centered "create project" dialog. Shared by the projects
// landing and the sidebar "+ New project" action. Calls onCreated(project).
export default function ProjectCreateDialog({ onClose, onCreated, spaceId = null }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape" && !creating) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [creating, onClose]);

  async function onSubmit(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description || null, spaceId }),
      });
      const data = await response.json();
      if (!response.ok || !data.project) {
        setError(data.error ?? "Unable to create project.");
        return;
      }
      onCreated?.(data.project);
    } catch {
      setError("Unable to create project.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="project-create-backdrop" onClick={() => (creating ? null : onClose())}>
      <section
        className="project-create-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create project"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="project-create-head">
          <span className="project-create-badge">{initials(form.name)}</span>
          <div>
            <h2>Create a project</h2>
            <p>Spin up a board with To Do, In Progress, Review, and Done columns.</p>
          </div>
        </header>

        <form className="project-create-body" onSubmit={onSubmit}>
          <label className="project-create-field">
            <span>Project name</span>
            <input
              required
              autoFocus
              placeholder="e.g. Spring Menu Launch"
              value={form.name}
              disabled={creating}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <label className="project-create-field">
            <span>Description (optional)</span>
            <textarea
              placeholder="What is this project about?"
              value={form.description}
              disabled={creating}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="project-create-footer">
            <button type="button" className="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </button>
            <button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
