"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import MonthCalendar from "@/components/month-calendar";
import TaskDetailDialog from "@/components/task-detail-dialog";
import { startOfMonth } from "@/lib/task-format";

export default function DueDatesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));

  const loadData = useCallback(async () => {
    setError(null);
    const meRes = await fetch("/api/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    setUser(meData.user);

    const tasksRes = await fetch("/api/tasks/due", { cache: "no-store" });
    const tasksData = await tasksRes.json();
    if (!tasksRes.ok) {
      setError(tasksData.error ?? "Unable to load due dates.");
      return;
    }
    setTasks(tasksData.tasks ?? []);
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load due dates."));
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

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mytasks-shell">
        <header className="mytasks-header">
          <div>
            <h1 className="mytasks-title">Due Dates</h1>
            <p className="mytasks-subtitle">Calendar view of assigned tasks and deadlines.</p>
          </div>
        </header>

        <MonthCalendar tasks={tasks} month={calMonth} onChangeMonth={setCalMonth} onOpenTask={setActiveTask} />

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
