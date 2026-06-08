import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { formatDayKey } from "@/lib/day";
import { prisma } from "@/lib/prisma";
import { createEmptySummary, startOfDay, summarizeEventsByShiftDay } from "@/lib/time";

function parseDays(raw) {
  const value = Number(raw ?? "14");
  if (!Number.isFinite(value)) {
    return 14;
  }
  return Math.max(1, Math.min(60, Math.floor(value)));
}

export async function GET(request) {
  let userId;
  try {
    const user = await requireRequestUser(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const days = parseDays(request.nextUrl.searchParams.get("days"));
  const today = startOfDay(new Date());
  const rangeStart = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const events = await prisma.clockEvent.findMany({
    where: {
      userId,
      occurredAt: {
        gte: rangeStart,
      },
    },
    orderBy: { occurredAt: "asc" },
  });

  const grouped = summarizeEventsByShiftDay(events);

  const summaries = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = formatDayKey(day);
    summaries.push(grouped.get(key) ?? createEmptySummary(day));
  }

  summaries.reverse();

  return NextResponse.json({ summaries });
}
