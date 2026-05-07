"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function secondsToClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const loadData = useCallback(async () => {
    setError(null);
    const meRes = await fetch("/api/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    if (meData.user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    setUser(meData.user);

    const tsRes = await fetch("/api/admin/timesheets?days=7", { cache: "no-store" });
    const tsData = await tsRes.json();
    if (!tsRes.ok) {
      setError(tsData.error ?? "Unable to load timesheets.");
      return;
    }
    setEmployees(tsData.employeeTimesheets);
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load admin view."));
  }, [loadData]);

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
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to create user.");
        return;
      }
      setForm({ name: "", email: "", password: "" });
      await loadData();
    } catch {
      setError("Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main>
      <section className="card card-strong">
        <div className="topbar">
          <div>
            <h1 className="headline">Admin Operations</h1>
            <p className="muted">{user ? `${user.name} (${user.email})` : "Loading admin..."}</p>
          </div>
          <button className="secondary" onClick={logout}>
            Logout
          </button>
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
        <h2 style={{ marginBottom: 12 }}>Employee Timesheets (Last 7 Days)</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Click an employee to expand their daily timesheet.
        </p>

        {employees.map((employee) => {
          const totalWorked = employee.summaries.reduce((sum, item) => sum + (item.workedSeconds || 0), 0);
          const status = totalWorked > 0 ? "WORKING" : "OUT";
          return (
            <details key={employee.user.id} className="employee-dropdown">
              <summary className="employee-summary">
                <span>
                  <strong>{employee.user.name}</strong> <span className="muted">({employee.user.email})</span>
                </span>
                <span className="chip" data-status={status}>
                  {status === "WORKING" ? "Has Hours" : "No Hours"}
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
                      <th>Session Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.summaries.map((summary) => (
                      <tr key={summary.day}>
                        <td>{new Date(summary.day).toLocaleDateString()}</td>
                        <td>{formatTime(summary.firstClockIn)}</td>
                        <td>{formatTime(summary.lastClockOut)}</td>
                        <td>{secondsToClock(summary.workedSeconds)}</td>
                        <td>{secondsToClock(summary.breakSeconds)}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </main>
  );
}
