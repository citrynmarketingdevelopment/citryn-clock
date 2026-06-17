import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultSpace, spacePayload } from "@/lib/spaces";

const createSpaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(40).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

export async function GET(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await ensureDefaultSpace(user.id);
    const spaces = await prisma.space.findMany({
      where: { ownerId: user.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ spaces: spaces.map(spacePayload) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load spaces." }, { status: 500 });
  }
}

export async function POST(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = createSpaceSchema.parse(await request.json());
    const last = await prisma.space.findFirst({
      where: { ownerId: user.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const space = await prisma.space.create({
      data: {
        name: payload.name,
        icon: payload.icon ?? null,
        color: payload.color ?? null,
        order: (last?.order ?? -1) + 1,
        ownerId: user.id,
      },
    });
    return NextResponse.json({ space: spacePayload(space) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create space." }, { status: 400 });
  }
}

export async function PATCH(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = reorderSchema.parse(await request.json());
    const orderedIds = [...new Set(payload.orderedIds)];
    const owned = await prisma.space.findMany({ where: { ownerId: user.id }, select: { id: true } });
    const ownedIds = new Set(owned.map((space) => space.id));
    if (orderedIds.some((id) => !ownedIds.has(id))) {
      return NextResponse.json({ error: "One or more spaces are not yours." }, { status: 400 });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.space.update({ where: { id }, data: { order: index } })),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to reorder spaces." }, { status: 400 });
  }
}
