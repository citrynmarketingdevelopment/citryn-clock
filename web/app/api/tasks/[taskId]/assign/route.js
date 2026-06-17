import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { ensureProjectAssigneeAccess } from "@/lib/task-assignee-access";

const assignTaskSchema = z.object({
  userIds: z.array(z.string().trim().min(1)),
  replace: z.boolean().optional().default(true),
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
    const payload = assignTaskSchema.parse(await request.json());
    const requestedIds = [...new Set(payload.userIds)];

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

    await prisma.$transaction(async (tx) => {
      await ensureProjectAssigneeAccess(tx, task.projectId, requestedIds);
      if (payload.replace) {
        await tx.taskAssignment.deleteMany({ where: { taskId: task.id } });
      }
      await tx.taskAssignment.createMany({
        data: requestedIds.map((assigneeId) => ({
          taskId: task.id,
          userId: assigneeId,
          assignedById: user.id,
        })),
        skipDuplicates: true,
      });
    });

    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { assignedAt: "asc" },
    });

    return NextResponse.json({
      taskId: task.id,
      assignees: assignments.map((assignment) => assignment.user),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ASSIGNEE") {
      return NextResponse.json({ error: "One or more assignees could not be found." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to assign task." }, { status: 400 });
  }
}
