import { ProjectFieldType, ProjectMemberRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const optionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).optional(),
});

const createFieldSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.nativeEnum(ProjectFieldType).default(ProjectFieldType.TEXT),
  options: z.array(optionSchema).optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

function normalizeOptions(options) {
  if (!options) return null;
  return options.map((option) => ({
    id: option.id || randomUUID(),
    name: option.name,
    color: option.color || "blue",
  }));
}

async function canManageProject(projectId, userId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId }, { members: { some: { userId, role: ProjectMemberRole.MANAGER } } }],
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

function fieldPayload(field) {
  return { id: field.id, name: field.name, type: field.type, order: field.order, options: field.options ?? null };
}

export async function GET(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  try {
    const user = await requireRequestUser(request);
    await requireProjectAccess(user.id, projectId);
  } catch (error) {
    return errorResponse(error);
  }

  const fields = await prisma.projectField.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ fields: fields.map(fieldPayload) });
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
    const payload = createFieldSchema.parse(await request.json());
    const last = await prisma.projectField.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const field = await prisma.projectField.create({
      data: {
        projectId,
        name: payload.name,
        type: payload.type,
        order: (last?.order ?? -1) + 1,
        options: payload.type === ProjectFieldType.SELECT ? normalizeOptions(payload.options) : null,
      },
    });
    return NextResponse.json({ field: fieldPayload(field) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add property." }, { status: 400 });
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
    const existing = await prisma.projectField.findMany({ where: { projectId }, select: { id: true } });
    const existingIds = new Set(existing.map((field) => field.id));
    if (orderedIds.length !== existing.length || orderedIds.some((id) => !existingIds.has(id))) {
      return NextResponse.json({ error: "Ordered ids must match this project's fields." }, { status: 400 });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.projectField.update({ where: { id }, data: { order: index } })),
    );

    const fields = await prisma.projectField.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    return NextResponse.json({ fields: fields.map(fieldPayload) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to reorder properties." }, { status: 400 });
  }
}
