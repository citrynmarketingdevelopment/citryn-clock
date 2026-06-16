import { ProjectMemberRole } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const addColumnSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

async function canManageProject(projectId, userId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: ProjectMemberRole.MANAGER } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(project);
}

async function authorize(request, projectId) {
  const user = await requireRequestUser(request);
  await requireProjectAccess(user.id, projectId);
  const canManage = await canManageProject(projectId, user.id);
  return { user, canManage };
}

function errorResponse(error) {
  return NextResponse.json(
    { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
    { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
  );
}

function columnPayload(column) {
  return { id: column.id, name: column.name, order: column.order };
}

export async function POST(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let auth;
  try {
    auth = await authorize(request, projectId);
  } catch (error) {
    return errorResponse(error);
  }
  if (!auth.canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = addColumnSchema.parse(await request.json());
    const last = await prisma.projectColumn.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const column = await prisma.projectColumn.create({
      data: { projectId, name: payload.name, order: nextOrder },
    });

    return NextResponse.json({ column: columnPayload(column) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add column." }, { status: 400 });
  }
}

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let auth;
  try {
    auth = await authorize(request, projectId);
  } catch (error) {
    return errorResponse(error);
  }
  if (!auth.canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = reorderSchema.parse(await request.json());
    const orderedIds = [...new Set(payload.orderedIds)];

    const existing = await prisma.projectColumn.findMany({
      where: { projectId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((column) => column.id));
    if (orderedIds.length !== existing.length || orderedIds.some((id) => !existingIds.has(id))) {
      return NextResponse.json({ error: "Ordered ids must match this project's columns." }, { status: 400 });
    }

    // Two-phase rewrite: @@unique([projectId, order]) forbids transient duplicate
    // order values, so first park every column at a non-colliding negative slot.
    await prisma.$transaction([
      ...orderedIds.map((id, index) =>
        prisma.projectColumn.update({ where: { id }, data: { order: -1 - index } }),
      ),
      ...orderedIds.map((id, index) =>
        prisma.projectColumn.update({ where: { id }, data: { order: index } }),
      ),
    ]);

    const columns = await prisma.projectColumn.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ columns: columns.map(columnPayload) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to reorder columns." }, { status: 400 });
  }
}
