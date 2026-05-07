import { z } from "zod";
import { NextResponse } from "next/server";
import { comparePassword, getSessionCookieName, signSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  client: z.enum(["web", "mobile"]).optional().default("web"),
});

export async function POST(request) {
  try {
    const payload = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const passwordMatches = await comparePassword(payload.password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = signSessionToken({ userId: user.id, role: user.role });

    if (payload.client === "mobile") {
      return NextResponse.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Unable to login." }, { status: 400 });
  }
}
