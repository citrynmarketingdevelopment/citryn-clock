import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { endOfDay, getCurrentSummaryAndEvents } from "@/lib/time";

export async function GET(request) {
  let userId;
  try {
    const user = await requireRequestUser(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const dayEnd = endOfDay(now);

  const events = await prisma.clockEvent.findMany({
    where: {
      userId,
      occurredAt: {
        lt: dayEnd,
      },
    },
    orderBy: { occurredAt: "asc" },
  });

  const current = getCurrentSummaryAndEvents(now, events);

  return NextResponse.json({
    events: current.events,
    summary: current.summary,
  });
}
