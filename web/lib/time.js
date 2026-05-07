import { ClockEventType } from "@prisma/client";

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
      workedSeconds += diffSeconds(lastWorkStart, event.occurredAt);
      lastWorkStart = null;
      lastBreakStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.BREAK_END && lastBreakStart) {
      breakSeconds += diffSeconds(lastBreakStart, event.occurredAt);
      lastBreakStart = null;
      lastWorkStart = event.occurredAt;
      continue;
    }

    if (event.type === ClockEventType.CLOCK_OUT) {
      if (lastWorkStart) {
        workedSeconds += diffSeconds(lastWorkStart, event.occurredAt);
      }
      if (lastBreakStart) {
        breakSeconds += diffSeconds(lastBreakStart, event.occurredAt);
      }
      lastWorkStart = null;
      lastBreakStart = null;
      lastClockOut = event.occurredAt.toISOString();
    }
  }

  return {
    day: startOfDay(day).toISOString(),
    firstClockIn,
    lastClockOut,
    workedSeconds,
    breakSeconds,
    workedMinutes: Math.floor(workedSeconds / 60),
    breakMinutes: Math.floor(breakSeconds / 60),
    status: deriveWorkStatus(sorted),
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
