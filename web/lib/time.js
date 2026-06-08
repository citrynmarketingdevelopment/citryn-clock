import { ClockEventType } from "@prisma/client";
import { formatDayKey } from "@/lib/day";

export function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date = new Date()) {
  const start = startOfDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function diffSeconds(a, b) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

function buildSession(type, startAt, endAt = null) {
  const closed = startAt && endAt;
  return {
    type,
    startAt: startAt ? startAt.toISOString() : null,
    endAt: endAt ? endAt.toISOString() : null,
    durationSeconds: closed ? diffSeconds(startAt, endAt) : 0,
    isOpen: !closed,
  };
}

export function createEmptySummary(day) {
  return {
    day: formatDayKey(day),
    firstClockIn: null,
    lastClockOut: null,
    workedSeconds: 0,
    breakSeconds: 0,
    workedMinutes: 0,
    breakMinutes: 0,
    status: "OUT",
    sessions: [],
  };
}

function ensureSummary(summaries, day) {
  const key = formatDayKey(day);
  if (!summaries.has(key)) {
    summaries.set(key, createEmptySummary(day));
  }
  return summaries.get(key);
}

function appendSession(summary, type, startAt, endAt = null) {
  const session = buildSession(type, startAt, endAt);
  summary.sessions.push(session);
  if (type === "WORK") {
    summary.workedSeconds += session.durationSeconds;
    summary.workedMinutes = Math.floor(summary.workedSeconds / 60);
    return;
  }
  summary.breakSeconds += session.durationSeconds;
  summary.breakMinutes = Math.floor(summary.breakSeconds / 60);
}

function closeActiveSummary(summary, workStart, breakStart, closedAt) {
  if (!summary) {
    return;
  }

  if (workStart) {
    appendSession(summary, "WORK", workStart, closedAt);
  }
  if (breakStart) {
    appendSession(summary, "BREAK", breakStart, closedAt);
  }

  summary.lastClockOut = closedAt.toISOString();
  summary.status = "OUT";
}

export function deriveWorkStatus(events) {
  let status = "OUT";

  for (const event of events) {
    if (event.type === ClockEventType.CLOCK_IN) {
      status = "WORKING";
      continue;
    }
    if (event.type === ClockEventType.BREAK_START && status === "WORKING") {
      status = "ON_BREAK";
      continue;
    }
    if (event.type === ClockEventType.BREAK_END && status === "ON_BREAK") {
      status = "WORKING";
      continue;
    }
    if (event.type === ClockEventType.CLOCK_OUT) {
      status = "OUT";
    }
  }

  return status;
}

export function summarizeDay(day, events) {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let workedSeconds = 0;
  let breakSeconds = 0;
  let lastWorkStart = null;
  let lastBreakStart = null;
  let firstClockIn = null;
  let lastClockOut = null;
  const sessions = [];

  for (const event of sorted) {
    if (event.type === ClockEventType.CLOCK_IN) {
      if (!firstClockIn) {
        firstClockIn = event.occurredAt.toISOString();
      }
      lastWorkStart = event.occurredAt;
      lastBreakStart = null;
      continue;
    }

    if (event.type === ClockEventType.BREAK_START && lastWorkStart) {
      const workSession = buildSession("WORK", lastWorkStart, event.occurredAt);
      workedSeconds += workSession.durationSeconds;
      sessions.push(workSession);
      lastWorkStart = null;
      lastBreakStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.BREAK_END && lastBreakStart) {
      const breakSession = buildSession("BREAK", lastBreakStart, event.occurredAt);
      breakSeconds += breakSession.durationSeconds;
      sessions.push(breakSession);
      lastBreakStart = null;
      lastWorkStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.CLOCK_OUT) {
      if (lastWorkStart) {
        const workSession = buildSession("WORK", lastWorkStart, event.occurredAt);
        workedSeconds += workSession.durationSeconds;
        sessions.push(workSession);
      }
      if (lastBreakStart) {
        const breakSession = buildSession("BREAK", lastBreakStart, event.occurredAt);
        breakSeconds += breakSession.durationSeconds;
        sessions.push(breakSession);
      }
      lastWorkStart = null;
      lastBreakStart = null;
      lastClockOut = event.occurredAt.toISOString();
    }
  }

  const status = deriveWorkStatus(sorted);
  if (status === "WORKING" && lastWorkStart) {
    sessions.push(buildSession("WORK", lastWorkStart));
  } else if (status === "ON_BREAK" && lastBreakStart) {
    sessions.push(buildSession("BREAK", lastBreakStart));
  }

  return {
    day: formatDayKey(day),
    firstClockIn,
    lastClockOut,
    workedSeconds,
    breakSeconds,
    workedMinutes: Math.floor(workedSeconds / 60),
    breakMinutes: Math.floor(breakSeconds / 60),
    status,
    sessions,
  };
}

export function summarizeEventsByShiftDay(events) {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const summaries = new Map();

  let currentSummary = null;
  let lastWorkStart = null;
  let lastBreakStart = null;

  for (const event of sorted) {
    if (event.type === ClockEventType.CLOCK_IN) {
      if (currentSummary) {
        closeActiveSummary(currentSummary, lastWorkStart, lastBreakStart, event.occurredAt);
      }
      currentSummary = ensureSummary(summaries, event.occurredAt);
      if (!currentSummary.firstClockIn) {
        currentSummary.firstClockIn = event.occurredAt.toISOString();
      }
      currentSummary.status = "WORKING";
      lastWorkStart = event.occurredAt;
      lastBreakStart = null;
      continue;
    }

    if (event.type === ClockEventType.BREAK_START && currentSummary && lastWorkStart) {
      appendSession(currentSummary, "WORK", lastWorkStart, event.occurredAt);
      currentSummary.status = "ON_BREAK";
      lastWorkStart = null;
      lastBreakStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.BREAK_END && currentSummary && lastBreakStart) {
      appendSession(currentSummary, "BREAK", lastBreakStart, event.occurredAt);
      currentSummary.status = "WORKING";
      lastBreakStart = null;
      lastWorkStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.CLOCK_OUT && currentSummary) {
      closeActiveSummary(currentSummary, lastWorkStart, lastBreakStart, event.occurredAt);
      currentSummary = null;
      lastWorkStart = null;
      lastBreakStart = null;
    }
  }

  if (currentSummary && lastWorkStart) {
    appendSession(currentSummary, "WORK", lastWorkStart);
    currentSummary.status = "WORKING";
  } else if (currentSummary && lastBreakStart) {
    appendSession(currentSummary, "BREAK", lastBreakStart);
    currentSummary.status = "ON_BREAK";
  }

  return summaries;
}

export function getActiveSummary(summaries) {
  let activeSummary = null;
  for (const summary of summaries.values()) {
    if (summary.status !== "OUT" && summary.sessions.some((session) => session.isOpen)) {
      activeSummary = summary;
    }
  }
  return activeSummary;
}

export function getCurrentSummaryAndEvents(now, events) {
  const summaries = summarizeEventsByShiftDay(events);
  const activeSummary = getActiveSummary(summaries);

  if (activeSummary) {
    const activeStartMs = activeSummary.firstClockIn ? new Date(activeSummary.firstClockIn).getTime() : null;
    const activeEvents =
      activeStartMs == null
        ? []
        : events.filter((event) => event.occurredAt.getTime() >= activeStartMs);

    return {
      events: activeEvents,
      summary: activeSummary,
      summaries,
    };
  }

  const daySummary = summaries.get(formatDayKey(now)) ?? createEmptySummary(now);
  const dayStart = startOfDay(now).getTime();
  const dayEnd = endOfDay(now).getTime();
  const dayEvents = events.filter((event) => {
    const occurredAtMs = event.occurredAt.getTime();
    return occurredAtMs >= dayStart && occurredAtMs < dayEnd;
  });

  return {
    events: dayEvents,
    summary: daySummary,
    summaries,
  };
}

export function canApplyAction(status, action) {
  if (action === ClockEventType.CLOCK_IN) {
    return status === "OUT";
  }
  if (action === ClockEventType.BREAK_START) {
    return status === "WORKING";
  }
  if (action === ClockEventType.BREAK_END) {
    return status === "ON_BREAK";
  }
  if (action === ClockEventType.CLOCK_OUT) {
    return status === "WORKING" || status === "ON_BREAK";
  }
  return false;
}
