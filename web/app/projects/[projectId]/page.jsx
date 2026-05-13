"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function groupTasksByColumn(columns, tasks) {
  const map = new Map(columns.map((column) => [column.id, []]));
  for (const task of tasks) {
    const key = task.columnId || columns[0]?.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return map;
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Unexpected response (${response.status}).` };
  }
}

export default function ProjectBoardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId;

  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    laborValue: "60",
    laborUnit: "MINUTES",
    priority: "MEDIUM",
    dueDate: "",
    columnId: "",
    assigneeUserIds: [],
  });

  const loadData = useCallback(async () => {
    setError(null);

    const meRes = await fetch("/api/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await parseJsonSafe(meRes);
    setUser(meData.user);

    const [projectRes, usersRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`, { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
    ]);
    const projectData = await parseJsonSafe(projectRes);
    const usersData = await parseJsonSafe(usersRes);

    if (!projectRes.ok) {
      setError(projectData.error ?? "Unable to load project.");
      return;
    }
    if (!usersRes.ok) {
      setError(usersData.error ?? "Unable to load users.");
      return;
    }

    setProject(projectData.project);
    setUsers(usersData.users ?? []);
    setForm((current) => ({
      ...current,
      columnId: projectData.project.columns?.[0]?.id ?? "",
    }));
  }, [projectId, router]);

  useEffect(() => {
    if (!projectId) return;
    loadData().catch(() => setError("Unable to load project board."));
  }, [loadData, projectId]);

  useEffect(() => {
    if (!showComposer && !activeTask) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (showComposer && !saving) {
          setShowComposer(false);
          return;
        }
        if (activeTask) {
          setActiveTask(null);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeTask, saving, showComposer]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openComposer(columnId = null) {
    setError(null);
    setAssigneeQuery("");
    setForm((current) => ({
      ...current,
      columnId: columnId ?? current.columnId ?? project?.columns?.[0]?.id ?? "",
    }));
    setShowComposer(true);
  }

  function closeComposer() {
    if (saving) return;
    setAssigneeQuery("");
    setShowComposer(false);
  }

  function openTaskDetails(task) {
    setActiveTask(task);
  }

  function closeTaskDetails() {
    setActiveTask(null);
  }

  async function onCreateTask(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const rawLaborValue = Number(form.laborValue);
    const laborMinutes =
      form.laborUnit === "HOURS" ? Math.round(rawLaborValue * 60) : Math.round(rawLaborValue);
    if (!Number.isFinite(laborMinutes) || laborMinutes < 1) {
      setError("Labor must be greater than zero.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          laborMinutes,
          priority: form.priority,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
          columnId: form.columnId || null,
          assigneeUserIds: form.assigneeUserIds,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to create task.");
        return;
      }

      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        laborValue: "60",
        laborUnit: "MINUTES",
        priority: "MEDIUM",
        dueDate: "",
        assigneeUserIds: [],
      }));
      closeComposer();
      await loadData();
    } catch {
      setError("Unable to create task.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignee(userId) {
    setForm((current) => {
      const exists = current.assigneeUserIds.includes(userId);
      if (exists) {
        return { ...current, assigneeUserIds: current.assigneeUserIds.filter((id) => id !== userId) };
      }
      return { ...current, assigneeUserIds: [...current.assigneeUserIds, userId] };
    });
  }

  const taskMap = useMemo(() => {
    if (!project?.columns) return new Map();
    return groupTasksByColumn(project.columns, project.tasks ?? []);
  }, [project]);

  const candidateAssignees = useMemo(() => {
    if (!project) return [];
    const memberIds = new Set([project.owner.id, ...(project.members ?? []).map((member) => member.user.id)]);
    return users.filter((item) => memberIds.has(item.id));
  }, [project, users]);

  const filteredAssignees = useMemo(() => {
    const query = assigneeQuery.trim().toLowerCase();
    if (!query) return candidateAssignees;
    return candidateAssignees.filter((candidate) => {
      const name = (candidate.name || "").toLowerCase();
      const email = (candidate.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [candidateAssignees, assigneeQuery]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="projectboard-shell">
        <header className="projectboard-top">
          <div className="projectboard-id-block">
            <span className="projectboard-icon">{initials(project?.name)}</span>
            <div>
              <h1>{project?.name || "Project board"}</h1>
              <p>{project?.description || "Kanban workflow for project execution."}</p>
            </div>
          </div>
          <div className="projectboard-avatars">
            {(candidateAssignees ?? []).slice(0, 5).map((candidate) => (
              <span key={candidate.id} className="projectboard-avatar" title={candidate.name}>
                {initials(candidate.name)}
              </span>
            ))}
          </div>
        </header>

        {showComposer ? (
          <div className="projectboard-modal-backdrop" onClick={closeComposer}>
            <section
              className="projectboard-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Create task"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="projectboard-modal-top">
                <button type="button" className="projectboard-modal-close" onClick={closeComposer} disabled={saving}>
                  Close
                </button>
                <button form="projectboard-create-task" type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create task"}
                </button>
              </header>

              <form id="projectboard-create-task" className="projectboard-modal-body" onSubmit={onCreateTask}>
                <input
                  required
                  className="projectboard-modal-title"
                  placeholder="Task title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />

                <div className="projectboard-modal-grid">
                  <div className="projectboard-modal-row">
                    <label htmlFor="task-assignee-search">Assignee</label>
                    <div className="projectboard-modal-field">
                      <input
                        id="task-assignee-search"
                        type="text"
                        placeholder="Search people"
                        value={assigneeQuery}
                        onChange={(event) => setAssigneeQuery(event.target.value)}
                      />
                      <div className="projectboard-modal-assignees">
                        {candidateAssignees.length === 0 ? <p className="muted">No assignee</p> : null}
                        {filteredAssignees.length === 0 && candidateAssignees.length > 0 ? (
                          <p className="muted">No matches.</p>
                        ) : null}
                        {filteredAssignees.map((candidate) => (
                          <label key={candidate.id} className="projectboard-modal-assignee-option">
                            <input
                              type="checkbox"
                              checked={form.assigneeUserIds.includes(candidate.id)}
                              onChange={() => toggleAssignee(candidate.id)}
                            />
                            <span>{candidate.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="projectboard-modal-row">
                    <label htmlFor="task-due-date">Due date</label>
                    <div className="projectboard-modal-field">
                      <input
                        id="task-due-date"
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="projectboard-modal-row">
                    <label htmlFor="task-column">Column</label>
                    <div className="projectboard-modal-field">
                      <select
                        id="task-column"
                        value={form.columnId}
                        onChange={(event) => setForm((current) => ({ ...current, columnId: event.target.value }))}
                      >
                        {(project?.columns ?? []).map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="projectboard-modal-row">
                    <label htmlFor="task-priority">Priority</label>
                    <div className="projectboard-modal-field">
                      <select
                        id="task-priority"
                        value={form.priority}
                        onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                      >
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="projectboard-modal-row">
                    <label htmlFor="task-labor">Labor</label>
                    <div className="projectboard-modal-field">
                      <div className="projectboard-modal-labor">
                        <input
                          id="task-labor"
                          required
                          type="number"
                          min={form.laborUnit === "HOURS" ? 0.25 : 1}
                          step={form.laborUnit === "HOURS" ? 0.25 : 1}
                          placeholder={form.laborUnit === "HOURS" ? "Labor hours" : "Labor minutes"}
                          value={form.laborValue}
                          onChange={(event) => setForm((current) => ({ ...current, laborValue: event.target.value }))}
                        />
                        <select
                          aria-label="Labor unit"
                          value={form.laborUnit}
                          onChange={(event) => setForm((current) => ({ ...current, laborUnit: event.target.value }))}
                        >
                          <option value="MINUTES">Minutes</option>
                          <option value="HOURS">Hours</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <section className="projectboard-modal-description">
                  <h3>Description</h3>
                  <textarea
                    required
                    placeholder="What is this task about?"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </section>

                <div className="projectboard-modal-footer">
                  <button type="button" className="secondary" onClick={closeComposer} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create task"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {activeTask ? (
          <div className="taskview-backdrop" onClick={closeTaskDetails}>
            <section
              className="taskview-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Task details"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="taskview-header">
                <h2>{activeTask.title}</h2>
                <button type="button" className="taskview-close" onClick={closeTaskDetails}>
                  Close
                </button>
              </header>

              <div className="taskview-grid">
                <div className="taskview-row">
                  <span>Due date</span>
                  <strong>{activeTask.dueDate ? new Date(activeTask.dueDate).toLocaleDateString() : "No date"}</strong>
                </div>
                <div className="taskview-row">
                  <span>Priority</span>
                  <strong>{activeTask.priority}</strong>
                </div>
                <div className="taskview-row">
                  <span>Labor</span>
                  <strong>{activeTask.laborMinutes} minutes</strong>
                </div>
                <div className="taskview-row">
                  <span>Column</span>
                  <strong>{project?.columns?.find((column) => column.id === activeTask.columnId)?.name || "Unassigned"}</strong>
                </div>
                <div className="taskview-row">
                  <span>Assignees</span>
                  <strong>
                    {activeTask.assignees?.length
                      ? activeTask.assignees.map((assignee) => assignee.name).join(", ")
                      : "No assignees"}
                  </strong>
                </div>
              </div>

              <section className="taskview-section">
                <h3>Description</h3>
                <p>{activeTask.description}</p>
              </section>
            </section>
          </div>
        ) : null}

        <section className="projectboard-lanes-wrap">
          <div className="projectboard-lanes">
            {(project?.columns ?? []).map((column) => {
              const tasks = taskMap.get(column.id) ?? [];
              return (
                <div key={column.id} className="projectboard-lane">
                  <header className="projectboard-lane-head">
                    <h3>{column.name}</h3>
                    <span>{tasks.length}</span>
                  </header>

                  <div className="projectboard-lane-stack">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className={`projectboard-card priority-${task.priority.toLowerCase()}`}
                        onClick={() => openTaskDetails(task)}
                      >
                        <div className="projectboard-card-title">{task.title}</div>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="projectboard-lane-add"
                    onClick={() => {
                      openComposer(column.id);
                    }}
                  >
                    + Add task
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
