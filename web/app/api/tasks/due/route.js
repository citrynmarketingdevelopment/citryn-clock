import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    laborMinutes: task.laborMinutes,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    recurrenceFrequency: task.recurrenceFrequency ?? "NONE",
    recurrenceInterval: task.recurrenceInterval ?? 1,
    recurrenceDayOfWeek: task.recurrenceDayOfWeek ?? null,
    recurrenceDayOfMonth: task.recurrenceDayOfMonth ?? null,
    recurrenceLastCompletedAt: task.recurrenceLastCompletedAt ?? null,
    project: {
      id: task.project.id,
      name: task.project.name,
    },
    assignees: task.assignments.map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
    })),
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (typeof prisma.task?.findMany !== "function") {
    return NextResponse.json({ tasks: [] });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const dueDateFilter = {};
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  if (from && !fromDate) {
    return NextResponse.json({ error: "Invalid from date." }, { status: 400 });
  }
  if (to && !toDate) {
    return NextResponse.json({ error: "Invalid to date." }, { status: 400 });
  }

  if (fromDate) {
    dueDateFilter.gte = fromDate;
  }
  if (toDate) {
    dueDateFilter.lte = toDate;
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: Object.keys(dueDateFilter).length > 0 ? dueDateFilter : { not: null },
        assignments: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ tasks: tasks.map(toTask) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load due dates." }, { status: 500 });
  }
}
