import { Role } from "@prisma/client";
import { z, ZodError } from "zod";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(Role).optional().default(Role.EMPLOYEE),
});

export async function POST(request) {
  try {
    await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  try {
    const payload = createUserSchema.parse(await request.json());
    const existing = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(payload.password);
    const user = await prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        name: payload.name.trim(),
        passwordHash,
        role: payload.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.errors[0];
      const field = first?.path?.join(".") ?? "field";
      return NextResponse.json({ error: `${field}: ${first?.message ?? "Invalid value."}` }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create user." }, { status: 400 });
  }
}
