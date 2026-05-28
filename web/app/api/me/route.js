import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/api-auth";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
});

export async function GET(request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

export async function PATCH(request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (typeof prisma.user?.update !== "function") {
    return NextResponse.json({ error: "User model is unavailable." }, { status: 503 });
  }

  try {
    const payload = updateProfileSchema.parse(await request.json());
    const nextEmail = payload.email.trim().toLowerCase();
    const nextName = payload.name.trim();
    const nextPassword = payload.password?.trim();

    const updateData = {};

    if (nextName !== user.name) {
      updateData.name = nextName;
    }

    if (nextEmail !== user.email) {
      const existing = await prisma.user.findUnique({
        where: { email: nextEmail },
        select: { id: true },
      });
      if (existing && existing.id !== user.id) {
        return NextResponse.json({ error: "Email already exists." }, { status: 409 });
      }
      updateData.email = nextEmail;
    }

    if (nextPassword) {
      updateData.passwordHash = await hashPassword(nextPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update profile." }, { status: 400 });
  }
}
