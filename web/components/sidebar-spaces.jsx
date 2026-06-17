"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageIconBadge } from "@/components/page-icon-picker";
import {
  createSpace,
  deleteSpace,
  getSpaces,
  moveProjectToSpace,
  reorderProjects,
  updateSpace,
} from "@/lib/task-client";
import { initials } from "@/lib/task-format";

const iconChoices = ["🏠", "📁", "🚀", "🎯", "🧩", "📌", "💼", "🍽️", "🛠️", "📦", "⭐", "🔥"];

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

// Renders the user's Spaces (project groups) in the sidebar. Owned projects are
// grouped under their space; projects shared with the user (not owned) appear in
// a separate "Shared with me" group.
export default function SidebarSpaces({ projects, currentUserId, pathname, favorites, onToggleFavorite, onCreateProject, onProjectsReload }) {
  const router = useRouter();
  const [spaces, setSpaces] = useState([]);
  const [openMap, setOpenMap] = useState({});
  const [menuSpaceId, setMenuSpaceId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [iconSpaceId, setIconSpaceId] = useState(null);
  const [dragProjectId, setDragProjectId] = useState(null);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);

  const loadSpaces = useCallback(async () => {
    try {
      const next = await getSpaces();
      setSpaces(next);
      setOpenMap((current) => {
        const merged = { ...current };
        next.forEach((space) => {
          if (merged[space.id] === undefined) merged[space.id] = true;
        });
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load spaces.");
    }
  }, []);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // Close the ⋯ menu / icon popover on an outside click.
  useEffect(() => {
    function onDocClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuSpaceId(null);
        setIconSpaceId(null);
      }
    }
    if (menuSpaceId || iconSpaceId) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
    return undefined;
  }, [menuSpaceId, iconSpaceId]);

  const ownedProjects = projects.filter((project) => project.ownerId === currentUserId);
  const sharedProjects = projects.filter((project) => project.ownerId !== currentUserId);
  const spaceIds = new Set(spaces.map((space) => space.id));

  function projectsForSpace(spaceId, index) {
    return ownedProjects.filter(
      (project) => project.spaceId === spaceId || (index === 0 && !spaceIds.has(project.spaceId)),
    );
  }

  function toggleOpen(spaceId) {
    setOpenMap((current) => ({ ...current, [spaceId]: !current[spaceId] }));
  }

  async function onCreateSpace() {
    setMenuSpaceId(null);
    try {
      const space = await createSpace({ name: "New space", icon: "📁" });
      await loadSpaces();
      setOpenMap((current) => ({ ...current, [space.id]: true }));
      setRenamingId(space.id);
      setRenameValue(space.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create space.");
    }
  }

  async function onDuplicate(space) {
    setMenuSpaceId(null);
    try {
      await createSpace({ name: `${space.name} copy`, icon: space.icon, color: space.color });
      await loadSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to duplicate space.");
    }
  }

  async function commitRename(spaceId) {
    const name = renameValue.trim();
    setRenamingId(null);
    const space = spaces.find((item) => item.id === spaceId);
    if (!name || !space || name === space.name) return;
    try {
      await updateSpace(spaceId, { name });
      await loadSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename space.");
    }
  }

  async function onChangeIcon(spaceId, icon) {
    setIconSpaceId(null);
    setMenuSpaceId(null);
    try {
      await updateSpace(spaceId, { icon });
      await loadSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change icon.");
    }
  }

  async function onDelete(space) {
    setMenuSpaceId(null);
    if (spaces.length <= 1) {
      setError("You must keep at least one space.");
      return;
    }
    if (!window.confirm(`Delete "${space.name}"? Its projects move to another space.`)) return;
    try {
      await deleteSpace(space.id);
      await loadSpaces();
      onProjectsReload?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete space.");
    }
  }

  async function onDropOnSpace(spaceId) {
    const projectId = dragProjectId;
    setDragProjectId(null);
    if (!projectId) return;
    const project = ownedProjects.find((item) => item.id === projectId);
    if (!project || project.spaceId === spaceId) return;
    try {
      await moveProjectToSpace(projectId, spaceId);
      onProjectsReload?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to move project.");
    }
  }

  async function onReorderWithinSpace(spaceId, targetProjectId) {
    const projectId = dragProjectId;
    setDragProjectId(null);
    if (!projectId || projectId === targetProjectId) return;
    const list = projectsForSpace(spaceId, spaces.findIndex((s) => s.id === spaceId));
    const fromIndex = list.findIndex((p) => p.id === projectId);
    const toIndex = list.findIndex((p) => p.id === targetProjectId);
    if (fromIndex === -1 || toIndex === -1) {
      // Different space → move it here instead.
      onDropOnSpace(spaceId);
      return;
    }
    const reordered = [...list];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    try {
      await reorderProjects(reordered.map((p) => p.id));
      onProjectsReload?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reorder projects.");
    }
  }

  function renderProjectRow(project) {
    const isFav = favorites.includes(project.id);
    return (
      <div key={project.id} className="ws-proj-item-row" onDragOver={(e) => e.preventDefault()} onDrop={() => onReorderWithinSpace(project.spaceId, project.id)}>
        <button
          type="button"
          draggable
          className={classNames("ws-proj-item", pathname === `/projects/${project.id}` && "active", dragProjectId === project.id && "dragging")}
          onClick={() => router.push(`/projects/${project.id}`)}
          onDragStart={() => setDragProjectId(project.id)}
          onDragEnd={() => setDragProjectId(null)}
        >
          <PageIconBadge storageKey={`citryn:page-icon:project:${project.id}`} fallback={initials(project.name)} />
          <span className="ws-proj-item-name">{project.name}</span>
        </button>
        <button
          type="button"
          className={classNames("ws-proj-star", isFav && "starred")}
          onClick={(event) => onToggleFavorite(event, project.id)}
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          title={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          {isFav ? "★" : "☆"}
        </button>
      </div>
    );
  }

  return (
    <div className="ws-spaces" ref={menuRef}>
      {spaces.map((space, index) => {
        const spaceProjects = projectsForSpace(space.id, index);
        const open = openMap[space.id] !== false;
        return (
          <div key={space.id} className="ws-nav-group ws-space" onDragOver={(e) => e.preventDefault()} onDrop={() => onDropOnSpace(space.id)}>
            <div className="ws-nav-group-bar">
              {renamingId === space.id ? (
                <input
                  className="ws-space-rename"
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => commitRename(space.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <button type="button" className="ws-nav-group-head" onClick={() => toggleOpen(space.id)} aria-expanded={open}>
                  <span className={classNames("ws-nav-group-caret", open && "open")}>›</span>
                  <span className="ws-space-icon">{space.icon || "📁"}</span>
                  {space.name}
                </button>
              )}
              <div className="ws-space-actions">
                <button
                  type="button"
                  className="ws-nav-group-add"
                  aria-label="Space menu"
                  title="Space options"
                  onClick={() => {
                    setMenuSpaceId((current) => (current === space.id ? null : space.id));
                    setIconSpaceId(null);
                  }}
                >
                  ⋯
                </button>
                <button type="button" className="ws-nav-group-add" aria-label="New project" title="New project" onClick={() => onCreateProject(space.id)}>
                  +
                </button>
              </div>

              {menuSpaceId === space.id ? (
                <div className="ws-space-menu">
                  <button type="button" onClick={() => { setMenuSpaceId(null); setRenamingId(space.id); setRenameValue(space.name); }}>
                    Rename
                  </button>
                  <button type="button" onClick={() => { setIconSpaceId(space.id); setMenuSpaceId(null); }}>
                    Change icon
                  </button>
                  <button type="button" onClick={() => onDuplicate(space)}>
                    Duplicate
                  </button>
                  <button type="button" onClick={onCreateSpace}>
                    Create space
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(space)}>
                    Delete
                  </button>
                </div>
              ) : null}

              {iconSpaceId === space.id ? (
                <div className="ws-space-iconpicker">
                  {iconChoices.map((icon) => (
                    <button key={icon} type="button" onClick={() => onChangeIcon(space.id, icon)}>
                      {icon}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {open ? (
              <div className="ws-proj-list">
                {spaceProjects.length === 0 ? (
                  <p className="ws-proj-empty">No projects.</p>
                ) : (
                  spaceProjects.map(renderProjectRow)
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {sharedProjects.length > 0 ? (
        <div className="ws-nav-group ws-space">
          <div className="ws-nav-group-bar">
            <span className="ws-nav-group-head static">
              <span className="ws-space-icon">👥</span>
              Shared with me
            </span>
          </div>
          <div className="ws-proj-list">{sharedProjects.map(renderProjectRow)}</div>
        </div>
      ) : null}

      {error ? <p className="ws-proj-empty error">{error}</p> : null}
    </div>
  );
}
