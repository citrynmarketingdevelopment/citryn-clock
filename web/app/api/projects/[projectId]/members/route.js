import { ProjectMemberRole } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const addMemberSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    role: z.nativeEnum(ProjectMemberRole).optional().default(ProjectMemberRole.MEMBER),
  })
  .refine((value) => Boolean(value.userId || value.email), {
    message: "Either userId or email is required.",
  });

async function canManageProject(projectId, userId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        {
          members: {
            some: {
              userId,
              role: ProjectMemberRole.MANAGER,
            },
          },
        },
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
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return NextResponse.json({
    members: members.map((member) => ({
      user: member.user,
      role: member.role,
      createdAt: member.createdAt,
    })),
  });
}

export async function POST(request, { params }) {
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
    const payload = addMemberSchema.parse(await request.json());
    const memberUser = await prisma.user.findFirst({
      where: payload.userId ? { id: payload.userId } : { email: payload.email?.toLowerCase() },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!memberUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const member = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: memberUser.id,
        },
      },
      update: {
        role: payload.role,
      },
      create: {
        projectId,
        userId: memberUser.id,
        role: payload.role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return NextResponse.json(
      {
        member: {
          user: member.user,
          role: member.role,
          createdAt: member.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add project member." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
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

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (project?.ownerId === userId) {
    return NextResponse.json({ error: "The project owner cannot be removed." }, { status: 400 });
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  return NextResponse.json({ success: true });
}
