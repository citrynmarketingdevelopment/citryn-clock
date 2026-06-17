import { ProjectMemberRole, TaskPriority } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultSpace } from "@/lib/spaces";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional().nullable(),
  spaceId: z.string().trim().min(1).optional().nullable(),
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
    spaceId: project.spaceId ?? null,
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
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
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

    // Resolve the target space: an owned space if one was passed, else default.
    const defaultSpace = await ensureDefaultSpace(user.id);
    let spaceId = defaultSpace.id;
    if (payload.spaceId) {
      const target = await prisma.space.findFirst({
        where: { id: payload.spaceId, ownerId: user.id },
        select: { id: true },
      });
      if (target) spaceId = target.id;
    }

    const lastOwned = await prisma.project.findFirst({
      where: { ownerId: user.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (lastOwned?.order ?? -1) + 1;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: payload.name,
          description,
          ownerId: user.id,
          spaceId,
          order: nextOrder,
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
          spaceId: project.spaceId ?? null,
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

const reorderProjectsSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

export async function PATCH(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = reorderProjectsSchema.parse(await request.json());
    const orderedIds = [...new Set(payload.orderedIds)];

    // Only reorder projects the user can actually see (owner or member).
    const accessible = await prisma.project.findMany({
      where: {
        id: { in: orderedIds },
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      select: { id: true },
    });
    const accessibleIds = new Set(accessible.map((project) => project.id));
    if (orderedIds.some((id) => !accessibleIds.has(id))) {
      return NextResponse.json({ error: "One or more projects are not accessible." }, { status: 400 });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.project.update({ where: { id }, data: { order: index } })),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to reorder projects." }, { status: 400 });
  }
}
