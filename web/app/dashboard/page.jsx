"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const TARGET_WORK_SECONDS = 8 * 60 * 60;
const RING_RADIUS = 108;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function secondsToClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getLiveTotals(summary, events, nowMs) {
  if (!summary) {
    return { workedSeconds: 0, breakSeconds: 0 };
  }

  let workedSeconds = Number(summary.workedSeconds) || 0;
  let breakSeconds = Number(summary.breakSeconds) || 0;

  if ((summary.status === "WORKING" || summary.status === "ON_BREAK") && events.length > 0) {
    const lastEvent = events[events.length - 1];
    const lastMs = new Date(lastEvent.occurredAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - lastMs) / 1000));

    if (summary.status === "WORKING") {
      workedSeconds += elapsedSeconds;
    } else {
      breakSeconds += elapsedSeconds;
    }
  }

  return { workedSeconds, breakSeconds };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [today, setToday] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  async function loadData() {
    setError(null);
    const meRes = await fetch("/api/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    if (meData.user.role !== "EMPLOYEE") {
      router.push("/admin");
      return;
    }
    setUser(meData.user);

    const todayRes = await fetch("/api/time/today", { cache: "no-store" });
    const todayData = await todayRes.json();
    if (!todayRes.ok) {
      setError(todayData.error ?? "Unable to load today.");
      return;
    }
    setToday(todayData.summary);
    setTodayEvents(todayData.events ?? []);

    const historyRes = await fetch("/api/time/history?days=14", { cache: "no-store" });
    const historyData = await historyRes.json();
    if (!historyRes.ok) {
      setError(historyData.error ?? "Unable to load history.");
      return;
    }
    setHistory(historyData.summaries);
  }

  useEffect(() => {
    loadData().catch(() => setError("Unable to load dashboard."));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function postAction(action) {
    setLoadingAction(action);
    setError(null);
    try {
      const response = await fetch("/api/time/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to save action.");
        return;
      }
      setToday(data.summary);
      setTodayEvents(data.events ?? []);
      await loadData();
    } catch {
      setError("Unable to save action.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const actions = useMemo(() => {
    if (!today) return [];
    if (today.status === "OUT") return ["CLOCK_IN"];
    if (today.status === "WORKING") return ["BREAK_START", "CLOCK_OUT"];
    return ["BREAK_END", "CLOCK_OUT"];
  }, [today]);

  const liveTotals = useMemo(() => getLiveTotals(today, todayEvents, nowMs), [today, todayEvents, nowMs]);
  const progressRatio = Math.min(1, liveTotals.workedSeconds / TARGET_WORK_SECONDS);
  const ringOffset = RING_CIRCUMFERENCE * (1 - progressRatio);

  return (
    <main>
      <div className="card card-strong">
        <div className="topbar">
          <div>
            <h1 className="headline">Employee Time Clock</h1>
            <p className="muted">{user ? `${user.name} (${user.email})` : "Loading user..."}</p>
          </div>
          <button className="secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="card card-strong">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2>Live Shift Timer</h2>
            <span className="chip" data-status={today?.status || "OUT"}>
              {today?.status || "OUT"}
            </span>
          </div>

          <div className="timer-wrap">
            <div className="ring-clock">
              <svg className={`ring-svg ${today?.status === "WORKING" ? "ring-glow" : ""}`} viewBox="0 0 260 260">
                <defs>
                  <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0F766E" />
                    <stop offset="100%" stopColor="#0EA5E9" />
                  </linearGradient>
                </defs>
                <circle className="ring-track" cx="130" cy="130" r={RING_RADIUS} />
                <circle
                  className="ring-progress"
                  cx="130"
                  cy="130"
                  r={RING_RADIUS}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="timer-face">
                <div className="timer-kicker">Worked Time</div>
                <div className="timer-value">{secondsToClock(liveTotals.workedSeconds)}</div>
                <p className="muted">Break: {secondsToClock(liveTotals.breakSeconds)}</p>
              </div>
            </div>
          </div>

          <div className="action-grid">
            {actions.map((action) => (
              <button key={action} onClick={() => postAction(action)} disabled={loadingAction !== null}>
                {loadingAction === action ? "Saving..." : action.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Today Snapshot</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">First Clock In</div>
              <div className="stat-value">{formatDateTime(today?.firstClockIn)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Last Clock Out</div>
              <div className="stat-value">{formatDateTime(today?.lastClockOut)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Worked</div>
              <div className="stat-value">{secondsToClock(liveTotals.workedSeconds)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Break</div>
              <div className="stat-value">{secondsToClock(liveTotals.breakSeconds)}</div>
            </div>
          </div>
          {error ? <p className="error space-top">{error}</p> : null}
        </section>
      </div>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Recent Timesheet (14 days)</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Worked</th>
              <th>Break</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.day}>
                <td>{new Date(row.day).toLocaleDateString()}</td>
                <td>{formatDateTime(row.firstClockIn)}</td>
                <td>{formatDateTime(row.lastClockOut)}</td>
                <td>{secondsToClock(row.workedSeconds)}</td>
                <td>{secondsToClock(row.breakSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

