"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function startOfWeek(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay();
  value.setDate(value.getDate() - day);
  return value;
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function priorityClass(priority) {
  if (priority === "URGENT") return "urgent";
  if (priority === "HIGH") return "high";
  if (priority === "MEDIUM") return "medium";
  return "low";
}

export default function MyTasksPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const loadData = useCallback(async () => {
    setError(null);

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
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load tasks."));
  }, [loadData]);

  useEffect(() => {
    if (!activeTask) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setActiveTask(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeTask]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function moveWeek(deltaDays) {
    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + deltaDays);
      return startOfWeek(next);
    });
  }

  const weekDays = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      list.push(day);
    }
    return list;
  }, [weekStart]);

  const scheduledByDay = useMemo(() => {
    const byDay = new Map(weekDays.map((day) => [dayKey(day), []]));

    for (const task of tasks) {
      if (!task.dueDate) {
        continue;
      }
      const key = dayKey(new Date(task.dueDate));
      if (byDay.has(key)) {
        byDay.get(key).push(task);
      }
    }

    for (const [, dayTasks] of byDay.entries()) {
      dayTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }

    return byDay;
  }, [tasks, weekDays]);

  const monthLabel = useMemo(
    () =>
      `${weekDays[0].toLocaleDateString(undefined, { month: "long" })} ${weekDays[0].getFullYear()}`,
    [weekDays],
  );

  const todayKey = dayKey(new Date());

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mytasks-shell">
        <header className="mytasks-header">
          <div>
            <h1 className="mytasks-title">My Tasks</h1>
            <p className="mytasks-subtitle">Assigned tasks by due date for {user?.name || "employee"}.</p>
          </div>
          <div className="mytasks-toolbar">
            <button type="button" className="mytasks-nav-btn" onClick={() => moveWeek(-7)}>
              Prev Week
            </button>
            <span className="mytasks-month">{monthLabel}</span>
            <button type="button" className="mytasks-nav-btn" onClick={() => moveWeek(7)}>
              Next Week
            </button>
          </div>
        </header>

        <section className="mytasks-calendar">
          {weekDays.map((day) => {
            const key = dayKey(day);
            const dayTasks = scheduledByDay.get(key) ?? [];
            return (
              <article key={key} className={`mytasks-day ${key === todayKey ? "today" : ""}`}>
                <div className="mytasks-day-head">
                  <span className="mytasks-day-name">{WEEKDAY_SHORT[day.getDay()]}</span>
                  <span className="mytasks-day-date">{day.getDate()}</span>
                </div>
                <div className="mytasks-day-list">
                  {dayTasks.length === 0 ? <p className="mytasks-empty">No tasks</p> : null}
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`mytasks-task ${priorityClass(task.priority)}`}
                      onClick={() => setActiveTask(task)}
                    >
                      <strong>{task.title}</strong>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        {activeTask ? (
          <div className="taskview-backdrop" onClick={() => setActiveTask(null)}>
            <section
              className="taskview-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Task details"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="taskview-header">
                <h2>{activeTask.title}</h2>
                <button type="button" className="taskview-close" onClick={() => setActiveTask(null)}>
                  Close
                </button>
              </header>

              <div className="taskview-grid">
                <div className="taskview-row">
                  <span>Project</span>
                  <strong>{activeTask.project?.name || "-"}</strong>
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
                  <strong>{activeTask.column?.name || "Unassigned"}</strong>
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
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
