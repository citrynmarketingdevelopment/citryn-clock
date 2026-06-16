import { ProjectMemberRole } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "At least one field is required.",
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

export async function GET(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
    await requireProjectAccess(user.id, projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_MODEL_UNAVAILABLE") {
      return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (typeof prisma.project?.findUnique !== "function") {
    return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        columns: {
          orderBy: { order: "asc" },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        fields: {
          orderBy: { order: "asc" },
        },
        tasks: {
          include: {
            assignments: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
            attachments: {
              orderBy: [{ createdAt: "asc" }],
            },
            fieldValues: {
              select: { fieldId: true, value: true },
            },
          },
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        owner: project.owner,
        columns: project.columns,
        members: project.members.map((member) => ({
          user: member.user,
          role: member.role,
        })),
        fields: project.fields.map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          order: field.order,
          options: field.options ?? null,
        })),
        tasks: project.tasks.map((task) => ({
          id: task.id,
          projectId: task.projectId,
          columnId: task.columnId,
          title: task.title,
          description: task.description,
          laborMinutes: task.laborMinutes,
          priority: task.priority,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
          createdById: task.createdById,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          assignees: task.assignments.map((assignment) => assignment.user),
          attachments: task.attachments.map((attachment) => ({
            id: attachment.id,
            type: attachment.type,
            url: attachment.url,
            label: attachment.label,
            createdById: attachment.createdById,
            createdAt: attachment.createdAt,
          })),
          fieldValues: task.fieldValues.map((value) => ({
            fieldId: value.fieldId,
            value: value.value,
          })),
        })),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load project." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const projectId = routeParams?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
    await requireProjectAccess(user.id, projectId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const canManage = await canManageProject(projectId, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = updateProjectSchema.parse(await request.json());
    const data = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.description !== undefined) {
      data.description = payload.description ? payload.description.trim() : null;
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data,
      select: { id: true, name: true, description: true, updatedAt: true },
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update project." }, { status: 400 });
  }
}
