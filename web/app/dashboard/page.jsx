"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

const TARGET_WORK_SECONDS = 8 * 60 * 60;
const WORKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
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

function formatDurationCompact(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDayLabel(dayIso) {
  const day = new Date(dayIso);
  return `${WORKDAY_KEYS[day.getDay()]}, ${MONTH_KEYS[day.getMonth()]} ${String(day.getDate()).padStart(2, "0")}`;
}

function deriveBreakMeta(session) {
  const duration = Number(session.durationSeconds) || 0;
  if (duration >= 30 * 60) {
    return { label: "Lunch break", tag: "UNPAID" };
  }
  return { label: "Rest break", tag: "PAID" };
}

function deriveSessionLabel(session, employeeName) {
  if (session.type === "BREAK") {
    return deriveBreakMeta(session).label;
  }
  return employeeName || "Work";
}

function deriveSessionTag(session) {
  if (session.type !== "BREAK") return null;
  return deriveBreakMeta(session).tag;
}

function formatSessionRange(session) {
  const start = formatTime(session.startAt);
  const end = session.endAt ? formatTime(session.endAt) : "In progress";
  return `${start} - ${end}`;
}

function normalizeHistoryWithToday(today, history, liveTotals) {
  if (!today) return history;

  const todayLive = {
    ...today,
    workedSeconds: liveTotals.workedSeconds,
    breakSeconds: liveTotals.breakSeconds,
  };

  if (history.length === 0) return [todayLive];

  const todayKey = new Date(today.day).toDateString();
  const firstHistoryKey = new Date(history[0].day).toDateString();
  if (todayKey === firstHistoryKey) {
    return [todayLive, ...history.slice(1)];
  }

  return [todayLive, ...history];
}

function getLatestEventTime(events) {
  if (!events || events.length === 0) return null;
  const last = events[events.length - 1];
  return last?.occurredAt ?? null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [today, setToday] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState("TIMECLOCK");

  const loadData = useCallback(async () => {
    setError(null);
    const meRes = await fetch("/api/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    if (meData.user.role !== "EMPLOYEE") {
      router.push("/timesheets");
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
  }, [router]);

  useEffect(() => {
    loadData().catch(() => setError("Unable to load dashboard."));
  }, [loadData]);

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
  const workdayProgress = Math.min(100, Math.round((liveTotals.workedSeconds / TARGET_WORK_SECONDS) * 100));
  const timesheetDays = useMemo(() => normalizeHistoryWithToday(today, history, liveTotals), [today, history, liveTotals]);

  const primaryAction = actions.find((action) => action === "CLOCK_OUT" || action === "CLOCK_IN") ?? actions[0] ?? null;
  const secondaryAction = actions.find((action) => action !== primaryAction) ?? null;

  const filteredDays = useMemo(
    () =>
      timesheetDays
        .map((day) => ({
          ...day,
          displaySessions: day.sessions ?? [],
        })),
    [timesheetDays],
  );

  const desktopSummary = useMemo(() => {
    const dayCount = filteredDays.length;
    const workedSeconds = filteredDays.reduce((sum, day) => sum + (Number(day.workedSeconds) || 0), 0);
    const breakSeconds = filteredDays.reduce((sum, day) => sum + (Number(day.breakSeconds) || 0), 0);
    const openSessions = filteredDays.reduce(
      (sum, day) => sum + (day.displaySessions ?? []).filter((session) => session.isOpen).length,
      0,
    );
    return { dayCount, workedSeconds, breakSeconds, openSessions };
  }, [filteredDays]);
  const latestEventTime = useMemo(() => getLatestEventTime(todayEvents), [todayEvents]);
  const todaySessionCount = today?.sessions?.length ?? 0;
  const weeklyBars = useMemo(() => filteredDays.slice(0, 7).reverse(), [filteredDays]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="track-shell">
      <div className="track-bg-orb track-bg-orb-a" />
      <div className="track-bg-orb track-bg-orb-b" />

      <section className="track-header">
        <div className="track-header-row">
          <div>
            <h1 className="track-title">Track Time</h1>
            <p className="track-subtitle">Desktop workspace</p>
          </div>
        </div>
      </section>

      <section className="track-action-dock">
        {primaryAction ? (
          <button
            className={`track-action-button ${primaryAction === "CLOCK_OUT" ? "danger" : "success"}`}
            onClick={() => postAction(primaryAction)}
            disabled={loadingAction !== null}
          >
            <span className="track-action-dot" />
            {loadingAction === primaryAction ? "Saving..." : primaryAction.replaceAll("_", " ")}
          </button>
        ) : null}
        {secondaryAction ? (
          <button className="track-action-button neutral" onClick={() => postAction(secondaryAction)} disabled={loadingAction !== null}>
            <span className="track-action-dot" />
            {loadingAction === secondaryAction ? "Saving..." : secondaryAction.replaceAll("_", " ")}
          </button>
        ) : null}
      </section>

      <section className="track-mobile-live" aria-label="Live mobile timer">
        <div className="track-mobile-live-ring" style={{ "--progress": `${workdayProgress}%` }}>
          <div className="track-mobile-live-inner">
            <p className="track-mobile-live-label">Worked Time</p>
            <div className="track-mobile-live-time">{secondsToClock(liveTotals.workedSeconds)}</div>
            <p className="track-mobile-live-meta">Break {secondsToClock(liveTotals.breakSeconds)}</p>
          </div>
        </div>
      </section>

      <section className="track-overview-strip">
        <article className="track-overview-card">
          <span className="track-overview-label">Status</span>
          <strong className="track-overview-value">{today?.status || "OUT"}</strong>
        </article>
        <article className="track-overview-card">
          <span className="track-overview-label">Worked Today</span>
          <strong className="track-overview-value">{secondsToClock(liveTotals.workedSeconds)}</strong>
        </article>
        <article className="track-overview-card">
          <span className="track-overview-label">Break Today</span>
          <strong className="track-overview-value">{secondsToClock(liveTotals.breakSeconds)}</strong>
        </article>
        <article className="track-overview-card">
          <span className="track-overview-label">Latest Event</span>
          <strong className="track-overview-value">{latestEventTime ? formatTime(latestEventTime) : "-"}</strong>
        </article>
      </section>

      <section className="track-toolbar">
        <div className="track-tabs">
          <button
            type="button"
            className={`track-tab ${viewMode === "TIMECLOCK" ? "active" : ""}`}
            onClick={() => setViewMode("TIMECLOCK")}
          >
            Time clock
          </button>
          <button
            type="button"
            className={`track-tab ${viewMode === "TIMESHEETS" ? "active" : ""}`}
            onClick={() => setViewMode("TIMESHEETS")}
          >
            Timesheets
          </button>
        </div>
      </section>

      {viewMode === "TIMECLOCK" ? (
        <section className="track-clock-card">
          <div className="track-status-row">
            <span className="track-user-text">{user ? `${user.name} (${user.email})` : "Loading user..."}</span>
            <span className="track-status-pill" data-status={today?.status || "OUT"}>
              {today?.status || "OUT"}
            </span>
          </div>

          <div className="track-timer-main">{secondsToClock(liveTotals.workedSeconds)}</div>
          <div className="track-timer-sub">
            <span>Break: {secondsToClock(liveTotals.breakSeconds)}</span>
            <span>Workday: {workdayProgress}%</span>
          </div>
          <div className="track-progress-rail">
            <div className="track-progress-fill" style={{ width: `${workdayProgress}%` }} />
          </div>

          <div className="track-clock-stats">
            <div className="track-mini-stat">
              <div className="label">First clock in</div>
              <div className="value">{today?.firstClockIn ? formatTime(today.firstClockIn) : "-"}</div>
            </div>
            <div className="track-mini-stat">
              <div className="label">Last clock out</div>
              <div className="value">{today?.lastClockOut ? formatTime(today.lastClockOut) : "-"}</div>
            </div>
          </div>

          <div className="track-day-card">
            <div className="track-day-header">
              <strong>{today ? formatDayLabel(today.day) : "Today"}</strong>
              <span>{secondsToClock(liveTotals.workedSeconds)}</span>
            </div>
            <div className="track-session-stack">
              {today?.sessions?.length ? (
                today.sessions.map((session, index) => (
                  <div key={`today-${session.type}-${session.startAt}-${index}`} className="track-session-row">
                    <div className="track-session-left">
                      <span>{deriveSessionLabel(session, user?.name)}</span>
                      {deriveSessionTag(session) ? <span className="track-session-tag">{deriveSessionTag(session)}</span> : null}
                    </div>
                    <div className="track-session-right">
                      <div className="track-session-duration">{formatDurationCompact(session.durationSeconds)}</div>
                      <div className="track-session-range">{formatSessionRange(session)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="track-empty">No sessions yet today.</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="track-timesheet-layout">
          <aside className="track-desktop-panel">
            <div className="track-panel-card">
              <h3>Window Summary</h3>
              <div className="track-panel-grid">
                <div className="track-panel-item">
                  <span className="track-panel-label">Days shown</span>
                  <strong>{desktopSummary.dayCount}</strong>
                </div>
                <div className="track-panel-item">
                  <span className="track-panel-label">Worked</span>
                  <strong>{formatDurationCompact(desktopSummary.workedSeconds)}</strong>
                </div>
                <div className="track-panel-item">
                  <span className="track-panel-label">Break</span>
                  <strong>{formatDurationCompact(desktopSummary.breakSeconds)}</strong>
                </div>
                <div className="track-panel-item">
                  <span className="track-panel-label">Open sessions</span>
                  <strong>{desktopSummary.openSessions}</strong>
                </div>
              </div>
            </div>

            <div className="track-panel-card">
              <h3>Today</h3>
              <p className="track-panel-note">{today ? formatDayLabel(today.day) : "Today"}</p>
              <div className="track-panel-item">
                <span className="track-panel-label">Status</span>
                <strong>{today?.status || "OUT"}</strong>
              </div>
              <div className="track-panel-item">
                <span className="track-panel-label">Worked now</span>
                <strong>{secondsToClock(liveTotals.workedSeconds)}</strong>
              </div>
              <div className="track-panel-item">
                <span className="track-panel-label">Session count</span>
                <strong>{todaySessionCount}</strong>
              </div>
            </div>
            <div className="track-panel-card">
              <h3>Last 7 Days</h3>
              <div className="track-bars">
                {weeklyBars.map((day) => {
                  const ratio = Math.max(0, Math.min(1, (Number(day.workedSeconds) || 0) / TARGET_WORK_SECONDS));
                  return (
                    <div className="track-bar-row" key={`bar-${day.day}`}>
                      <span className="track-bar-label">{WORKDAY_KEYS[new Date(day.day).getDay()]}</span>
                      <div className="track-bar-rail">
                        <div className="track-bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </div>
                      <span className="track-bar-time">{formatDurationCompact(day.workedSeconds)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="track-timesheet-list">
            {filteredDays.map((day) => (
              <article key={day.day} className="track-day-card">
                <div className="track-day-header">
                  <strong>{formatDayLabel(day.day)}</strong>
                  <div className="track-total-wrap">
                    <span className="track-total-main">{formatDurationCompact(day.workedSeconds)}</span>
                    <span className="track-total-sub">{secondsToClock(day.workedSeconds)}</span>
                  </div>
                </div>

                <div className="track-session-stack">
                  {day.displaySessions.length ? (
                    day.displaySessions.map((session, index) => (
                      <div key={`${day.day}-${session.type}-${session.startAt}-${index}`} className="track-session-row">
                        <div className="track-session-left">
                          <span>{deriveSessionLabel(session, user?.name)}</span>
                          {deriveSessionTag(session) ? <span className="track-session-tag">{deriveSessionTag(session)}</span> : null}
                        </div>
                        <div className="track-session-right">
                          <div className="track-session-duration">{formatDurationCompact(session.durationSeconds)}</div>
                          <div className="track-session-range">{formatSessionRange(session)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="track-empty">No matching sessions.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
