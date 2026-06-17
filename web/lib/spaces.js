import { prisma } from "@/lib/prisma";

// Ensures the user has at least one Space (a default "General"), and adopts any
// of their owned projects that have no space yet into the oldest space. This
// lazily backfills existing data without a separate migration script.
export async function ensureDefaultSpace(userId) {
  let space = await prisma.space.findFirst({
    where: { ownerId: userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  if (!space) {
    space = await prisma.space.create({
      data: { name: "General", icon: "🏠", order: 0, ownerId: userId },
    });
  }

  await prisma.project.updateMany({
    where: { ownerId: userId, spaceId: null },
    data: { spaceId: space.id },
  });

  return space;
}

export function spacePayload(space) {
  return {
    id: space.id,
    name: space.name,
    icon: space.icon ?? null,
    color: space.color ?? null,
    order: space.order,
  };
}
