import { TaskPriority, TaskRecurrenceFrequency } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { ensureProjectAssigneeAccess } from "@/lib/task-assignee-access";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(6000),
  laborMinutes: z.coerce.number().int().min(1).max(10080),
  priority: z.nativeEnum(TaskPriority),
  dueDate: z.string().datetime().optional().nullable(),
  recurrenceFrequency: z.nativeEnum(TaskRecurrenceFrequency).optional().default(TaskRecurrenceFrequency.NONE),
  recurrenceInterval: z.coerce.number().int().min(1).max(52).optional().default(1),
  recurrenceDayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  recurrenceDayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  columnId: z.string().trim().min(1).optional().nullable(),
  assigneeUserIds: z.array(z.string().trim().min(1)).optional().default([]),
});

function toTaskPayload(task) {
  return {
    id: task.id,
    projectId: task.projectId,
    columnId: task.columnId,
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
    createdById: task.createdById,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignees: (task.assignments ?? []).map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
    })),
    attachments: (task.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      url: attachment.url,
      label: attachment.label,
      createdById: attachment.createdById,
      createdAt: attachment.createdAt,
    })),
  };
}

export async function GET(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
    await requireProjectAccess(user.id, projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_MODEL_UNAVAILABLE") {
      return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (typeof prisma.task?.findMany !== "function") {
    return NextResponse.json({ tasks: [] });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        attachments: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json({ tasks: tasks.map(toTaskPayload) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tasks." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
    await requireProjectAccess(user.id, projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_MODEL_UNAVAILABLE") {
      return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (
    typeof prisma.task?.findMany !== "function" ||
    typeof prisma.project?.findFirst !== "function" ||
    typeof prisma.projectColumn?.findFirst !== "function" ||
    typeof prisma.projectMember?.findMany !== "function"
  ) {
    return NextResponse.json({ error: "Task models are unavailable. Please refresh server runtime." }, { status: 503 });
  }

  try {
    const payload = createTaskSchema.parse(await request.json());
    const assigneeIds = [...new Set(payload.assigneeUserIds)];
    const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    const recurrenceFrequency = payload.recurrenceFrequency ?? TaskRecurrenceFrequency.NONE;

    const task = await prisma.$transaction(async (tx) => {
      if (payload.columnId) {
        const column = await tx.projectColumn.findFirst({
          where: {
            id: payload.columnId,
            projectId,
          },
          select: { id: true },
        });
        if (!column) {
          throw new Error("INVALID_COLUMN");
        }
      }

      await ensureProjectAssigneeAccess(tx, projectId, assigneeIds);

      const created = await tx.task.create({
        data: {
          projectId,
          columnId: payload.columnId || null,
          title: payload.title,
          description: payload.description,
          laborMinutes: payload.laborMinutes,
          priority: payload.priority,
          dueDate,
          recurrenceFrequency,
          recurrenceInterval: recurrenceFrequency === TaskRecurrenceFrequency.NONE ? 1 : payload.recurrenceInterval,
          recurrenceDayOfWeek:
            recurrenceFrequency === TaskRecurrenceFrequency.WEEKLY ? payload.recurrenceDayOfWeek ?? dueDate?.getDay() ?? null : null,
          recurrenceDayOfMonth:
            recurrenceFrequency === TaskRecurrenceFrequency.MONTHLY ? payload.recurrenceDayOfMonth ?? dueDate?.getDate() ?? null : null,
          createdById: user.id,
          assignments: {
            create: assigneeIds.map((assigneeId) => ({
              userId: assigneeId,
              assignedById: user.id,
            })),
          },
        },
        include: {
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          attachments: {
            orderBy: [{ createdAt: "asc" }],
          },
        },
      });

      return created;
    });

    return NextResponse.json({ task: toTaskPayload(task) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_COLUMN") {
      return NextResponse.json({ error: "Invalid column for this project." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_ASSIGNEE") {
      return NextResponse.json({ error: "One or more assignees do not have access to this project." }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid task payload." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create task." }, { status: 400 });
  }
}
