import { ProjectMemberRole, TaskPriority } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional().nullable(),
});

const defaultColumns = ["To Do", "In Progress", "Review", "Done"];

function toProjectSummary(project) {
  const taskCount = project.tasks?.length ?? 0;
  const dueSoonCount =
    project.tasks?.filter((task) => task.dueDate && task.dueDate.getTime() >= Date.now() && task.dueDate.getTime() <= Date.now() + 7 * 86400000)
      .length ?? 0;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    taskCount,
    dueSoonCount,
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (typeof prisma.project?.findMany !== "function") {
    return NextResponse.json({ projects: [] });
  }

  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      include: {
        tasks: {
          select: {
            id: true,
            dueDate: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    return NextResponse.json({
      projects: projects.map(toProjectSummary),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load projects." }, { status: 500 });
  }
}

export async function POST(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = createProjectSchema.parse(await request.json());
    const description = payload.description ? payload.description.trim() : null;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: payload.name,
          description,
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: ProjectMemberRole.MANAGER,
            },
          },
          columns: {
            create: defaultColumns.map((name, index) => ({ name, order: index })),
          },
        },
        include: {
          columns: {
            orderBy: { order: "asc" },
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          ownerId: project.ownerId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          columns: project.columns,
          defaultTaskPriority: TaskPriority.MEDIUM,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unable to create project." }, { status: 400 });
  }
}
