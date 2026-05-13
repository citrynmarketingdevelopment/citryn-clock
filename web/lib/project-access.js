import { prisma } from "@/lib/prisma";

export async function canUserAccessProject(userId, projectId) {
  if (typeof prisma.project?.findFirst !== "function") {
    throw new Error("PROJECT_MODEL_UNAVAILABLE");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    select: { id: true },
  });

  return Boolean(project);
}

export async function requireProjectAccess(userId, projectId) {
  const allowed = await canUserAccessProject(userId, projectId);
  if (!allowed) {
    throw new Error("FORBIDDEN");
  }
}
