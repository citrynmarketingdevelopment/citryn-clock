import { ProjectMemberRole } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
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

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const { projectId, columnId } = routeParams ?? {};
  if (!projectId || !columnId) {
    return NextResponse.json({ error: "Project id and column id are required." }, { status: 400 });
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

  const column = await prisma.projectColumn.findFirst({
    where: { id: columnId, projectId },
    select: { id: true },
  });
  if (!column) {
    return NextResponse.json({ error: "Column not found." }, { status: 404 });
  }

  try {
    const payload = renameSchema.parse(await request.json());
    const updated = await prisma.projectColumn.update({
      where: { id: columnId },
      data: { name: payload.name },
    });
    return NextResponse.json({ column: { id: updated.id, name: updated.name, order: updated.order } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to rename column." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const routeParams = await params;
  const { projectId, columnId } = routeParams ?? {};
  if (!projectId || !columnId) {
    return NextResponse.json({ error: "Project id and column id are required." }, { status: 400 });
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

  const column = await prisma.projectColumn.findFirst({
    where: { id: columnId, projectId },
    select: { id: true },
  });
  if (!column) {
    return NextResponse.json({ error: "Column not found." }, { status: 404 });
  }

  // Tasks in this column fall back to columnId = null (schema onDelete: SetNull).
  await prisma.projectColumn.delete({ where: { id: columnId } });

  return NextResponse.json({ success: true });
}
