"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import ViewSwitcher from "@/components/view-switcher";
import TaskListView from "@/components/task-list-view";
import MonthCalendar from "@/components/month-calendar";
import TaskDetailDialog from "@/components/task-detail-dialog";
import { updateTask } from "@/lib/task-client";
import { startOfMonth } from "@/lib/task-format";

const views = [
  { key: "list", label: "List" },
  { key: "calendar", label: "Calendar" },
];

export default function MyTasksPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
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

      const tasksRes = await fetch("/api/tasks/my", { cache: "no-store" });
      const tasksData = await tasksRes.json();
      if (!tasksRes.ok) {
        setError(tasksData.error ?? "Unable to load tasks.");
        return;
      }
      setTasks(tasksData.tasks ?? []);
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

  async function toggleComplete(task, completed) {
    setError(null);
    try {
      const updated = await updateTask(task.id, { completed });
      mergeUpdatedTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update task.");
    }
  }

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mytasks-shell">
        <header className="mytasks-header">
          <div>
            <h1 className="mytasks-title">My Tasks</h1>
            <p className="mytasks-subtitle">Tasks assigned to {user?.name || "you"}.</p>
          </div>
          <ViewSwitcher views={views} active={view} onChange={setView} />
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
          <MonthCalendar tasks={tasks} month={calMonth} onChangeMonth={setCalMonth} onOpenTask={setActiveTask} />
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

        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
