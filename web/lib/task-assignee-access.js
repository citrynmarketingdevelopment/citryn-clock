import { ProjectMemberRole } from "@prisma/client";

export async function ensureProjectAssigneeAccess(tx, projectId, userIds) {
  const requestedIds = [...new Set((userIds ?? []).filter(Boolean))];
  if (requestedIds.length === 0) {
    return [];
  }

  const [users, project, members] = await Promise.all([
    tx.user.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true },
    }),
    tx.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    }),
    tx.projectMember.findMany({
      where: {
        projectId,
        userId: { in: requestedIds },
      },
      select: { userId: true },
    }),
  ]);

  if (!project) {
    throw new Error("INVALID_PROJECT");
  }

  const foundIds = new Set(users.map((user) => user.id));
  if (foundIds.size !== requestedIds.length) {
    throw new Error("INVALID_ASSIGNEE");
  }

  const memberIds = new Set(members.map((member) => member.userId));
  const missingIds = requestedIds.filter((userId) => userId !== project.ownerId && !memberIds.has(userId));

  if (missingIds.length > 0) {
    await tx.projectMember.createMany({
      data: missingIds.map((userId) => ({
        projectId,
        userId,
        role: ProjectMemberRole.MEMBER,
      })),
      skipDuplicates: true,
    });
  }

  return requestedIds;
}
