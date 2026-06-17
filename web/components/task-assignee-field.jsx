"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { parseJsonSafe } from "@/lib/task-client";
import { initials } from "@/lib/task-format";

function sortUsers(users, selectedIds, memberIds) {
  return [...users].sort((a, b) => {
    const aSelected = selectedIds.has(a.id) ? 1 : 0;
    const bSelected = selectedIds.has(b.id) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;

    const aMember = memberIds.has(a.id) ? 1 : 0;
    const bMember = memberIds.has(b.id) ? 1 : 0;
    if (aMember !== bMember) return bMember - aMember;

    return (a.name || a.email || "").localeCompare(b.name || b.email || "");
  });
}

export default function TaskAssigneeField({
  projectId,
  value = [],
  selectedUsers = [],
  disabled = false,
  onChange,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setUsers([]);
      setProjectMemberIds([]);
      return undefined;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/users", { cache: "no-store" }).then(parseJsonSafeResponse),
      fetch(`/api/projects/${projectId}/members`, { cache: "no-store" }).then(parseJsonSafeResponse),
    ])
      .then(([usersResult, membersResult]) => {
        if (cancelled) return;
        if (!usersResult.ok) {
          setError(usersResult.data.error ?? "Unable to load people.");
          return;
        }
        if (!membersResult.ok) {
          setError(membersResult.data.error ?? "Unable to load project collaborators.");
          return;
        }
        setUsers(usersResult.data.users ?? []);
        setProjectMemberIds((membersResult.data.members ?? []).map((member) => member.user.id));
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load people.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const memberIds = useMemo(() => new Set(projectMemberIds), [projectMemberIds]);

  const usersById = useMemo(() => {
    const map = new Map();
    for (const user of users) map.set(user.id, user);
    for (const user of selectedUsers ?? []) {
      if (user?.id && !map.has(user.id)) map.set(user.id, user);
    }
    return map;
  }, [users, selectedUsers]);

  const selectedList = useMemo(
    () => value.map((userId) => usersById.get(userId)).filter(Boolean),
    [usersById, value],
  );

  const filteredUsers = useMemo(() => {
    const text = query.trim().toLowerCase();
    const ordered = sortUsers(users, selectedIds, memberIds);
    if (!text) return ordered;
    return ordered.filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return name.includes(text) || email.includes(text);
    });
  }, [memberIds, query, selectedIds, users]);

  function toggleUser(userId) {
    if (disabled) return;
    const next = selectedIds.has(userId) ? value.filter((id) => id !== userId) : [...value, userId];
    onChange?.(next);
    setOpen(true);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="taskassignee" ref={rootRef}>
      <div className="taskassignee-row">
        <div
          className={`taskassignee-trigger ${open ? "open" : ""}`}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <div className="taskassignee-values">
            {selectedList.map((user) => (
              <span key={user.id} className="taskassignee-pill">
                <span className="taskassignee-avatar">{initials(user.name)}</span>
                <span className="taskassignee-pill-label">{user.name}</span>
                <span
                  className="taskassignee-pill-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (disabled) return;
                    toggleUser(user.id);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </span>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={query}
              disabled={disabled}
                className="taskassignee-input"
                placeholder={selectedList.length ? "" : "Type a name"}
                onFocus={() => setOpen(true)}
                onChange={(event) => {
                  if (disabled) return;
                  setOpen(true);
                  setQuery(event.target.value);
                }}
              />
          </div>
          <ChevronDown size={16} className="taskassignee-caret" aria-hidden="true" />
        </div>
        <button type="button" className="taskassignee-sort" disabled>
          Recently assigned
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="taskassignee-menu">
          <div className="taskassignee-search">
            <Search size={15} aria-hidden="true" />
            <span>{query ? `Results for "${query}"` : "People"}</span>
          </div>
          <div className="taskassignee-list">
            {loading ? <p className="muted">Loading people...</p> : null}
            {!loading && error ? <p className="error">{error}</p> : null}
            {!loading && !error && filteredUsers.length === 0 ? <p className="muted">No people found.</p> : null}
            {!loading && !error
              ? filteredUsers.map((user) => {
                  const selected = selectedIds.has(user.id);
                  const projectMember = memberIds.has(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`taskassignee-option ${selected ? "selected" : ""}`}
                      disabled={disabled}
                      onClick={() => toggleUser(user.id)}
                    >
                      <span className="taskassignee-avatar large">{initials(user.name)}</span>
                      <span className="taskassignee-option-main">
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </span>
                      {!projectMember ? <span className="taskassignee-option-badge">Add to project</span> : null}
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function parseJsonSafeResponse(response) {
  return { ok: response.ok, data: await parseJsonSafe(response) };
}
