import { ClockEventType } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canApplyAction, endOfDay, startOfDay, summarizeDay } from "@/lib/time";

const actionSchema = z.object({
  action: z.nativeEnum(ClockEventType),
});

export async function POST(request) {
  let userId;
  try {
    const user = await requireRequestUser(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = actionSchema.parse(await request.json());
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const dayEvents = await prisma.clockEvent.findMany({
      where: {
        userId,
        occurredAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { occurredAt: "asc" },
    });

    const currentSummary = summarizeDay(now, dayEvents);
    if (!canApplyAction(currentSummary.status, payload.action)) {
      return NextResponse.json(
        {
          error: `Invalid action from current status ${currentSummary.status}.`,
          status: currentSummary.status,
        },
        { status: 400 },
      );
    }

    await prisma.clockEvent.create({
      data: {
        userId,
        type: payload.action,
        occurredAt: now,
      },
    });

    const updatedEvents = await prisma.clockEvent.findMany({
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
      events: updatedEvents,
      summary: summarizeDay(now, updatedEvents),
    });
  } catch {
    return NextResponse.json({ error: "Unable to save action." }, { status: 400 });
  }
}
