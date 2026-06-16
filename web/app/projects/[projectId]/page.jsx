"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import WorkspaceShell from "@/components/workspace-shell";
import ProjectMembers from "@/components/project-members";

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

function formatDueDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Inner content of a board card, shared between the live card and the drag overlay.
function BoardCardBody({ task, completed }) {
  const dueLabel = formatDueDate(task.dueDate);
  const assignees = task.assignees ?? [];
  return (
    <>
      <div className="projectboard-card-head">
        <div className="projectboard-card-title">{task.title}</div>
        <span className={`task-priority-chip ${task.priority.toLowerCase()}`}>{task.priority}</span>
      </div>

      <div className="projectboard-card-meta">
        {dueLabel ? <span className="projectboard-card-due">{dueLabel}</span> : null}
        {typeof task.laborMinutes === "number" ? (
          <span className="projectboard-card-labor">{task.laborMinutes}m</span>
        ) : null}
        {task.attachments?.length ? (
          <span className="projectboard-card-attachment-count">
            {task.attachments.length} file{task.attachments.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      <div className="projectboard-card-foot">
        {completed ? <span className="task-done-note">Completed</span> : <span />}
        {assignees.length ? (
          <div className="projectboard-card-avatars">
            {assignees.slice(0, 3).map((assignee) => (
              <span key={assignee.id} className="projectboard-card-avatar" title={assignee.name}>
                {initials(assignee.name)}
              </span>
            ))}
            {assignees.length > 3 ? (
              <span className="projectboard-card-avatar more">+{assignees.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

// Draggable card. A small activation distance keeps plain clicks working (open details).
function BoardCard({ task, completed, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`projectboard-card priority-${task.priority.toLowerCase()} ${completed ? "completed" : ""} ${isDragging ? "dragging" : ""}`}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      <BoardCardBody task={task} completed={completed} />
    </button>
  );
}

// Droppable lane (column). Tasks dropped here are moved into this column.
function DroppableLane({ column, tasks, isCompleted, onOpenTask, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div className="projectboard-lane">
      <header className="projectboard-lane-head">
        <h3>{column.name}</h3>
        <span>{tasks.length}</span>
      </header>

      <div ref={setNodeRef} className={`projectboard-lane-stack ${isOver ? "drop-over" : ""}`}>
        {tasks.map((task) => (
          <BoardCard key={task.id} task={task} completed={isCompleted(task)} onOpen={onOpenTask} />
        ))}
      </div>

      <button type="button" className="projectboard-lane-add" onClick={() => onAddTask(column.id)}>
        + Add task
      </button>
    </div>
  );
}

export default function ProjectBoardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId;

  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTask, setUpdatingTask] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [showComposer, setShowComposer] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [savingAttachment, setSavingAttachment] = useState(false);
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [showAddImageForm, setShowAddImageForm] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [linkAttachmentForm, setLinkAttachmentForm] = useState({
    url: "",
    label: "",
  });
  const [imageAttachmentForm, setImageAttachmentForm] = useState({
    label: "",
    file: null,
  });
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

  const loadData = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) {
      setLoadingBoard(true);
    }
    setError(null);
    try {
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
    } finally {
      setLoadingBoard(false);
    }
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
        if (activeTask && !savingAttachment) {
          setActiveTask(null);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeTask, saving, savingAttachment, showComposer]);

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
    setShowAddLinkForm(false);
    setShowAddImageForm(false);
    setLinkAttachmentForm({
      url: "",
      label: "",
    });
    setImageAttachmentForm({
      label: "",
      file: null,
    });
    setActiveTask(task);
  }

  function closeTaskDetails() {
    if (savingAttachment) return;
    setActiveTask(null);
  }

  function isTaskCompleted(task) {
    return Boolean(task?.completedAt);
  }

  function mergeUpdatedTask(updatedTask) {
    setProject((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: (current.tasks ?? []).map((item) => (item.id === updatedTask.id ? updatedTask : item)),
      };
    });
    setActiveTask((current) => (current?.id === updatedTask.id ? updatedTask : current));
  }

  function setTaskColumnLocally(taskId, columnId) {
    setProject((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: (current.tasks ?? []).map((item) =>
          item.id === taskId ? { ...item, columnId } : item,
        ),
      };
    });
  }

  function onDragStart(event) {
    setActiveId(event.active?.id ?? null);
  }

  async function onDragEnd(event) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const targetColumnId = over.data.current?.columnId ?? over.id;
    const task = (project?.tasks ?? []).find((item) => item.id === taskId);
    if (!task || !targetColumnId || task.columnId === targetColumnId) return;

    const previousColumnId = task.columnId;
    setError(null);
    // Optimistic move; roll back if the server rejects it.
    setTaskColumnLocally(taskId, targetColumnId);

    try {
      const response = await fetch(`/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: targetColumnId }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.task) {
        setTaskColumnLocally(taskId, previousColumnId);
        setError(data.error ?? "Unable to move task.");
        return;
      }
      mergeUpdatedTask(data.task);
    } catch {
      setTaskColumnLocally(taskId, previousColumnId);
      setError("Unable to move task.");
    }
  }

  async function updateTaskCompletion(taskId, completed) {
    setUpdatingTask(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.task) {
        setError(data.error ?? "Unable to update task.");
        return;
      }
      mergeUpdatedTask(data.task);
    } catch {
      setError("Unable to update task.");
    } finally {
      setUpdatingTask(false);
    }
  }

  async function onAddLinkAttachment(event) {
    event.preventDefault();
    if (!activeTask) return;
    if (!linkAttachmentForm.url.trim()) {
      setError("Link URL is required.");
      return;
    }

    setSavingAttachment(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("type", "LINK");
      if (linkAttachmentForm.label.trim()) {
        body.append("label", linkAttachmentForm.label.trim());
      }
      body.append("url", linkAttachmentForm.url.trim());

      const response = await fetch(`/api/tasks/${activeTask.id}/attachments`, {
        method: "POST",
        body,
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.task) {
        setError(data.error ?? "Unable to add attachment.");
        return;
      }

      mergeUpdatedTask(data.task);
      setLinkAttachmentForm({
        url: "",
        label: "",
      });
    } catch {
      setError("Unable to add attachment.");
    } finally {
      setSavingAttachment(false);
    }
  }

  async function onAddImageAttachment(event) {
    event.preventDefault();
    if (!activeTask) return;
    if (!imageAttachmentForm.file) {
      setError("Image file is required.");
      return;
    }

    setSavingAttachment(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("type", "IMAGE");
      if (imageAttachmentForm.label.trim()) {
        body.append("label", imageAttachmentForm.label.trim());
      }
      body.append("file", imageAttachmentForm.file);

      const response = await fetch(`/api/tasks/${activeTask.id}/attachments`, {
        method: "POST",
        body,
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.task) {
        setError(data.error ?? "Unable to add attachment.");
        return;
      }

      mergeUpdatedTask(data.task);
      setImageAttachmentForm({
        label: "",
        file: null,
      });
    } catch {
      setError("Unable to add attachment.");
    } finally {
      setSavingAttachment(false);
    }
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
      await loadData(false);
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
          <button
            type="button"
            className="projectboard-members-trigger"
            onClick={() => setShowMembers(true)}
            aria-label="Manage members"
          >
            <span className="projectboard-avatars">
              {(candidateAssignees ?? []).slice(0, 5).map((candidate) => (
                <span key={candidate.id} className="projectboard-avatar" title={candidate.name}>
                  {initials(candidate.name)}
                </span>
              ))}
            </span>
            <span className="projectboard-members-label">Members</span>
          </button>
        </header>

        {showMembers ? (
          <ProjectMembers
            projectId={projectId}
            project={project}
            currentUser={user}
            onClose={() => setShowMembers(false)}
            onChanged={() => loadData(false)}
          />
        ) : null}

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
                <div className="taskview-header-actions">
                  <button
                    type="button"
                    className={isTaskCompleted(activeTask) ? "secondary" : ""}
                    disabled={updatingTask}
                    onClick={() => updateTaskCompletion(activeTask.id, !isTaskCompleted(activeTask))}
                  >
                    {updatingTask
                      ? "Saving..."
                      : isTaskCompleted(activeTask)
                        ? "Mark as undone"
                        : "Mark complete"}
                  </button>
                  <button type="button" className="taskview-close" onClick={closeTaskDetails}>
                    Close
                  </button>
                </div>
              </header>

              <div className="taskview-grid">
                <div className="taskview-row">
                  <span>Status</span>
                  <strong>
                    {isTaskCompleted(activeTask)
                      ? `Completed${activeTask.completedAt ? ` on ${new Date(activeTask.completedAt).toLocaleString()}` : ""}`
                      : "Open"}
                  </strong>
                </div>
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

              <section className="taskview-section">
                <h3>Attachments</h3>
                <div className="taskview-attachment-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={savingAttachment}
                    onClick={() => setShowAddImageForm((current) => !current)}
                  >
                    + Add attachment
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={savingAttachment}
                    onClick={() => setShowAddLinkForm((current) => !current)}
                  >
                    + Add link
                  </button>
                </div>

                {showAddImageForm ? (
                  <form className="taskview-attachment-form" onSubmit={onAddImageAttachment}>
                    <input
                      required
                      type="file"
                      accept="image/*"
                      disabled={savingAttachment}
                      onChange={(event) =>
                        setImageAttachmentForm((current) => ({
                          ...current,
                          file: event.target.files?.[0] ?? null,
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Optional label"
                      value={imageAttachmentForm.label}
                      disabled={savingAttachment}
                      onChange={(event) =>
                        setImageAttachmentForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                    <button type="submit" disabled={savingAttachment}>
                      {savingAttachment ? "Saving..." : "Save attachment"}
                    </button>
                  </form>
                ) : null}

                {showAddLinkForm ? (
                  <form className="taskview-attachment-form" onSubmit={onAddLinkAttachment}>
                    <input
                      required
                      type="url"
                      placeholder="https://example.com"
                      value={linkAttachmentForm.url}
                      disabled={savingAttachment}
                      onChange={(event) =>
                        setLinkAttachmentForm((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Optional label"
                      value={linkAttachmentForm.label}
                      disabled={savingAttachment}
                      onChange={(event) =>
                        setLinkAttachmentForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                    <button type="submit" disabled={savingAttachment}>
                      {savingAttachment ? "Saving..." : "Save link"}
                    </button>
                  </form>
                ) : null}

                <div className="taskview-attachment-list">
                  {(activeTask.attachments ?? []).length === 0 ? (
                    <p className="muted">No attachments yet.</p>
                  ) : (
                    (activeTask.attachments ?? []).map((attachment) => (
                      <article key={attachment.id} className="taskview-attachment-item">
                        {attachment.type === "IMAGE" ? (
                          <a
                            className="taskview-attachment-thumb-link"
                            href={`/api/task-attachments/${attachment.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Image
                              className="taskview-attachment-thumb"
                              src={`/api/task-attachments/${attachment.id}/file`}
                              alt={attachment.label || "Task attachment image"}
                              width={110}
                              height={72}
                              loading="lazy"
                            />
                          </a>
                        ) : null}

                        <div className="taskview-attachment-main">
                          <div>
                            <strong>{attachment.label || (attachment.type === "IMAGE" ? "Image" : "Link")}</strong>
                            <small>{attachment.type === "IMAGE" ? "Image attachment" : "Link attachment"}</small>
                          </div>
                          <a
                            href={
                              attachment.type === "IMAGE"
                                ? `/api/task-attachments/${attachment.id}/file`
                                : attachment.url
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </section>
          </div>
        ) : null}

        {loadingBoard ? (
          <section className="projectboard-lanes-wrap">
            <div className="projectboard-lanes">
              {Array.from({ length: 4 }).map((_, laneIndex) => (
                <div key={`skeleton-lane-${laneIndex}`} className="projectboard-lane skeleton">
                  <header className="projectboard-lane-head">
                    <div className="skeleton-block skeleton-shimmer" style={{ width: "40%", height: 20 }} />
                    <div className="skeleton-block skeleton-shimmer" style={{ width: 18, height: 18, borderRadius: 999 }} />
                  </header>
                  <div className="projectboard-lane-stack">
                    {Array.from({ length: 4 }).map((__, cardIndex) => (
                      <div key={`skeleton-card-${laneIndex}-${cardIndex}`} className="projectboard-card skeleton">
                        <div className="projectboard-card-head">
                          <div className="skeleton-block skeleton-shimmer" style={{ width: "62%", height: 16 }} />
                          <div className="skeleton-block skeleton-shimmer" style={{ width: 68, height: 18, borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="projectboard-lane-add">
                    <div className="skeleton-block skeleton-shimmer" style={{ width: 88, height: 14 }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <section className="projectboard-lanes-wrap">
              <div className="projectboard-lanes">
                {(project?.columns ?? []).map((column) => (
                  <DroppableLane
                    key={column.id}
                    column={column}
                    tasks={taskMap.get(column.id) ?? []}
                    isCompleted={isTaskCompleted}
                    onOpenTask={openTaskDetails}
                    onAddTask={openComposer}
                  />
                ))}
              </div>
            </section>

            <DragOverlay>
              {activeId
                ? (() => {
                    const task = (project?.tasks ?? []).find((item) => item.id === activeId);
                    if (!task) return null;
                    return (
                      <div
                        className={`projectboard-card priority-${task.priority.toLowerCase()} ${isTaskCompleted(task) ? "completed" : ""} drag-overlay`}
                      >
                        <BoardCardBody task={task} completed={isTaskCompleted(task)} />
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>
          </DndContext>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
