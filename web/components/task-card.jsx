"use client";

import { formatDueDate, initials, isTaskCompleted, priorityMeta } from "@/lib/task-format";
import { recurrenceLabel } from "@/lib/task-recurrence";

// Inner content of a board card, shared between the live (draggable) card and
// the drag overlay. The board wraps this in its own draggable <button>.
export function TaskCardBody({ task, completed }) {
  const dueLabel = formatDueDate(task.dueDate);
  const assignees = task.assignees ?? [];
  const priority = priorityMeta(task.priority);
  const repeats = recurrenceLabel(task);
  return (
    <>
      <div className="projectboard-card-head">
        <div className="projectboard-card-title">{task.title}</div>
        <span className={`task-priority-chip ${priority.key}`}>
          <span className={`priority-pulse-dot ${priority.key}`} />
          {priority.label}
        </span>
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
        {repeats ? <span className="projectboard-card-repeat">Repeats</span> : null}
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
export function TaskChip({ task, onOpen, draggable = false }) {
  const completed = isTaskCompleted(task);
  const priority = priorityMeta(task.priority);
  const repeats = recurrenceLabel(task);
  return (
    <button
      type="button"
      draggable={draggable}
      className={`afcal-chip priority-${priority.key} ${completed ? "completed" : ""}`}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/task-id", task.id);
      }}
      onClick={() => onOpen?.(task)}
      title={repeats ? `${task.title} - ${repeats}` : task.title}
    >
      <span className={`priority-pulse-dot compact ${priority.key}`} />
      <span className="afcal-chip-title">{task.title}</span>
      {repeats ? <span className="afcal-chip-repeat" aria-label={repeats}>R</span> : null}
    </button>
  );
}
