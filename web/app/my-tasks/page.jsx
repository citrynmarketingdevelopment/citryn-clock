"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import PageIconPicker from "@/components/page-icon-picker";
import ViewSwitcher from "@/components/view-switcher";
import TaskListView from "@/components/task-list-view";
import MonthCalendar from "@/components/month-calendar";
import TaskDetailDialog from "@/components/task-detail-dialog";
import TaskCreateDialog from "@/components/task-create-dialog";
import { updateTask } from "@/lib/task-client";
import { dateKey, startOfMonth } from "@/lib/task-format";

const views = [
  { key: "list", label: "To-dos" },
  { key: "calendar", label: "Calendar" },
];

export default function MyTasksPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDueDate, setCreateDueDate] = useState("");
  const [error, setError] = useState(null);
  const [view, setView] = useState("calendar");
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));

  const loadData = useCallback(async () => {
    setLoadingBoard(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const [tasksRes, projectsRes] = await Promise.all([
        fetch("/api/tasks/my", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      const tasksData = await tasksRes.json();
      const projectsData = await projectsRes.json();
      if (!tasksRes.ok) {
        setError(tasksData.error ?? "Unable to load tasks.");
        return;
      }
      if (!projectsRes.ok) {
        setError(projectsData.error ?? "Unable to load projects.");
        return;
      }
      setTasks(tasksData.tasks ?? []);
      setProjects(projectsData.projects ?? []);
    } finally {
      setLoadingBoard(false);
    }
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load tasks."));
  }, [loadData]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function mergeUpdatedTask(updatedTask) {
    setTasks((current) => current.map((item) => (item.id === updatedTask.id ? { ...item, ...updatedTask } : item)));
    setActiveTask((current) => (current?.id === updatedTask.id ? { ...current, ...updatedTask } : current));
  }

  function addCreatedTask(task) {
    setTasks((current) => [task, ...current]);
    setActiveTask(task);
    setShowCreate(false);
    setCreateDueDate("");
  }

  function openCreateForDay(day = null) {
    setCreateDueDate(day ? dateKey(day) : "");
    setShowCreate(true);
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

  async function moveTaskToDay(taskId, day) {
    const previous = tasks.find((task) => task.id === taskId);
    if (!previous) return;

    const dueDate = new Date(`${dateKey(day)}T00:00:00`).toISOString();
    setError(null);
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, dueDate } : task)));
    setActiveTask((current) => (current?.id === taskId ? { ...current, dueDate } : current));

    try {
      const updated = await updateTask(taskId, { dueDate });
      mergeUpdatedTask(updated);
    } catch (err) {
      setTasks((current) => current.map((task) => (task.id === taskId ? previous : task)));
      setActiveTask((current) => (current?.id === taskId ? previous : current));
      setError(err instanceof Error ? err.message : "Unable to move task.");
    }
  }

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mytasks-shell">
        <header className="mytasks-header">
          <div className="appflowy-page-title">
            <PageIconPicker storageKey="citryn:page-icon:my-tasks" fallback="✅" label="Change My Tasks icon" />
            <div>
              <div className="appflowy-breadcrumb">General › Team space</div>
              <h1 className="mytasks-title">My Tasks</h1>
              <p className="mytasks-subtitle">To-dos and due dates for {user?.name || "you"}.</p>
            </div>
          </div>
          <div className="mytasks-actions">
            <ViewSwitcher views={views} active={view} onChange={setView} />
            <button type="button" className="projectboard-add-btn" onClick={() => openCreateForDay()} disabled={!projects.length}>
              + New task
            </button>
          </div>
        </header>

        {loadingBoard ? (
          <div className="aflist">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`mytasks-skeleton-${index}`} className="aflist-row">
                <div className="skeleton-block skeleton-shimmer" style={{ width: 20, height: 20, borderRadius: 6 }} />
                <div className="skeleton-block skeleton-shimmer" style={{ width: "50%", height: 14 }} />
              </div>
            ))}
          </div>
        ) : view === "list" ? (
          <TaskListView tasks={tasks} onOpenTask={setActiveTask} onToggleComplete={toggleComplete} showProject />
        ) : (
          <MonthCalendar
            tasks={tasks}
            month={calMonth}
            onChangeMonth={setCalMonth}
            onOpenTask={setActiveTask}
            onCreateTaskForDay={openCreateForDay}
            onMoveTaskToDay={moveTaskToDay}
          />
        )}

        {activeTask ? (
          <TaskDetailDialog
            task={activeTask}
            currentUser={user}
            canEdit
            onClose={() => setActiveTask(null)}
            onUpdated={mergeUpdatedTask}
          />
        ) : null}

        {showCreate ? (
          <TaskCreateDialog
            projects={projects}
            currentUser={user}
            initialProjectId={projects[0]?.id}
            initialDueDate={createDueDate}
            onClose={() => {
              setShowCreate(false);
              setCreateDueDate("");
            }}
            onCreated={addCreatedTask}
          />
        ) : null}

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
