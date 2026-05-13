"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

function dayKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function labelForKey(key) {
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function DueDatesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

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

  const calendarColumns = useMemo(() => {
    const grouped = new Map();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = dayKey(task.dueDate);
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()]
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([key, items]) => ({ key, label: labelForKey(key), items }));
  }, [tasks]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="card card-strong">
        <h1 className="headline">Due Date</h1>
        <p className="muted">Calendar-style view for assigned tasks and deadlines.</p>
      </section>

      <section className="card">
        {calendarColumns.length === 0 ? <p className="muted">No assigned tasks with due dates yet.</p> : null}
        <div className="ws-board">
          {calendarColumns.map((column) => (
            <div key={column.key} className="ws-column">
              <h3>{column.label}</h3>
              {column.items.map((task) => (
                <article key={task.id} className="ws-task-card">
                  <strong>{task.title}</strong>
                  <p className="muted">{task.project.name}</p>
                  <p>{task.description}</p>
                  <p className="muted">
                    Priority: {task.priority} | Labor: {task.laborMinutes}m
                  </p>
                </article>
              ))}
            </div>
          ))}
        </div>
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
