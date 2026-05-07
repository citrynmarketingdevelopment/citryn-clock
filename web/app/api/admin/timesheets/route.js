import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, summarizeDay } from "@/lib/time";

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDays(raw) {
  const value = Number(raw ?? "7");
  if (!Number.isFinite(value)) {
    return 7;
  }
  return Math.max(1, Math.min(30, Math.floor(value)));
}

export async function GET(request) {
  try {
    await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const days = parseDays(request.nextUrl.searchParams.get("days"));
  const today = startOfDay(new Date());
  const rangeStart = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const employeeTimesheets = await Promise.all(
    users.map(async (user) => {
      const events = await prisma.clockEvent.findMany({
        where: {
          userId: user.id,
          occurredAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
        orderBy: { occurredAt: "asc" },
      });

      const grouped = new Map();
      for (const event of events) {
        const key = dayKey(event.occurredAt);
        const current = grouped.get(key) ?? [];
        current.push(event);
        grouped.set(key, current);
      }

      const summaries = [];
      for (let i = 0; i < days; i += 1) {
        const day = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
        const key = dayKey(day);
        summaries.push(summarizeDay(day, grouped.get(key) ?? []));
      }

      summaries.reverse();

      return {
        user,
        summaries,
      };
    }),
  );

  return NextResponse.json({ employeeTimesheets });
}
