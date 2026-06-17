"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseJsonSafe } from "@/lib/task-client";
import { initials } from "@/lib/task-format";

// AppFlowy-style quick search palette: finds projects + task titles you can
// access and navigates to them.
export default function GlobalSearch({ onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ projects: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults({ projects: [], tasks: [] });
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const data = await parseJsonSafe(response);
        if (response.ok) setResults({ projects: data.projects ?? [], tasks: data.tasks ?? [] });
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  function go(href) {
    onClose();
    router.push(href);
  }

  const hasResults = results.projects.length > 0 || results.tasks.length > 0;

  return (
    <div className="afsearch-backdrop" onClick={onClose}>
      <section className="afsearch" role="dialog" aria-modal="true" aria-label="Search" onClick={(event) => event.stopPropagation()}>
        <div className="afsearch-input-row">
          <span className="afsearch-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="afsearch-input"
            placeholder="Search projects and tasks..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="afsearch-results">
          {loading ? <p className="afsearch-empty">Searching...</p> : null}
          {!loading && query.trim() && !hasResults ? <p className="afsearch-empty">No matches.</p> : null}
          {!loading && !query.trim() ? <p className="afsearch-empty">Type to search by keyword or title.</p> : null}

          {results.projects.length > 0 ? (
            <div className="afsearch-group">
              <h4>Projects</h4>
              {results.projects.map((project) => (
                <button key={project.id} type="button" className="afsearch-item" onClick={() => go(`/projects/${project.id}`)}>
                  <span className="afsearch-badge">{initials(project.name)}</span>
                  <span className="afsearch-item-title">{project.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          {results.tasks.length > 0 ? (
            <div className="afsearch-group">
              <h4>Tasks</h4>
              {results.tasks.map((task) => (
                <button key={task.id} type="button" className="afsearch-item" onClick={() => go(`/projects/${task.projectId}`)}>
                  <span className="afsearch-badge task">☑</span>
                  <span className="afsearch-item-main">
                    <span className="afsearch-item-title">{task.title}</span>
                    {task.projectName ? <span className="afsearch-item-sub">{task.projectName}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
