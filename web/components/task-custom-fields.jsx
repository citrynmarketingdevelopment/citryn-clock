"use client";

import { useCallback, useEffect, useState } from "react";
import { createField, deleteField, getProjectFields, setFieldValue } from "@/lib/task-client";

const fieldTypes = ["TEXT", "NUMBER", "SELECT", "DATE", "CHECKBOX"];

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

      {canManageFields ? (
        adding ? (
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
        ) : (
          <button type="button" className="taskdialog-addfield-btn" disabled={busy} onClick={() => setAdding(true)}>
            + Add property
          </button>
        )
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
