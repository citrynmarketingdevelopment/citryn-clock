import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { spacePayload } from "@/lib/spaces";

const updateSpaceSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    icon: z.string().trim().max(40).nullable().optional(),
    color: z.string().trim().max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });

async function ownedSpace(spaceId, userId) {
  return prisma.space.findFirst({ where: { id: spaceId, ownerId: userId }, select: { id: true } });
}

export async function PATCH(request, { params }) {
  const routeParams = await params;
  const spaceId = routeParams?.spaceId;
  if (!spaceId) {
    return NextResponse.json({ error: "Space id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await ownedSpace(spaceId, user.id))) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  try {
    const payload = updateSpaceSchema.parse(await request.json());
    const data = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.icon !== undefined) data.icon = payload.icon;
    if (payload.color !== undefined) data.color = payload.color;
    const space = await prisma.space.update({ where: { id: spaceId }, data });
    return NextResponse.json({ space: spacePayload(space) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update space." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const routeParams = await params;
  const spaceId = routeParams?.spaceId;
  if (!spaceId) {
    return NextResponse.json({ error: "Space id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await ownedSpace(spaceId, user.id))) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const spaceCount = await prisma.space.count({ where: { ownerId: user.id } });
  if (spaceCount <= 1) {
    return NextResponse.json({ error: "You must keep at least one space." }, { status: 400 });
  }

  // Move this space's projects to the user's next remaining space (don't delete projects).
  const fallback = await prisma.space.findFirst({
    where: { ownerId: user.id, id: { not: spaceId } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.project.updateMany({ where: { spaceId }, data: { spaceId: fallback?.id ?? null } }),
    prisma.space.delete({ where: { id: spaceId } }),
  ]);

  return NextResponse.json({ success: true, reassignedTo: fallback?.id ?? null });
}
