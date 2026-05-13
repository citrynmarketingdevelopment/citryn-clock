import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function toTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    laborMinutes: task.laborMinutes,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    project: {
      id: task.project.id,
      name: task.project.name,
    },
    column: task.column
      ? {
          id: task.column.id,
          name: task.column.name,
          order: task.column.order,
        }
      : null,
    assignees: task.assignments.map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
    })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
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

  try {
    const tasks = await prisma.task.findMany({
      where: {
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
        column: {
          select: { id: true, name: true, order: true },
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tasks." }, { status: 500 });
  }
}
