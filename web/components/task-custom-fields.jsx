"use client";

import { useCallback, useEffect, useState } from "react";
import { createField, deleteField, getProjectFields, setFieldValue, setTaskSubtasks } from "@/lib/task-client";

const fieldTypes = ["TEXT", "NUMBER", "SELECT", "DATE", "CHECKBOX", "SUBTASKS"];

function currentValue(task, fieldId) {
  const entry = (task.fieldValues ?? []).find((value) => value.fieldId === fieldId);
  return entry ? entry.value : null;
}

// Renders a project's custom properties as editable rows inside the task dialog.
// Value editing is available to anyone with task access; adding/removing the
// properties themselves is gated behind canManageFields (project managers).
export default function TaskCustomFields({ task, projectId, canManageFields = false, onUpdated }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", type: "TEXT", options: "" });

  const loadFields = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setFields(await getProjectFields(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load properties.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  async function saveValue(fieldId, value) {
    setBusy(true);
    setError(null);
    try {
      const updated = await setFieldValue(task.id, fieldId, value);
      onUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save value.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSubtasks(items) {
    setBusy(true);
    setError(null);
    try {
      const data = await setTaskSubtasks(task.id, items);
      onUpdated?.(data.task);
      if (data.field && !fields.some((field) => field.id === data.field.id)) {
        await loadFields();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save subtasks.");
    } finally {
      setBusy(false);
    }
  }

  async function addSubtasksProperty() {
    await saveSubtasks([]);
    await loadFields();
  }

  async function onAddField(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const options =
      form.type === "SELECT"
        ? form.options
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((optionName) => ({ name: optionName }))
        : undefined;
    setBusy(true);
    setError(null);
    try {
      await createField(projectId, { name, type: form.type, options });
      setForm({ name: "", type: "TEXT", options: "" });
      setAdding(false);
      await loadFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add property.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteField(fieldId) {
    if (!window.confirm("Delete this property? Its values on all tasks will be removed.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteField(projectId, fieldId);
      await loadFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete property.");
    } finally {
      setBusy(false);
    }
  }

  function renderEditor(field) {
    const value = currentValue(task, field.id);
    switch (field.type) {
      case "SUBTASKS": {
        const items = Array.isArray(value) ? value : [];
        const completedCount = items.filter((item) => item.completed).length;
        function saveItems(nextItems) {
          saveSubtasks(nextItems);
        }
        return (
          <div className="subtasks-property">
            <div className="subtasks-progress">
              <span>{items.length ? `${completedCount}/${items.length}` : "0/0"}</span>
              <div className="subtasks-progress-rail">
                <div
                  className="subtasks-progress-fill"
                  style={{ width: items.length ? `${Math.round((completedCount / items.length) * 100)}%` : "0%" }}
                />
              </div>
            </div>
            <div className="subtasks-list">
              {items.map((item) => (
                <div key={item.id} className="subtasks-row">
                  <button
                    type="button"
                    className={`aflist-check ${item.completed ? "checked" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      saveItems(items.map((candidate) => (candidate.id === item.id ? { ...candidate, completed: !candidate.completed } : candidate)))
                    }
                    aria-label={item.completed ? "Mark subtask incomplete" : "Mark subtask complete"}
                  >
                    {item.completed ? "x" : ""}
                  </button>
                  <input
                    type="text"
                    defaultValue={item.title}
                    disabled={busy}
                    onBlur={(event) => {
                      const title = event.target.value.trim();
                      if (!title || title === item.title) return;
                      saveItems(items.map((candidate) => (candidate.id === item.id ? { ...candidate, title } : candidate)));
                    }}
                  />
                  <button
                    type="button"
                    className="subtasks-delete"
                    disabled={busy}
                    onClick={() => saveItems(items.filter((candidate) => candidate.id !== item.id))}
                    aria-label="Delete subtask"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <form
              className="subtasks-add"
              onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.subtaskTitle;
                const title = input.value.trim();
                if (!title) return;
                saveItems([...items, { id: crypto.randomUUID(), title, completed: false }]);
                input.value = "";
              }}
            >
              <input name="subtaskTitle" type="text" placeholder="Add subtask" disabled={busy} />
              <button type="submit" disabled={busy}>
                Add
              </button>
            </form>
          </div>
        );
      }
      case "NUMBER":
        return (
          <input
            type="number"
            className="taskdialog-prop-value"
            defaultValue={value ?? ""}
            disabled={busy}
            onBlur={(event) => {
              const raw = event.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== value) saveValue(field.id, next);
            }}
          />
        );
      case "DATE":
        return (
          <input
            type="date"
            className="taskdialog-prop-value"
            value={value ?? ""}
            disabled={busy}
            onChange={(event) => saveValue(field.id, event.target.value || null)}
          />
        );
      case "CHECKBOX":
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={busy}
            onChange={(event) => saveValue(field.id, event.target.checked)}
          />
        );
      case "SELECT":
        return (
          <select
            className="taskdialog-prop-value"
            value={value ?? ""}
            disabled={busy}
            onChange={(event) => saveValue(field.id, event.target.value || null)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <input
            type="text"
            className="taskdialog-prop-value"
            defaultValue={value ?? ""}
            disabled={busy}
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next !== value) saveValue(field.id, next);
            }}
          />
        );
    }
  }

  if (!projectId) return null;

  const hasSubtasks = fields.some((field) => field.type === "SUBTASKS");

  return (
    <div className="taskdialog-customfields">
      {loading ? <p className="muted">Loading properties...</p> : null}

      {fields.map((field) => (
        <div key={field.id} className="taskdialog-prop align-top">
          <span className="taskdialog-prop-label">{field.name}</span>
          <div className="taskdialog-prop-value taskdialog-customfield-value">
            {renderEditor(field)}
            {canManageFields ? (
              <button
                type="button"
                className="taskdialog-customfield-delete"
                disabled={busy}
                aria-label={`Delete property ${field.name}`}
                onClick={() => onDeleteField(field.id)}
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {canManageFields || !hasSubtasks ? (
        <div className="taskdialog-property-actions">
          {!hasSubtasks ? (
            <button type="button" className="taskdialog-addfield-btn" disabled={busy} onClick={addSubtasksProperty}>
              + Subtasks
            </button>
          ) : null}
          {canManageFields && !adding ? (
            <button type="button" className="taskdialog-addfield-btn" disabled={busy} onClick={() => setAdding(true)}>
              + Add property
            </button>
          ) : null}
        </div>
      ) : null}

      {canManageFields && adding ? (
          <form className="taskdialog-addfield" onSubmit={onAddField}>
            <input
              autoFocus
              placeholder="Property name"
              value={form.name}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <select
              aria-label="Property type"
              value={form.type}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
            >
              {fieldTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {form.type === "SELECT" ? (
              <input
                placeholder="Options, comma-separated"
                value={form.options}
                disabled={busy}
                onChange={(event) => setForm((current) => ({ ...current, options: event.target.value }))}
              />
            ) : null}
            <div className="taskdialog-addfield-actions">
              <button type="submit" disabled={busy}>
                {busy ? "Adding..." : "Add"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
