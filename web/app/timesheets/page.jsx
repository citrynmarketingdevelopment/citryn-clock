"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import { parseDayKey } from "@/lib/day";

function secondsToClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function secondsToHoursInput(seconds) {
  return (Math.max(0, Number(seconds) || 0) / 3600).toFixed(2);
}

function formatDayDisplay(dayKey) {
  const day = parseDayKey(dayKey);
  return day ? day.toLocaleDateString() : dayKey;
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sessionLabel(session) {
  return session.type === "BREAK" ? "Break" : "Work";
}

function formatSessionRange(session) {
  const start = formatTime(session.startAt);
  const end = session.endAt ? formatTime(session.endAt) : "In progress";
  return `${start} - ${end}`;
}

function dayInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDefaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400000);
  return {
    start: dayInput(start),
    end: dayInput(end),
  };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Unexpected response." };
  }
}

function entryKey(userId, day) {
  return `${userId}::${day}`;
}

export default function TimesheetsPage() {
  const router = useRouter();
  const defaultRange = useMemo(() => getDefaultRange(), []);

  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("active");
  const [range, setRange] = useState(defaultRange);
  const [loadedRange, setLoadedRange] = useState(defaultRange);
  const [hoursDrafts, setHoursDrafts] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingTimesheets, setLoadingTimesheets] = useState(false);
  const [savingOverrideKey, setSavingOverrideKey] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const loadData = useCallback(
    async (selectedRange = range) => {
      setError(null);
      setLoadingTimesheets(true);
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) {
          router.push("/login");
          return;
        }
        const meData = await meRes.json();
        if (meData.user.role !== "ADMIN") {
          router.push("/timeclock");
          return;
        }
        setUser(meData.user);

        const params = new URLSearchParams({
          start: selectedRange.start,
          end: selectedRange.end,
        });
        const tsRes = await fetch(`/api/admin/timesheets?${params.toString()}`, { cache: "no-store" });
        const tsData = await parseJsonSafe(tsRes);
        if (!tsRes.ok) {
          setError(tsData.error ?? "Unable to load timesheets.");
          return;
        }

        setEmployees(tsData.employeeTimesheets ?? []);
        setLoadedRange({
          start: tsData.range?.start ?? selectedRange.start,
          end: tsData.range?.end ?? selectedRange.end,
        });

        const nextDrafts = {};
        for (const employee of tsData.employeeTimesheets ?? []) {
          for (const summary of employee.summaries ?? []) {
            nextDrafts[entryKey(employee.user.id, summary.day)] = secondsToHoursInput(summary.workedSeconds);
          }
        }
        setHoursDrafts(nextDrafts);
      } catch {
        setError("Unable to load timesheets.");
      } finally {
        setLoadingTimesheets(false);
      }
    },
    [range, router],
  );

  useEffect(() => {
    loadData(defaultRange);
  }, [defaultRange, loadData]);

  async function onCreateUser(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: "EMPLOYEE",
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to create user.");
        return;
      }
      setForm({ name: "", email: "", password: "" });
      await loadData(loadedRange);
    } catch {
      setError("Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHoursOverride(userId, day) {
    const key = entryKey(userId, day);
    const hoursValue = hoursDrafts[key];
    setError(null);
    setSavingOverrideKey(key);

    try {
      const response = await fetch("/api/admin/timesheets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          day: day.slice(0, 10),
          hours: Number(hoursValue),
        }),
      });

      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to update hours.");
        return;
      }

      await loadData(loadedRange);
    } catch {
      setError("Unable to update hours.");
    } finally {
      setSavingOverrideKey(null);
    }
  }

  async function clearHoursOverride(userId, day) {
    const key = entryKey(userId, day);
    setError(null);
    setSavingOverrideKey(key);
    try {
      const response = await fetch("/api/admin/timesheets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          day: day.slice(0, 10),
          hours: null,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to clear override.");
        return;
      }
      await loadData(loadedRange);
    } catch {
      setError("Unable to clear override.");
    } finally {
      setSavingOverrideKey(null);
    }
  }

  async function applyRange() {
    if (!range.start || !range.end) {
      setError("Start and end date are required.");
      return;
    }
    if (range.end < range.start) {
      setError("End date must be on or after start date.");
      return;
    }
    await loadData(range);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const activeEmployeeCount = useMemo(
    () => employees.filter((employee) => !employee.user.archivedAt).length,
    [employees],
  );
  const archivedEmployeeCount = employees.length - activeEmployeeCount;
  const filteredEmployees = useMemo(() => {
    if (employeeFilter === "all") return employees;
    return employees.filter((employee) =>
      employeeFilter === "archived" ? Boolean(employee.user.archivedAt) : !employee.user.archivedAt,
    );
  }, [employeeFilter, employees]);
  const totalWorkedSecondsVisibleEmployees = useMemo(
    () => filteredEmployees.reduce((sum, employee) => sum + (employee.totals?.workedSeconds || 0), 0),
    [filteredEmployees],
  );

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="card card-strong">
        <div className="topbar">
          <div>
            <h1 className="headline">Timesheets</h1>
            <p className="muted">{user ? `${user.name} (${user.email})` : "Loading admin..."}</p>
            <p className="muted" style={{ marginTop: 6 }}>
              Loaded range: {loadedRange.start} to {loadedRange.end}
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Date Range</h2>
        <div className="row">
          <input
            type="date"
            value={range.start}
            onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))}
          />
          <input
            type="date"
            value={range.end}
            onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))}
          />
          <button type="button" onClick={applyRange} disabled={loadingTimesheets}>
            {loadingTimesheets ? "Loading..." : "Apply Range"}
          </button>
          <span className="chip" data-status="WORKING">
            Filtered Total: {secondsToClock(totalWorkedSecondsVisibleEmployees)}
          </span>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Create Employee Account</h2>
        <form onSubmit={onCreateUser}>
          <div className="row">
            <input
              required
              placeholder="Employee name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="Employee email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
            <input
              required
              type="password"
              minLength={8}
              placeholder="Temporary password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
            <button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="timesheet-section-head">
          <h2>Employee Timesheets</h2>
          <div className="status-segmented" role="group" aria-label="Filter employees by archive status">
            <button
              type="button"
              className={employeeFilter === "all" ? "active" : ""}
              aria-pressed={employeeFilter === "all"}
              onClick={() => setEmployeeFilter("all")}
            >
              All <span>{employees.length}</span>
            </button>
            <button
              type="button"
              className={employeeFilter === "active" ? "active" : ""}
              aria-pressed={employeeFilter === "active"}
              onClick={() => setEmployeeFilter("active")}
            >
              Active <span>{activeEmployeeCount}</span>
            </button>
            <button
              type="button"
              className={employeeFilter === "archived" ? "active" : ""}
              aria-pressed={employeeFilter === "archived"}
              onClick={() => setEmployeeFilter("archived")}
            >
              Archived <span>{archivedEmployeeCount}</span>
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Click an employee to expand their timesheet. Edit daily hours, then save.
        </p>

        {loadingTimesheets ? <p className="muted">Loading timesheets...</p> : null}
        {!loadingTimesheets && filteredEmployees.length === 0 ? (
          <p className="muted">
            {employeeFilter === "archived" ? "No archived employees." : "No employees match this filter."}
          </p>
        ) : null}

        {!loadingTimesheets && filteredEmployees.map((employee) => {
          const totalWorked = employee.totals?.workedSeconds || 0;
          const status = totalWorked > 0 ? "WORKING" : "OUT";
          return (
            <details key={employee.user.id} className="employee-dropdown">
              <summary className="employee-summary">
                <span>
                  <span className="employee-summary-person">
                    <strong>{employee.user.name}</strong>
                    {employee.user.archivedAt ? <span className="employee-status-label">Archived</span> : null}
                  </span>{" "}
                  <span className="muted">({employee.user.email})</span>
                </span>
                <span className="chip" data-status={status}>
                  Range Total: {secondsToClock(totalWorked)}
                </span>
              </summary>
              <div className="employee-content">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>Total Worked</th>
                      <th>Break</th>
                      <th>Edit Hours</th>
                      <th>Session Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.summaries.map((summary) => {
                      const key = entryKey(employee.user.id, summary.day);
                      const savingThisRow = savingOverrideKey === key;
                      return (
                        <tr key={summary.day}>
                          <td>{formatDayDisplay(summary.day)}</td>
                          <td>{formatTime(summary.firstClockIn)}</td>
                          <td>{formatTime(summary.lastClockOut)}</td>
                          <td>
                            {secondsToClock(summary.workedSeconds)}
                            {summary.hasOverride ? (
                              <div className="muted" style={{ fontSize: "0.8rem" }}>
                                Edited (original {secondsToClock(summary.originalWorkedSeconds)})
                              </div>
                            ) : null}
                          </td>
                          <td>{secondsToClock(summary.breakSeconds)}</td>
                          <td>
                            <div className="timesheet-edit-cell">
                              <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.25"
                                value={hoursDrafts[key] ?? secondsToHoursInput(summary.workedSeconds)}
                                onChange={(event) =>
                                  setHoursDrafts((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                onClick={() => saveHoursOverride(employee.user.id, summary.day)}
                                disabled={savingThisRow}
                              >
                                {savingThisRow ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => clearHoursOverride(employee.user.id, summary.day)}
                                disabled={savingThisRow}
                              >
                                Clear
                              </button>
                            </div>
                          </td>
                          <td>
                            {summary.sessions?.length ? (
                              <div className="session-list">
                                {summary.sessions.map((session, index) => (
                                  <div key={`${summary.day}-${session.type}-${session.startAt}-${index}`} className="session-item">
                                    <span className="session-type">{sessionLabel(session)}</span>
                                    <span className="session-range">{formatSessionRange(session)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="muted">No sessions</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
