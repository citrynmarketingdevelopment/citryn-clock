import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { formatDayKey, formatUtcDayKey } from "@/lib/day";
import { prisma } from "@/lib/prisma";
import { createEmptySummary, startOfDay, summarizeEventsByShiftDay } from "@/lib/time";

function hasRequiredModels() {
  return (
    typeof prisma.user?.findMany === "function" &&
    typeof prisma.clockEvent?.findMany === "function" &&
    typeof prisma.timesheetDayOverride?.findMany === "function"
  );
}

function parseDays(raw) {
  const value = Number(raw ?? "7");
  if (!Number.isFinite(value)) {
    return 7;
  }
  return Math.max(1, Math.min(90, Math.floor(value)));
}

function parseLocalDateInput(raw) {
  const text = String(raw || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

function parseRange(searchParams) {
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");

  if (startRaw && endRaw) {
    const start = parseLocalDateInput(startRaw);
    const end = parseLocalDateInput(endRaw);
    if (!start || !end) return null;
    if (end.getTime() < start.getTime()) return null;

    const maxRangeDays = 90;
    const daySpan = Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000) + 1;
    if (daySpan < 1 || daySpan > maxRangeDays) return null;

    const rangeStart = startOfDay(start);
    const rangeEndExclusive = new Date(startOfDay(end).getTime() + 86400000);
    return { rangeStart, rangeEndExclusive, days: daySpan };
  }

  const days = parseDays(searchParams.get("days"));
  const today = startOfDay(new Date());
  const rangeStart = new Date(today.getTime() - (days - 1) * 86400000);
  const rangeEndExclusive = new Date(today.getTime() + 86400000);
  return { rangeStart, rangeEndExclusive, days };
}

function summarizeEmployeeDays(events, rangeStart, days, overridesMap) {
  const grouped = summarizeEventsByShiftDay(events);

  const summaries = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(rangeStart.getTime() + i * 86400000);
    const key = formatDayKey(day);
    const baseSummary = grouped.get(key) ?? createEmptySummary(day);
    const overrideWorkedSeconds = overridesMap.get(key);
    const hasOverride = Number.isFinite(overrideWorkedSeconds);
    const workedSeconds = hasOverride ? Math.max(0, Number(overrideWorkedSeconds) || 0) : baseSummary.workedSeconds;

    summaries.push({
      ...baseSummary,
      workedSeconds,
      workedMinutes: Math.floor(workedSeconds / 60),
      originalWorkedSeconds: baseSummary.workedSeconds,
      hasOverride,
    });
  }

  summaries.reverse();
  return summaries;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function secondsToDecimalHours(seconds) {
  return (Math.max(0, Number(seconds) || 0) / 3600).toFixed(4);
}

export async function GET(request) {
  let adminUser;
  try {
    adminUser = await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (!hasRequiredModels()) {
    return NextResponse.json(
      { error: "Timesheet models are missing in this deployment. Redeploy so prisma generate runs on build." },
      { status: 503 },
    );
  }

  const parsedRange = parseRange(request.nextUrl.searchParams);
  if (!parsedRange) {
    return NextResponse.json({ error: "Invalid date range. Use YYYY-MM-DD and max 90 days." }, { status: 400 });
  }

  const { rangeStart, rangeEndExclusive, days } = parsedRange;
  const overrideStart = new Date(`${formatDayKey(rangeStart)}T00:00:00.000Z`);
  const overrideEnd = new Date(`${formatDayKey(rangeEndExclusive)}T00:00:00.000Z`);

  const users = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const [events, overrides] = await Promise.all([
    prisma.clockEvent.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        occurredAt: {
          gte: rangeStart,
        },
      },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.timesheetDayOverride.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        day: {
          gte: overrideStart,
          lt: overrideEnd,
        },
      },
      select: {
        id: true,
        userId: true,
        day: true,
        workedSeconds: true,
        updatedByAdminId: true,
        createdAt: true,
        updatedAt: true,
        updatedByAdmin: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const eventsByUser = new Map();
  for (const event of events) {
    const current = eventsByUser.get(event.userId) ?? [];
    current.push(event);
    eventsByUser.set(event.userId, current);
  }

  const overridesByUser = new Map();
  for (const override of overrides) {
    const current = overridesByUser.get(override.userId) ?? new Map();
    current.set(formatUtcDayKey(override.day), override.workedSeconds);
    overridesByUser.set(override.userId, current);
  }

  const employeeTimesheets = users.map((user) => {
    const summaries = summarizeEmployeeDays(
      eventsByUser.get(user.id) ?? [],
      rangeStart,
      days,
      overridesByUser.get(user.id) ?? new Map(),
    );

    const totalWorkedSeconds = summaries.reduce((sum, item) => sum + (Number(item.workedSeconds) || 0), 0);
    const totalBreakSeconds = summaries.reduce((sum, item) => sum + (Number(item.breakSeconds) || 0), 0);

    return {
      user,
      summaries,
      totals: {
        workedSeconds: totalWorkedSeconds,
        breakSeconds: totalBreakSeconds,
      },
    };
  });

  const rangeStartKey = formatDayKey(rangeStart);
  const rangeEndKey = formatDayKey(new Date(rangeEndExclusive.getTime() - 1));
  const loadedAt = new Date().toISOString();
  const exportFormat = request.nextUrl.searchParams.get("export");

  if (exportFormat === "csv") {
    const overridesByEmployeeDay = new Map(
      overrides.map((override) => [`${override.userId}::${formatUtcDayKey(override.day)}`, override]),
    );
    const eventsByEmployeeDay = new Map();
    for (const event of events) {
      if (event.occurredAt < rangeStart || event.occurredAt >= rangeEndExclusive) continue;
      const key = `${event.userId}::${formatDayKey(event.occurredAt)}`;
      const current = eventsByEmployeeDay.get(key) ?? [];
      current.push({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      });
      eventsByEmployeeDay.set(key, current);
    }

    const headers = [
      "employee_id",
      "employee_name",
      "employee_email",
      "employee_archived",
      "date",
      "status",
      "first_clock_in",
      "last_clock_out",
      "worked_seconds",
      "worked_hours",
      "break_seconds",
      "break_hours",
      "has_manual_override",
      "original_worked_seconds",
      "original_worked_hours",
      "employee_range_worked_seconds",
      "employee_range_worked_hours",
      "employee_range_break_seconds",
      "employee_range_break_hours",
      "sessions_json",
      "clock_events_json",
      "override_id",
      "override_updated_at",
      "override_updated_by_name",
      "override_updated_by_email",
    ];
    const rows = [headers];

    for (const employee of employeeTimesheets) {
      for (const summary of [...employee.summaries].reverse()) {
        const key = `${employee.user.id}::${summary.day}`;
        const override = overridesByEmployeeDay.get(key);
        rows.push([
          employee.user.id,
          employee.user.name,
          employee.user.email,
          Boolean(employee.user.archivedAt),
          summary.day,
          summary.status,
          summary.firstClockIn,
          summary.lastClockOut,
          summary.workedSeconds,
          secondsToDecimalHours(summary.workedSeconds),
          summary.breakSeconds,
          secondsToDecimalHours(summary.breakSeconds),
          summary.hasOverride,
          summary.originalWorkedSeconds,
          secondsToDecimalHours(summary.originalWorkedSeconds),
          employee.totals.workedSeconds,
          secondsToDecimalHours(employee.totals.workedSeconds),
          employee.totals.breakSeconds,
          secondsToDecimalHours(employee.totals.breakSeconds),
          JSON.stringify(summary.sessions ?? []),
          JSON.stringify(eventsByEmployeeDay.get(key) ?? []),
          override?.id,
          override?.updatedAt?.toISOString(),
          override?.updatedByAdmin?.name,
          override?.updatedByAdmin?.email,
        ]);
      }
    }

    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="timesheets_${rangeStartKey}_to_${rangeEndKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (exportFormat === "json") {
    const overridesByEmployee = new Map();
    for (const override of overrides) {
      const current = overridesByEmployee.get(override.userId) ?? [];
      current.push({
        ...override,
        day: formatUtcDayKey(override.day),
      });
      overridesByEmployee.set(override.userId, current);
    }

    const exportEmployees = employeeTimesheets.map((employee) => ({
      ...employee,
      clockEvents: (eventsByUser.get(employee.user.id) ?? []).filter(
        (event) => event.occurredAt >= rangeStart && event.occurredAt < rangeEndExclusive,
      ),
      overrides: overridesByEmployee.get(employee.user.id) ?? [],
    }));
    const totalWorkedSeconds = exportEmployees.reduce(
      (sum, employee) => sum + employee.totals.workedSeconds,
      0,
    );
    const totalBreakSeconds = exportEmployees.reduce(
      (sum, employee) => sum + employee.totals.breakSeconds,
      0,
    );
    const payload = {
      export: {
        schema: "citryn-clock.timesheets",
        version: 1,
        generatedAt: loadedAt,
        generatedByAdminId: adminUser.id,
        description:
          "Complete timesheet export with calculated daily summaries, source clock events, and manual overrides.",
        timeValues: "Durations are seconds; timestamps are ISO 8601; day values are YYYY-MM-DD.",
      },
      range: { start: rangeStartKey, end: rangeEndKey, days },
      totals: {
        employeeCount: exportEmployees.length,
        workedSeconds: totalWorkedSeconds,
        breakSeconds: totalBreakSeconds,
      },
      employees: exportEmployees,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="timesheets_${rangeStartKey}_to_${rangeEndKey}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    employeeTimesheets,
    range: {
      start: rangeStartKey,
      end: rangeEndKey,
      days,
      loadedAt,
      adminId: adminUser.id,
    },
  });
}

export async function PATCH(request) {
  let adminUser;
  try {
    adminUser = await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (!hasRequiredModels()) {
    return NextResponse.json(
      { error: "Timesheet models are missing in this deployment. Redeploy so prisma generate runs on build." },
      { status: 503 },
    );
  }

  try {
    const payload = await request.json().catch(() => null);
    const userId = String(payload?.userId || "").trim();
    const dayInput = String(payload?.day || "").trim();
    const hoursRaw = payload?.hours;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const parsedDay = parseLocalDateInput(dayInput);
    if (!parsedDay) {
      return NextResponse.json({ error: "day must be YYYY-MM-DD." }, { status: 400 });
    }
    const day = new Date(`${formatDayKey(parsedDay)}T00:00:00.000Z`);

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!employee || employee.role !== Role.EMPLOYEE) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    if (hoursRaw === null || hoursRaw === "" || typeof hoursRaw === "undefined") {
      await prisma.timesheetDayOverride.deleteMany({
        where: {
          userId,
          day,
        },
      });
      return NextResponse.json({ ok: true, cleared: true });
    }

    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      return NextResponse.json({ error: "hours must be between 0 and 24." }, { status: 400 });
    }

    const workedSeconds = Math.round(hours * 3600);

    const override = await prisma.timesheetDayOverride.upsert({
      where: {
        userId_day: {
          userId,
          day,
        },
      },
      create: {
        userId,
        day,
        workedSeconds,
        updatedByAdminId: adminUser.id,
      },
      update: {
        workedSeconds,
        updatedByAdminId: adminUser.id,
      },
      select: {
        userId: true,
        day: true,
        workedSeconds: true,
      },
    });

    return NextResponse.json({
      ok: true,
      override: {
        userId: override.userId,
        day: formatUtcDayKey(override.day),
        workedSeconds: override.workedSeconds,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to update timesheet override." }, { status: 500 });
  }
}
