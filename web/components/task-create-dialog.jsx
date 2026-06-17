"use client";

import { useEffect, useState } from "react";
import { addImageAttachment, parseJsonSafe, setTaskSubtasks } from "@/lib/task-client";
import { priorityMeta } from "@/lib/task-format";
import { parseLocalDateValue } from "@/lib/task-recurrence";
import TaskDatePicker from "@/components/task-date-picker";
import TaskRecurrenceControls from "@/components/task-recurrence-controls";
import TaskAssigneeField from "@/components/task-assignee-field";

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function TaskCreateDialog({
  projects,
  initialProjectId,
  initialColumnId = "",
  initialDueDate = "",
  currentUser,
  lockProject = false,
  onClose,
  onCreated,
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || projects?.[0]?.id || "");
  const [projectDetail, setProjectDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    laborValue: "60",
    laborUnit: "MINUTES",
    priority: "MEDIUM",
    dueDate: initialDueDate,
    recurrenceFrequency: "NONE",
    recurrenceInterval: 1,
    recurrenceDayOfWeek: null,
    recurrenceDayOfMonth: null,
    columnId: initialColumnId || "",
    assigneeUserIds: currentUser?.id ? [currentUser.id] : [],
  });

  async function parseJsonSafeResponse(response) {
    return { ok: response.ok, data: await parseJsonSafe(response) };
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  useEffect(() => {
    setForm((current) => ({ ...current, dueDate: initialDueDate }));
  }, [initialDueDate]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    setLoadingProject(true);
    setError(null);
    fetch(`/api/projects/${selectedProjectId}`, { cache: "no-store" })
      .then(parseJsonSafeResponse)
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.project) {
          setError(data.error ?? "Unable to load project.");
          return;
        }
        setProjectDetail(data.project);
        setForm((current) => ({
          ...current,
          columnId:
            selectedProjectId === initialProjectId && initialColumnId
              ? initialColumnId
              : data.project.columns?.[0]?.id ?? "",
        }));
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load project.");
      })
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialColumnId, initialProjectId, selectedProjectId]);

  const priority = priorityMeta(form.priority);

  function setDueDate(nextDueDate) {
    setForm((current) => {
      const next = { ...current, dueDate: nextDueDate };
      const parsed = parseLocalDateValue(nextDueDate);
      if (parsed && current.recurrenceFrequency === "WEEKLY") {
        next.recurrenceDayOfWeek = parsed.getDay();
      }
      if (parsed && current.recurrenceFrequency === "MONTHLY") {
        next.recurrenceDayOfMonth = parsed.getDate();
      }
      return next;
    });
  }

  function addSubtask(title) {
    const next = title.trim();
    if (!next) return;
    setSubtasks((current) => [...current, { id: crypto.randomUUID(), title: next, completed: false }]);
  }

  function removeSubtask(id) {
    setSubtasks((current) => current.filter((item) => item.id !== id));
  }

  async function applyPostCreateProperties(task) {
    let updatedTask = task;

    if (subtasks.length > 0) {
      const data = await setTaskSubtasks(updatedTask.id, subtasks);
      updatedTask = data.task;
    }

    if (photoFile) {
      updatedTask = await addImageAttachment(updatedTask.id, { file: photoFile, label: photoFile.name });
    }

    return updatedTask;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Choose a project first.");
      return;
    }

    const rawLaborValue = Number(form.laborValue);
    const laborMinutes = form.laborUnit === "HOURS" ? Math.round(rawLaborValue * 60) : Math.round(rawLaborValue);
    if (!Number.isFinite(laborMinutes) || laborMinutes < 1) {
      setError("Labor must be greater than zero.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || "No description.",
          laborMinutes,
          priority: form.priority,
          dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00`).toISOString() : null,
          recurrenceFrequency: form.recurrenceFrequency,
          recurrenceInterval: form.recurrenceInterval,
          recurrenceDayOfWeek: form.recurrenceDayOfWeek,
          recurrenceDayOfMonth: form.recurrenceDayOfMonth,
          columnId: form.columnId || null,
          assigneeUserIds: form.assigneeUserIds,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok || !data.task) {
        setError(data.error ?? "Unable to create task.");
        return;
      }
      const updatedTask = await applyPostCreateProperties(data.task);
      onCreated?.({
        ...updatedTask,
        project: data.task.project ?? {
          id: selectedProjectId,
          name: projectDetail?.name ?? projects.find((project) => project.id === selectedProjectId)?.name,
        },
      });
    } catch {
      setError("Unable to create task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="taskdialog-backdrop taskcreate-backdrop" onClick={() => (saving ? null : onClose())}>
      <section
        className="taskdialog taskcreate-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create task"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="taskdialog-top">
          <div className="taskdialog-top-actions">
            <div className="taskcreate-headcopy">
              <p className="taskcreate-kicker">New task</p>
              <h2>Create task</h2>
            </div>
            <div className={`taskdialog-priority-chip ${priority.key}`}>
              <span className={`priority-pulse-dot ${priority.key}`} />
              <select
                className="taskdialog-priority-select"
                value={form.priority}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                aria-label="Task priority"
              >
                {priorities.map((value) => (
                  <option key={value} value={value}>
                    {priorityMeta(value).label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="taskdialog-close" onClick={onClose} disabled={saving}>
            Close
          </button>
        </header>

        <form id="task-create-form" className="taskdialog-body taskcreate-body" onSubmit={onSubmit}>
          <input
            required
            autoFocus
            className="taskdialog-title taskcreate-title"
            placeholder="Untitled"
            value={form.title}
            disabled={saving}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />

          <div className="taskdialog-inline-prop">
            <span className="taskdialog-inline-label">Assignee</span>
            <div className="taskdialog-inline-value">
              <TaskAssigneeField
                projectId={selectedProjectId}
                value={form.assigneeUserIds}
                disabled={saving || loadingProject}
                onChange={(assigneeUserIds) => setForm((current) => ({ ...current, assigneeUserIds }))}
              />
            </div>
          </div>

          <div className="taskdialog-props">
            <label className="taskdialog-prop">
              <span className="taskdialog-prop-label">Project</span>
              {lockProject ? (
                <strong className="taskdialog-prop-value">
                  {projectDetail?.name ?? projects.find((project) => project.id === selectedProjectId)?.name ?? "Project"}
                </strong>
              ) : (
                <select
                  className="taskdialog-prop-value"
                  value={selectedProjectId}
                  disabled={saving || loadingProject}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="taskdialog-prop">
              <span className="taskdialog-prop-label">Status</span>
              <select
                className="taskdialog-prop-value"
                value={form.columnId}
                disabled={saving || loadingProject}
                onChange={(event) => setForm((current) => ({ ...current, columnId: event.target.value }))}
              >
                <option value="">Empty</option>
                {(projectDetail?.columns ?? []).map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="taskdialog-prop">
              <span className="taskdialog-prop-label">Due date</span>
              <span className="taskdialog-prop-value">
                <TaskDatePicker
                  value={form.dueDate}
                  disabled={saving}
                  onChange={setDueDate}
                />
              </span>
            </label>

            <TaskRecurrenceControls
              frequency={form.recurrenceFrequency}
              interval={form.recurrenceInterval}
              dayOfWeek={form.recurrenceDayOfWeek}
              dayOfMonth={form.recurrenceDayOfMonth}
              dueDate={form.dueDate}
              disabled={saving}
              onChange={(values) => setForm((current) => ({ ...current, ...values }))}
            />

            <label className="taskdialog-prop">
              <span className="taskdialog-prop-label">Labor</span>
              <span className="taskdialog-prop-value taskcreate-labor">
                <input
                  required
                  type="number"
                  min={form.laborUnit === "HOURS" ? 0.25 : 1}
                  step={form.laborUnit === "HOURS" ? 0.25 : 1}
                  value={form.laborValue}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, laborValue: event.target.value }))}
                />
                <select
                  aria-label="Labor unit"
                  value={form.laborUnit}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, laborUnit: event.target.value }))}
                >
                  <option value="MINUTES">Minutes</option>
                  <option value="HOURS">Hours</option>
                </select>
              </span>
            </label>
          </div>

          <div className="taskdialog-divider" />

          <label className="taskdialog-section taskcreate-section">
            <h3>Description</h3>
            <textarea
              className="taskdialog-description"
              placeholder="Add a description..."
              value={form.description}
              disabled={saving}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <section className="taskdialog-section taskcreate-section">
            <div className="taskdialog-section-head">
              <h3>Subtasks</h3>
            </div>
            <div className="taskcreate-subtasks">
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="subtasks-row">
                  <span className="aflist-check" />
                  <input
                    type="text"
                    value={subtask.title}
                    disabled={saving}
                    onChange={(event) =>
                      setSubtasks((current) =>
                        current.map((item) => (item.id === subtask.id ? { ...item, title: event.target.value } : item)),
                      )
                    }
                  />
                  <button type="button" className="subtasks-delete" disabled={saving} onClick={() => removeSubtask(subtask.id)}>
                    x
                  </button>
                </div>
              ))}
              <form
                className="subtasks-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.createSubtaskTitle;
                  addSubtask(input.value);
                  input.value = "";
                }}
              >
                <input name="createSubtaskTitle" type="text" placeholder="Add subtask" disabled={saving} />
                <button type="submit" disabled={saving}>
                  Add
                </button>
              </form>
            </div>
          </section>

          <section className="taskdialog-section taskcreate-section">
            <div className="taskdialog-section-head">
              <h3>Attachments</h3>
              <label className="secondary icon-action taskcreate-upload">
                <input
                  type="file"
                  accept="image/*"
                  disabled={saving}
                  onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                />
                <span>↑</span>
                {photoFile ? photoFile.name : "Upload"}
              </label>
            </div>
            {photoFile ? <p className="muted taskcreate-upload-note">{photoFile.name}</p> : <p className="muted">No attachments yet.</p>}
          </section>

        </form>

        {error ? <p className="error taskcreate-error">{error}</p> : null}

        <footer className="taskcreate-footer">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="task-create-form" disabled={saving || loadingProject || !projects.length}>
            {saving ? "Creating..." : "Create"}
          </button>
        </footer>
      </section>
    </div>
  );
}
