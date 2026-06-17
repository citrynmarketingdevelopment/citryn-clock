import { ProjectFieldType } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { taskInclude, toTaskPayload } from "@/lib/task-payload";

const subtaskSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  completed: z.boolean().default(false),
});

const setSubtasksSchema = z.object({
  subtasks: z.array(subtaskSchema).default([]),
});

async function ensureSubtasksField(projectId) {
  const existing = await prisma.projectField.findFirst({
    where: {
      projectId,
      type: ProjectFieldType.SUBTASKS,
      name: { equals: "Subtasks", mode: "insensitive" },
    },
  });
  if (existing) return existing;

  const last = await prisma.projectField.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  return prisma.projectField.create({
    data: {
      projectId,
      name: "Subtasks",
      type: ProjectFieldType.SUBTASKS,
      order: (last?.order ?? -1) + 1,
      options: null,
    },
  });
}

export async function POST(request, { params }) {
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
    const payload = setSubtasksSchema.parse(await request.json());
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const canAccess = await canUserAccessProject(user.id, task.projectId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const field = await ensureSubtasksField(task.projectId);

    if (payload.subtasks.length === 0) {
      await prisma.taskFieldValue.deleteMany({ where: { taskId, fieldId: field.id } });
    } else {
      await prisma.taskFieldValue.upsert({
        where: { taskId_fieldId: { taskId, fieldId: field.id } },
        update: { value: payload.subtasks },
        create: { taskId, fieldId: field.id, value: payload.subtasks },
      });
    }

    const updated = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
    return NextResponse.json({ task: toTaskPayload(updated), field: { id: field.id, name: field.name, type: field.type } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid subtasks." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update subtasks." }, { status: 400 });
  }
}
