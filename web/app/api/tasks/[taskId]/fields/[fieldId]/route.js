import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { taskInclude, toTaskPayload } from "@/lib/task-payload";

// value may be string | number | boolean | null (depends on the field type);
// null clears the value.
const setValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export async function PUT(request, { params }) {
  const routeParams = await params;
  const { taskId, fieldId } = routeParams ?? {};
  if (!taskId || !fieldId) {
    return NextResponse.json({ error: "Task id and field id are required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = setValueSchema.parse(await request.json());

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

    const field = await prisma.projectField.findFirst({
      where: { id: fieldId, projectId: task.projectId },
      select: { id: true },
    });
    if (!field) {
      return NextResponse.json({ error: "Property does not belong to this project." }, { status: 400 });
    }

    if (payload.value === null) {
      await prisma.taskFieldValue.deleteMany({ where: { taskId, fieldId } });
    } else {
      await prisma.taskFieldValue.upsert({
        where: { taskId_fieldId: { taskId, fieldId } },
        update: { value: payload.value },
        create: { taskId, fieldId, value: payload.value },
      });
    }

    const updated = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
    return NextResponse.json({ task: toTaskPayload(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update property value." }, { status: 400 });
  }
}
