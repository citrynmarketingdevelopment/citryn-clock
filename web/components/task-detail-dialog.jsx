"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  addImageAttachment,
  addLinkAttachment,
  parseJsonSafe,
  setAssignees,
  updateTask,
} from "@/lib/task-client";
import { initials, priorities, priorityMeta } from "@/lib/task-format";
import { toDateValue } from "@/lib/task-recurrence";
import TaskCustomFields from "@/components/task-custom-fields";
import TaskDatePicker from "@/components/task-date-picker";
import TaskRecurrenceControls from "@/components/task-recurrence-controls";
import TaskAssigneeField from "@/components/task-assignee-field";

// Centered AppFlowy row-detail dialog. Used by the board, My Tasks, and Due Dates.
// `canEdit` enables inline editing; `projectColumns` enables the Column selector.
export default function TaskDetailDialog({
  task,
  currentUser,
  canEdit = false,
  canManageFields = false,
  projectColumns = null,
  onClose,
  onUpdated,
  onDeleted,
}) {
  const [current, setCurrent] = useState(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [showAddLink, setShowAddLink] = useState(false);
  const [showAddImage, setShowAddImage] = useState(false);
  const [linkForm, setLinkForm] = useState({ url: "", label: "" });
  const [imageForm, setImageForm] = useState({ file: null, label: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveProjects, setMoveProjects] = useState([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const menuRef = useRef(null);
  const attachInputRef = useRef(null);

  // Reset local state when a different task is opened.
  useEffect(() => {
    setCurrent(task);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setShowAddLink(false);
    setShowAddImage(false);
    setError(null);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock + Esc to close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function handleDuplicate() {
    setMenuOpen(false);
    const pid = current?.projectId ?? current?.project?.id;
    if (!pid) return;
    await runEdit(async () => {
      const response = await fetch(`/api/projects/${pid}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${current.title} (copy)`,
          description: current.description ?? "",
          laborMinutes: current.laborMinutes ?? 60,
          priority: current.priority,
          dueDate: current.dueDate ?? null,
          recurrenceFrequency: current.recurrenceFrequency ?? "NONE",
          recurrenceInterval: current.recurrenceInterval ?? 1,
          recurrenceDayOfWeek: current.recurrenceDayOfWeek ?? null,
          recurrenceDayOfMonth: current.recurrenceDayOfMonth ?? null,
          columnId: current.columnId ?? null,
          assigneeUserIds: (current.assignees ?? []).map((a) => a.id),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to duplicate task.");
      onUpdated?.(data.task);
    });
  }

  function handleCopyLink() {
    setMenuOpen(false);
    const pid = current?.projectId ?? current?.project?.id;
    const url = pid
      ? `${window.location.origin}/projects/${pid}`
      : window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    await runEdit(async () => {
      const response = await fetch(`/api/tasks/${current.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to delete task.");
      }
      onDeleted?.(current.id);
      onClose();
    });
  }

  function handleAttachFile(event) {
    setMenuOpen(false);
    const file = event.target.files?.[0];
    if (!file) return;
    runEdit(async () => {
      const updated = await addImageAttachment(current.id, { file, label: file.name });
      applyTask(updated);
    });
    event.target.value = "";
  }

  async function openMoveDialog() {
    setMenuOpen(false);
    setMoveLoading(true);
    setShowMoveDialog(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();
      setMoveProjects(data.projects ?? []);
    } catch {
      setMoveProjects([]);
    } finally {
      setMoveLoading(false);
    }
  }

  async function handleMoveToProject(targetProjectId) {
    setShowMoveDialog(false);
    if (targetProjectId === (current?.projectId ?? current?.project?.id)) return;
    await runEdit(async () => {
      const response = await fetch(`/api/tasks/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProjectId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to move task.");
      onDeleted?.(current.id);
      onClose();
    });
  }

  const projectId = current?.projectId ?? current?.project?.id ?? null;

  const completed = Boolean(current?.completedAt);
  const assignees = useMemo(() => current?.assignees ?? [], [current]);
  const priority = priorityMeta(current?.priority);

  const applyTask = useCallback(
    (updated) => {
      setCurrent(updated);
      onUpdated?.(updated);
    },
    [onUpdated],
  );

  async function runEdit(fn) {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  function patch(field, value) {
    return runEdit(async () => {
      const updated = await updateTask(current.id, { [field]: value });
      applyTask(updated);
    });
  }

  function patchFields(values) {
    return runEdit(async () => {
      const updated = await updateTask(current.id, values);
      applyTask(updated);
    });
  }

  function commitTitle() {
    const next = title.trim();
    if (!next || next === current.title) {
      setTitle(current.title);
      return;
    }
    patch("title", next);
  }

  function commitDescription() {
    if (description === current.description) return;
    patch("description", description);
  }

  function updateAssignees(next) {
    runEdit(async () => {
      const nextAssignees = await setAssignees(current.id, next);
      applyTask({ ...current, assignees: nextAssignees });
    });
  }

  async function onAddLink(event) {
    event.preventDefault();
    if (!linkForm.url.trim()) {
      setError("Link URL is required.");
      return;
    }
    await runEdit(async () => {
      const updated = await addLinkAttachment(current.id, { url: linkForm.url.trim(), label: linkForm.label.trim() });
      applyTask(updated);
      setLinkForm({ url: "", label: "" });
      setShowAddLink(false);
    });
  }

  async function onAddImage(event) {
    event.preventDefault();
    if (!imageForm.file) {
      setError("Image file is required.");
      return;
    }
    await runEdit(async () => {
      const updated = await addImageAttachment(current.id, { file: imageForm.file, label: imageForm.label.trim() });
      applyTask(updated);
      setImageForm({ file: null, label: "" });
      setShowAddImage(false);
    });
  }

  if (!current) return null;

  const columnName = projectColumns?.find((column) => column.id === current.columnId)?.name;

  return (
    <div className="taskdialog-backdrop" onClick={() => (saving ? null : onClose())}>
      <section
        className="taskdialog"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="taskdialog-top">
          <div className="taskdialog-top-actions">
            <button
              type="button"
              className={`taskdialog-complete ${completed ? "done" : ""}`}
              disabled={saving}
              onClick={() => patch("completed", !completed)}
            >
            <span className="taskdialog-complete-box">{completed ? "✓" : ""}</span>
            {completed ? "Completed" : "Mark complete"}
            </button>
            <div className={`taskdialog-priority-chip ${priority.key}`}>
              <span className={`priority-pulse-dot ${priority.key}`} />
              {canEdit ? (
                <select
                  className="taskdialog-priority-select"
                  value={current.priority}
                  disabled={saving}
                  onChange={(event) => patch("priority", event.target.value)}
                  aria-label="Task priority"
                >
                  {priorities.map((value) => (
                    <option key={value} value={value}>
                      {priorityMeta(value).label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="taskdialog-priority-label">{priority.label}</span>
              )}
            </div>
          </div>
          <div className="taskdialog-header-controls">
            <div className="taskdialog-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="taskdialog-menu-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Task options"
                aria-expanded={menuOpen}
                disabled={saving}
              >
                ···
              </button>
              {menuOpen ? (
                <div className="taskdialog-menu-popup" role="menu">
                  <button type="button" className="taskdialog-menu-item" role="menuitem" onClick={handleDuplicate}>
                    Duplicate task
                  </button>
                  <button type="button" className="taskdialog-menu-item" role="menuitem" onClick={handleCopyLink}>
                    Copy task link
                  </button>
                  <hr className="taskdialog-menu-divider" />
                  <label className="taskdialog-menu-item" role="menuitem">
                    Upload attachment
                    <input ref={attachInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAttachFile} />
                  </label>
                  <button type="button" className="taskdialog-menu-item" role="menuitem" onClick={openMoveDialog}>
                    Move to project
                  </button>
                  <hr className="taskdialog-menu-divider" />
                  <button type="button" className="taskdialog-menu-item danger" role="menuitem" onClick={handleDelete}>
                    Delete task
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className="taskdialog-close" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>
        </header>

        {showMoveDialog ? (
          <div className="taskdialog-move-overlay" onClick={() => setShowMoveDialog(false)}>
            <div className="taskdialog-move-inner" onClick={(e) => e.stopPropagation()}>
              <h3>Move to project</h3>
              {moveLoading ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>Loading projects...</p>
              ) : (
                <div className="taskdialog-move-list">
                  {moveProjects
                    .filter((p) => p.id !== projectId)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="taskdialog-move-option"
                        onClick={() => handleMoveToProject(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  {moveProjects.filter((p) => p.id !== projectId).length === 0 ? (
                    <p className="muted" style={{ fontSize: "0.85rem" }}>No other projects available.</p>
                  ) : null}
                </div>
              )}
              <button type="button" className="taskdialog-move-cancel" onClick={() => setShowMoveDialog(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="taskdialog-body">
          {canEdit ? (
            <input
              className="taskdialog-title"
              value={title}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          ) : (
            <h2 className="taskdialog-title-static">{current.title}</h2>
          )}

          <div className="taskdialog-inline-prop">
            <span className="taskdialog-inline-label">Assignee</span>
            <div className="taskdialog-inline-value">
              {canEdit ? (
                <TaskAssigneeField
                  projectId={projectId}
                  value={assignees.map((assignee) => assignee.id)}
                  selectedUsers={assignees}
                  disabled={saving}
                  onChange={updateAssignees}
                />
              ) : assignees.length ? (
                <div className="taskdialog-assignees">
                  {assignees.map((assignee) => (
                    <span key={assignee.id} className="taskdialog-assignee" title={assignee.name}>
                      <span className="taskdialog-assignee-avatar">{initials(assignee.name)}</span>
                      {assignee.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted">No assignees</span>
              )}
            </div>
          </div>

          <div className="taskdialog-props">
            <div className="taskdialog-prop">
              <span className="taskdialog-prop-label">Due date</span>
              {canEdit ? (
                <div className="taskdialog-prop-value">
                  <TaskDatePicker
                    value={toDateValue(current.dueDate)}
                    disabled={saving}
                    onChange={(value) => patch("dueDate", value ? new Date(`${value}T00:00:00`).toISOString() : null)}
                  />
                </div>
              ) : (
                <span className="taskdialog-prop-value">
                  {current.dueDate ? new Date(current.dueDate).toLocaleDateString() : "No date"}
                </span>
              )}
            </div>

            {canEdit ? (
              <TaskRecurrenceControls
                frequency={current.recurrenceFrequency ?? "NONE"}
                interval={current.recurrenceInterval ?? 1}
                dayOfWeek={current.recurrenceDayOfWeek}
                dayOfMonth={current.recurrenceDayOfMonth}
                dueDate={toDateValue(current.dueDate)}
                disabled={saving}
                onChange={patchFields}
              />
            ) : current.recurrenceFrequency && current.recurrenceFrequency !== "NONE" ? (
              <div className="taskdialog-prop">
                <span className="taskdialog-prop-label">Repeat</span>
                <span className="taskdialog-prop-value">{current.recurrenceFrequency.toLowerCase()}</span>
              </div>
            ) : null}

            <div className="taskdialog-prop">
              <span className="taskdialog-prop-label">Labor (min)</span>
              {canEdit ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="taskdialog-prop-value"
                  defaultValue={current.laborMinutes}
                  disabled={saving}
                  onBlur={(event) => {
                    const value = Math.round(Number(event.target.value));
                    if (Number.isFinite(value) && value > 0 && value !== current.laborMinutes) {
                      patch("laborMinutes", value);
                    }
                  }}
                />
              ) : (
                <span className="taskdialog-prop-value">{current.laborMinutes} minutes</span>
              )}
            </div>

            {projectColumns ? (
              <div className="taskdialog-prop">
                <span className="taskdialog-prop-label">Status</span>
                {canEdit ? (
                  <select
                    className="taskdialog-prop-value"
                    value={current.columnId ?? ""}
                    disabled={saving}
                    onChange={(event) => patch("columnId", event.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {projectColumns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="taskdialog-prop-value">{columnName ?? "Unassigned"}</span>
                )}
              </div>
            ) : null}

            {current.project?.name ? (
              <div className="taskdialog-prop">
                <span className="taskdialog-prop-label">Project</span>
                <span className="taskdialog-prop-value">{current.project.name}</span>
              </div>
            ) : null}

            {canEdit ? (
              <TaskCustomFields
                key={current.id}
                task={current}
                projectId={projectId}
                canManageFields={canManageFields}
                onUpdated={applyTask}
              />
            ) : null}
          </div>

          <div className="taskdialog-divider" />

          <section className="taskdialog-section">
            <h3>Description</h3>
            {canEdit ? (
              <textarea
                className="taskdialog-description"
                value={description}
                disabled={saving}
                placeholder="Add a description..."
                onChange={(event) => setDescription(event.target.value)}
                onBlur={commitDescription}
              />
            ) : (
              <p>{current.description || "No description."}</p>
            )}
          </section>

          <section className="taskdialog-section">
            <div className="taskdialog-section-head">
              <h3>Attachments</h3>
              <div className="taskdialog-attachment-actions">
                <button type="button" className="secondary icon-action" disabled={saving} onClick={() => setShowAddImage((v) => !v)}>
                  <span>↑</span>
                  Upload
                </button>
                <button type="button" className="secondary icon-action" disabled={saving} onClick={() => setShowAddLink((v) => !v)}>
                  <span>↗</span>
                  Link
                </button>
              </div>
            </div>

            {showAddImage ? (
              <form className="taskdialog-attachment-form" onSubmit={onAddImage}>
                <input
                  required
                  type="file"
                  accept="image/*"
                  disabled={saving}
                  onChange={(event) => setImageForm((c) => ({ ...c, file: event.target.files?.[0] ?? null }))}
                />
                <input
                  type="text"
                  placeholder="Optional label"
                  value={imageForm.label}
                  disabled={saving}
                  onChange={(event) => setImageForm((c) => ({ ...c, label: event.target.value }))}
                />
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
            ) : null}

            {showAddLink ? (
              <form className="taskdialog-attachment-form" onSubmit={onAddLink}>
                <input
                  required
                  type="url"
                  placeholder="https://example.com"
                  value={linkForm.url}
                  disabled={saving}
                  onChange={(event) => setLinkForm((c) => ({ ...c, url: event.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Optional label"
                  value={linkForm.label}
                  disabled={saving}
                  onChange={(event) => setLinkForm((c) => ({ ...c, label: event.target.value }))}
                />
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
            ) : null}

            <div className="taskdialog-attachment-list">
              {(current.attachments ?? []).length === 0 ? (
                <p className="muted">No attachments yet.</p>
              ) : (
                (current.attachments ?? []).map((attachment) => (
                  <article key={attachment.id} className="taskdialog-attachment-item">
                    {attachment.type === "IMAGE" ? (
                      <a
                        className="taskdialog-attachment-thumb-link"
                        href={`/api/task-attachments/${attachment.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Image
                          className="taskdialog-attachment-thumb"
                          src={`/api/task-attachments/${attachment.id}/file`}
                          alt={attachment.label || "Task attachment image"}
                          width={110}
                          height={72}
                          loading="lazy"
                        />
                      </a>
                    ) : null}
                    <div className="taskdialog-attachment-main">
                      <div>
                        <strong>{attachment.label || (attachment.type === "IMAGE" ? "Image" : "Link")}</strong>
                        <small>{attachment.type === "IMAGE" ? "Image attachment" : "Link attachment"}</small>
                      </div>
                      <a
                        href={attachment.type === "IMAGE" ? `/api/task-attachments/${attachment.id}/file` : attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {error ? <p className="error space-top">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
