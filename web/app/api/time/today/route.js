import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { endOfDay, startOfDay, summarizeDay } from "@/lib/time";

export async function GET(request) {
  let userId;
  try {
    const user = await requireRequestUser(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const events = await prisma.clockEvent.findMany({
    where: {
      userId,
      occurredAt: {
        gte: dayStart,
        lt: dayEnd,
      },
    },
    orderBy: { occurredAt: "asc" },
  });

  return NextResponse.json({
    events,
    summary: summarizeDay(now, events),
  });
}
