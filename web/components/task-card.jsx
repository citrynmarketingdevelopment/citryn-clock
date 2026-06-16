"use client";

import { formatDueDate, initials, isTaskCompleted } from "@/lib/task-format";

// Inner content of a board card, shared between the live (draggable) card and
// the drag overlay. The board wraps this in its own draggable <button>.
export function TaskCardBody({ task, completed }) {
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

// Compact chip used inside calendar day cells.
export function TaskChip({ task, onOpen }) {
  const completed = isTaskCompleted(task);
  return (
    <button
      type="button"
      className={`afcal-chip priority-${task.priority.toLowerCase()} ${completed ? "completed" : ""}`}
      onClick={() => onOpen?.(task)}
      title={task.title}
    >
      <span className="afcal-chip-dot" />
      <span className="afcal-chip-title">{task.title}</span>
    </button>
  );
}
