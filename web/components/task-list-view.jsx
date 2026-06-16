"use client";

import { useMemo } from "react";
import { formatDueDate, groupTasksByDue, isTaskCompleted } from "@/lib/task-format";

// AppFlowy-style todo/list view: tasks grouped into date buckets, each row a
// checkbox + title + priority dot + due chip. Clicking a row opens the dialog.
export default function TaskListView({ tasks, onOpenTask, onToggleComplete, showProject = false }) {
  const groups = useMemo(() => groupTasksByDue(tasks ?? []), [tasks]);

  if (groups.length === 0) {
    return <p className="aflist-empty">No tasks yet.</p>;
  }

  return (
    <div className="aflist">
      {groups.map((group) => (
        <section key={group.key} className="aflist-group">
          <header className="aflist-group-head">
            <h3>{group.label}</h3>
            <span className="aflist-group-count">{group.tasks.length}</span>
          </header>
          <div className="aflist-rows">
            {group.tasks.map((task) => {
              const completed = isTaskCompleted(task);
              const dueLabel = formatDueDate(task.dueDate);
              return (
                <div key={task.id} className={`aflist-row ${completed ? "completed" : ""}`}>
                  <button
                    type="button"
                    className={`aflist-check ${completed ? "checked" : ""}`}
                    aria-label={completed ? "Mark as not done" : "Mark complete"}
                    onClick={() => onToggleComplete?.(task, !completed)}
                  >
                    {completed ? "✓" : ""}
                  </button>
                  <button type="button" className="aflist-main" onClick={() => onOpenTask?.(task)}>
                    <span className={`aflist-dot priority-${task.priority.toLowerCase()}`} />
                    <span className="aflist-title">{task.title}</span>
                    {showProject && task.project?.name ? (
                      <span className="aflist-project">{task.project.name}</span>
                    ) : null}
                  </button>
                  {dueLabel ? <span className="aflist-due">{dueLabel}</span> : null}
                  <span className={`task-priority-chip ${task.priority.toLowerCase()}`}>{task.priority}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
