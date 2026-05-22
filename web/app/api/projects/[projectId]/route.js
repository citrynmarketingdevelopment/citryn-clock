import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

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
        })),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load project." }, { status: 500 });
  }
}
