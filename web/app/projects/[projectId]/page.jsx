"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import ViewSwitcher from "@/components/view-switcher";
import TaskListView from "@/components/task-list-view";
import MonthCalendar from "@/components/month-calendar";
import TaskDetailDialog from "@/components/task-detail-dialog";
import { TaskCardBody } from "@/components/task-card";
import { addColumn, deleteColumn, renameColumn, reorderColumns, updateTask } from "@/lib/task-client";
import { initials, isTaskCompleted, startOfMonth } from "@/lib/task-format";

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const boardViews = [
  { key: "board", label: "Board" },
  { key: "list", label: "List" },
  { key: "calendar", label: "Calendar" },
];

function groupTasksByColumn(columns, tasks) {
  const map = new Map(columns.map((column) => [column.id, []]));
  for (const task of tasks) {
    const key = task.columnId || columns[0]?.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return map;
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Unexpected response (${response.status}).` };
  }
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
      <TaskCardBody task={task} completed={completed} />
    </button>
  );
}

// Lane header with inline rename + reorder/delete controls (managers/owner only).
function LaneHeader({ column, count, canManage, onRename, onDelete, onMoveLeft, onMoveRight, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  useEffect(() => {
    setName(column.name);
  }, [column.name]);

  function commit() {
    setEditing(false);
    const next = name.trim();
    if (next && next !== column.name) onRename(next);
    else setName(column.name);
  }

  return (
    <header className="projectboard-lane-head">
      {editing ? (
        <input
          className="projectboard-lane-rename"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(column.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h3 className={canManage ? "editable" : ""} onClick={() => canManage && setEditing(true)}>
          {column.name}
        </h3>
      )}
      <div className="projectboard-lane-head-right">
        <span className="projectboard-lane-count">{count}</span>
        {canManage ? (
          <div className="projectboard-lane-actions">
            <button type="button" onClick={onMoveLeft} disabled={isFirst} aria-label="Move column left">
              ‹
            </button>
            <button type="button" onClick={onMoveRight} disabled={isLast} aria-label="Move column right">
              ›
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete column">
              ✕
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

// Droppable lane (column). Tasks dropped here are moved into this column.
function DroppableLane({ column, tasks, isCompleted, onOpenTask, onAddTask, canManage, columnControls }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div className="projectboard-lane">
      <LaneHeader column={column} count={tasks.length} canManage={canManage} {...columnControls} />

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
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("board");
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnBusy, setColumnBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [showComposer, setShowComposer] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
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

  // Scroll lock + Esc for the create-task composer (the detail dialog manages its own).
  useEffect(() => {
    if (!showComposer) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) setShowComposer(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [saving, showComposer]);

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

  function setColumnsLocally(updater) {
    setProject((current) => {
      if (!current) return current;
      const columns = typeof updater === "function" ? updater(current.columns ?? []) : updater;
      return { ...current, columns };
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

  async function toggleComplete(task, completed) {
    setError(null);
    try {
      const updated = await updateTask(task.id, { completed });
      mergeUpdatedTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update task.");
    }
  }

  // --- Column editing ---
  async function handleAddColumn() {
    const name = newColumnName.trim();
    if (!name) {
      setAddingColumn(false);
      return;
    }
    setColumnBusy(true);
    setError(null);
    try {
      const column = await addColumn(projectId, name);
      setColumnsLocally((columns) => [...columns, column]);
      setNewColumnName("");
      setAddingColumn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add column.");
    } finally {
      setColumnBusy(false);
    }
  }

  async function handleRenameColumn(columnId, name) {
    setError(null);
    try {
      const column = await renameColumn(projectId, columnId, name);
      setColumnsLocally((columns) => columns.map((item) => (item.id === columnId ? { ...item, name: column.name } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename column.");
    }
  }

  async function handleDeleteColumn(columnId) {
    if (!window.confirm("Delete this column? Tasks in it will become unassigned.")) return;
    setError(null);
    try {
      await deleteColumn(projectId, columnId);
      setProject((current) => {
        if (!current) return current;
        return {
          ...current,
          columns: (current.columns ?? []).filter((item) => item.id !== columnId),
          tasks: (current.tasks ?? []).map((task) => (task.columnId === columnId ? { ...task, columnId: null } : task)),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete column.");
    }
  }

  async function moveColumn(index, direction) {
    const columns = project?.columns ?? [];
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const ordered = [...columns];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    setColumnsLocally(ordered); // optimistic
    setError(null);
    try {
      const updated = await reorderColumns(projectId, ordered.map((column) => column.id));
      setColumnsLocally(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reorder columns.");
      loadData(false);
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

  const canManage = useMemo(() => {
    if (!user || !project) return false;
    if (project.owner?.id === user.id) return true;
    return (project.members ?? []).some((member) => member.user.id === user.id && member.role === "MANAGER");
  }, [user, project]);

  const columns = project?.columns ?? [];

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
          <div className="projectboard-top-actions">
            <ViewSwitcher views={boardViews} active={view} onChange={setView} />
            <button type="button" className="projectboard-add-btn" onClick={() => openComposer()}>
              + New task
            </button>
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
          </div>
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
                        {columns.map((column) => (
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
          <TaskDetailDialog
            task={activeTask}
            currentUser={user}
            canEdit
            projectColumns={columns}
            onClose={() => setActiveTask(null)}
            onUpdated={mergeUpdatedTask}
          />
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
        ) : view === "board" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <section className="projectboard-lanes-wrap">
              <div className="projectboard-lanes">
                {columns.map((column, index) => (
                  <DroppableLane
                    key={column.id}
                    column={column}
                    tasks={taskMap.get(column.id) ?? []}
                    isCompleted={isTaskCompleted}
                    onOpenTask={setActiveTask}
                    onAddTask={openComposer}
                    canManage={canManage}
                    columnControls={{
                      onRename: (name) => handleRenameColumn(column.id, name),
                      onDelete: () => handleDeleteColumn(column.id),
                      onMoveLeft: () => moveColumn(index, -1),
                      onMoveRight: () => moveColumn(index, 1),
                      isFirst: index === 0,
                      isLast: index === columns.length - 1,
                    }}
                  />
                ))}

                {canManage ? (
                  <div className="projectboard-lane projectboard-lane-new">
                    {addingColumn ? (
                      <div className="projectboard-newcol">
                        <input
                          autoFocus
                          placeholder="Column name"
                          value={newColumnName}
                          disabled={columnBusy}
                          onChange={(event) => setNewColumnName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") handleAddColumn();
                            if (event.key === "Escape") {
                              setNewColumnName("");
                              setAddingColumn(false);
                            }
                          }}
                        />
                        <div className="projectboard-newcol-actions">
                          <button type="button" onClick={handleAddColumn} disabled={columnBusy}>
                            {columnBusy ? "Adding..." : "Add"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setNewColumnName("");
                              setAddingColumn(false);
                            }}
                            disabled={columnBusy}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="projectboard-addcol-btn" onClick={() => setAddingColumn(true)}>
                        + Add column
                      </button>
                    )}
                  </div>
                ) : null}
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
                        <TaskCardBody task={task} completed={isTaskCompleted(task)} />
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>
          </DndContext>
        ) : view === "list" ? (
          <section className="projectboard-lanes-wrap">
            <TaskListView
              tasks={project?.tasks ?? []}
              onOpenTask={setActiveTask}
              onToggleComplete={toggleComplete}
            />
          </section>
        ) : (
          <section className="projectboard-lanes-wrap">
            <MonthCalendar
              tasks={project?.tasks ?? []}
              month={calMonth}
              onChangeMonth={setCalMonth}
              onOpenTask={setActiveTask}
            />
          </section>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
