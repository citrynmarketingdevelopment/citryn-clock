import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// Global search across projects + task titles the current user can access.
export async function GET(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ projects: [], tasks: [] });
  }

  const access = [{ ownerId: user.id }, { members: { some: { userId: user.id } } }];

  try {
    const [projects, tasks] = await Promise.all([
      prisma.project.findMany({
        where: { AND: [{ OR: access }, { name: { contains: q, mode: "insensitive" } }] },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.task.findMany({
        where: {
          title: { contains: q, mode: "insensitive" },
          project: { OR: access },
        },
        select: { id: true, title: true, projectId: true, project: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
    ]);

    return NextResponse.json({
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: task.project?.name ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed." }, { status: 500 });
  }
}
