import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { taskInclude, toTaskPayload } from "@/lib/task-payload";

// Additive endpoint: persists a Kanban card's column change.
// Does not touch the Prisma schema or any existing route. Cross-column moves
// only — within-column ordering is not persisted (Task has no position field).
const moveTaskSchema = z.object({
  columnId: z.string().trim().min(1),
});

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
    const payload = moveTaskSchema.parse(await request.json());

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

    // The destination column must belong to the same project as the task.
    const column = await prisma.projectColumn.findUnique({
      where: { id: payload.columnId },
      select: { id: true, projectId: true },
    });
    if (!column || column.projectId !== task.projectId) {
      return NextResponse.json(
        { error: "Target column does not belong to this project." },
        { status: 400 },
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        columnId: column.id,
      },
      include: taskInclude,
    });

    return NextResponse.json({ task: toTaskPayload(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "Unable to move task." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to move task." }, { status: 400 });
  }
}
