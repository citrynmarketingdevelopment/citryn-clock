import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { taskInclude, toTaskPayload } from "@/lib/task-payload";

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
        project: {
          is: {
            OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
          },
        },
      },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ tasks: tasks.map(toTaskPayload) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tasks." }, { status: 500 });
  }
}
