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
import PageIconPicker from "@/components/page-icon-picker";
import ProjectMembers from "@/components/project-members";
import ViewSwitcher from "@/components/view-switcher";
import TaskListView from "@/components/task-list-view";
import MonthCalendar from "@/components/month-calendar";
import TaskDetailDialog from "@/components/task-detail-dialog";
import TaskCreateDialog from "@/components/task-create-dialog";
import { TaskCardBody } from "@/components/task-card";
import { addColumn, deleteColumn, renameColumn, reorderColumns, updateTask } from "@/lib/task-client";
import { dateKey, initials, isTaskCompleted, startOfMonth } from "@/lib/task-format";

function favoritesKey(userId) {
  return userId ? `citryn:project-favorites:${userId}` : null;
}

function readFavorites(userId) {
  const key = favoritesKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFavorites(userId, ids) {
  const key = favoritesKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("citryn-favorites-changed"));
  } catch {}
}

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
  const [error, setError] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
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
  const [composerColumnId, setComposerColumnId] = useState("");
  const [composerDueDate, setComposerDueDate] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    setFavorites(readFavorites(user.id));
  }, [user?.id]);

  function toggleFavorite() {
    if (!user?.id) return;
    setFavorites((current) => {
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];
      writeFavorites(user.id, next);
      return next;
    });
  }

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

      const projectRes = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      const projectData = await parseJsonSafe(projectRes);

      if (!projectRes.ok) {
        setError(projectData.error ?? "Unable to load project.");
        return;
      }

      setProject(projectData.project);
    } finally {
      setLoadingBoard(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    if (!projectId) return;
    loadData().catch(() => setError("Unable to load project board."));
  }, [loadData, projectId]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openComposer(columnId = null, dueDate = "") {
    setError(null);
    setComposerColumnId(columnId ?? project?.columns?.[0]?.id ?? "");
    setComposerDueDate(dueDate);
    setShowComposer(true);
  }

  function closeComposer() {
    setShowComposer(false);
    setComposerDueDate("");
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

  function addCreatedTask(task) {
    setProject((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: [task, ...(current.tasks ?? [])],
      };
    });
    setActiveTask(task);
    setShowComposer(false);
    setComposerDueDate("");
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

  function openCalendarComposer(day) {
    openComposer(null, dateKey(day));
  }

  async function moveTaskToDay(taskId, day) {
    const previous = (project?.tasks ?? []).find((task) => task.id === taskId);
    if (!previous) return;

    const dueDate = new Date(`${dateKey(day)}T00:00:00`).toISOString();
    setError(null);
    setProject((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: (current.tasks ?? []).map((task) => (task.id === taskId ? { ...task, dueDate } : task)),
      };
    });
    setActiveTask((current) => (current?.id === taskId ? { ...current, dueDate } : current));

    try {
      const updated = await updateTask(taskId, { dueDate });
      mergeUpdatedTask(updated);
    } catch (err) {
      setProject((current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: (current.tasks ?? []).map((task) => (task.id === taskId ? previous : task)),
        };
      });
      setActiveTask((current) => (current?.id === taskId ? previous : current));
      setError(err instanceof Error ? err.message : "Unable to move task.");
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

  const taskMap = useMemo(() => {
    if (!project?.columns) return new Map();
    return groupTasksByColumn(project.columns, project.tasks ?? []);
  }, [project]);

  const candidateAssignees = useMemo(() => {
    if (!project) return [];
    const seen = new Set();
    return [project.owner, ...(project.members ?? []).map((member) => member.user)].filter((candidate) => {
      if (!candidate || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    });
  }, [project]);

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
            <PageIconPicker
              storageKey={`citryn:page-icon:project:${projectId}`}
              fallback={initials(project?.name)}
              label="Change project icon"
            />
            <div>
              <div className="appflowy-breadcrumb">General › Project</div>
              <div className="projectboard-title-row">
                <h1>{project?.name || "Project board"}</h1>
                <button
                  type="button"
                  className={`proj-fav-star${favorites.includes(projectId) ? " starred" : ""}`}
                  onClick={toggleFavorite}
                  aria-label={favorites.includes(projectId) ? "Remove from favorites" : "Add to favorites"}
                  title={favorites.includes(projectId) ? "Remove from favorites" : "Add to favorites"}
                >
                  {favorites.includes(projectId) ? "★" : "☆"}
                </button>
              </div>
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
          <TaskCreateDialog
            projects={project ? [{ id: project.id, name: project.name }] : []}
            currentUser={user}
            initialProjectId={projectId}
            initialColumnId={composerColumnId}
            initialDueDate={composerDueDate}
            lockProject
            onClose={closeComposer}
            onCreated={addCreatedTask}
          />
        ) : null}

        {activeTask ? (
          <TaskDetailDialog
            task={activeTask}
            currentUser={user}
            canEdit
            canManageFields={canManage}
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
              onCreateTaskForDay={openCalendarComposer}
              onMoveTaskToDay={moveTaskToDay}
            />
          </section>
        )}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
