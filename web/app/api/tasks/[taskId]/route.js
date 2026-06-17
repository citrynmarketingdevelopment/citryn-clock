import { TaskPriority, TaskRecurrenceFrequency } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { taskInclude, toTaskPayload } from "@/lib/task-payload";
import { nextRecurringDueDate } from "@/lib/task-recurrence";

const updateTaskSchema = z
  .object({
    completed: z.boolean().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    recurrenceFrequency: z.nativeEnum(TaskRecurrenceFrequency).optional(),
    recurrenceInterval: z.coerce.number().int().min(1).max(52).optional(),
    recurrenceDayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional(),
    recurrenceDayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
    laborMinutes: z.number().int().positive().optional(),
    columnId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const taskId = routeParams?.taskId;
  if (!taskId) {
    return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = updateTaskSchema.parse(await request.json());

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        dueDate: true,
        recurrenceFrequency: true,
        recurrenceInterval: true,
        recurrenceDayOfWeek: true,
        recurrenceDayOfMonth: true,
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const canAccess = await canUserAccessProject(user.id, task.projectId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const data = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.priority !== undefined) data.priority = payload.priority;
    if (payload.dueDate !== undefined) {
      data.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    }
    if (payload.recurrenceFrequency !== undefined) data.recurrenceFrequency = payload.recurrenceFrequency;
    if (payload.recurrenceInterval !== undefined) data.recurrenceInterval = payload.recurrenceInterval;
    if (payload.recurrenceDayOfWeek !== undefined) data.recurrenceDayOfWeek = payload.recurrenceDayOfWeek;
    if (payload.recurrenceDayOfMonth !== undefined) data.recurrenceDayOfMonth = payload.recurrenceDayOfMonth;
    if (payload.recurrenceFrequency === TaskRecurrenceFrequency.NONE) {
      data.recurrenceInterval = 1;
      data.recurrenceDayOfWeek = null;
      data.recurrenceDayOfMonth = null;
    }
    if (payload.laborMinutes !== undefined) data.laborMinutes = payload.laborMinutes;
    if (payload.columnId !== undefined) {
      if (payload.columnId) {
        const column = await prisma.projectColumn.findFirst({
          where: { id: payload.columnId, projectId: task.projectId },
          select: { id: true },
        });
        if (!column) {
          return NextResponse.json({ error: "Column does not belong to this project." }, { status: 400 });
        }
      }
      data.columnId = payload.columnId;
    }
    if (payload.completed !== undefined) {
      if (!payload.completed) {
        data.completedAt = null;
      } else {
        const completedAt = new Date();
        const recurrenceState = {
          dueDate: data.dueDate !== undefined ? data.dueDate : task.dueDate,
          recurrenceFrequency: data.recurrenceFrequency ?? task.recurrenceFrequency,
          recurrenceInterval: data.recurrenceInterval ?? task.recurrenceInterval,
          recurrenceDayOfWeek: data.recurrenceDayOfWeek ?? task.recurrenceDayOfWeek,
          recurrenceDayOfMonth: data.recurrenceDayOfMonth ?? task.recurrenceDayOfMonth,
        };
        const nextDueDate = nextRecurringDueDate(recurrenceState, completedAt);
        if (nextDueDate) {
          data.completedAt = null;
          data.dueDate = nextDueDate;
          data.recurrenceLastCompletedAt = completedAt;
        } else {
          data.completedAt = completedAt;
        }
      }
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data,
      include: taskInclude,
    });

    return NextResponse.json({ task: toTaskPayload(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "Unable to update task." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update task." }, { status: 400 });
  }
}
