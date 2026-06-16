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

const updateFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: z.nativeEnum(ProjectFieldType).optional(),
    options: z.array(optionSchema).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });

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

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const { projectId, fieldId } = routeParams ?? {};
  if (!projectId || !fieldId) {
    return NextResponse.json({ error: "Project id and field id are required." }, { status: 400 });
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

  const field = await prisma.projectField.findFirst({ where: { id: fieldId, projectId }, select: { id: true, type: true } });
  if (!field) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  try {
    const payload = updateFieldSchema.parse(await request.json());
    const data = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.type !== undefined) data.type = payload.type;
    if (payload.options !== undefined) {
      const targetType = payload.type ?? field.type;
      data.options = targetType === ProjectFieldType.SELECT ? normalizeOptions(payload.options) : null;
    } else if (payload.type !== undefined && payload.type !== ProjectFieldType.SELECT) {
      data.options = null;
    }

    const updated = await prisma.projectField.update({ where: { id: fieldId }, data });
    return NextResponse.json({
      field: { id: updated.id, name: updated.name, type: updated.type, order: updated.order, options: updated.options ?? null },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update property." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const routeParams = await params;
  const { projectId, fieldId } = routeParams ?? {};
  if (!projectId || !fieldId) {
    return NextResponse.json({ error: "Project id and field id are required." }, { status: 400 });
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

  const field = await prisma.projectField.findFirst({ where: { id: fieldId, projectId }, select: { id: true } });
  if (!field) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  // TaskFieldValue rows cascade-delete with the field (schema onDelete: Cascade).
  await prisma.projectField.delete({ where: { id: fieldId } });
  return NextResponse.json({ success: true });
}
