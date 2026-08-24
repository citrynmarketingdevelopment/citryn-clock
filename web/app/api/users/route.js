import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  try {
    await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (typeof prisma.user?.findMany !== "function") {
    return NextResponse.json({ users: [] });
  }

  try {
    const status = request.nextUrl.searchParams.get("status") ?? "active";
    if (!new Set(["active", "archived", "all"]).has(status)) {
      return NextResponse.json({ error: "status must be active, archived, or all." }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where:
        status === "all"
          ? undefined
          : status === "archived"
            ? { archivedAt: { not: null } }
            : { archivedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        archivedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load users." }, { status: 500 });
  }
}

export async function DELETE(request) {
  let adminUser;
  try {
    adminUser = await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (
    typeof prisma.user?.delete !== "function" ||
    typeof prisma.user?.count !== "function" ||
    typeof prisma.$transaction !== "function"
  ) {
    return NextResponse.json({ error: "User model is unavailable." }, { status: 503 });
  }

  try {
    const payload = await request.json().catch(() => null);
    const userId = String(payload?.userId || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    if (userId === adminUser.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, archivedAt: true },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN, archivedAt: null },
      });
      if (!target.archivedAt && adminCount <= 1) {
        return NextResponse.json({ error: "At least one admin account must remain." }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Reassign records that use RESTRICT foreign keys so user deletion can proceed.
      if (typeof tx.task?.updateMany === "function") {
        await tx.task.updateMany({
          where: { createdById: userId },
          data: { createdById: adminUser.id },
        });
      }

      if (typeof tx.timesheetDayOverride?.updateMany === "function") {
        await tx.timesheetDayOverride.updateMany({
          where: { updatedByAdminId: userId },
          data: { updatedByAdminId: adminUser.id },
        });
      }

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2003") {
      return NextResponse.json(
        { error: "This user cannot be deleted because related records must be removed first." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Unable to delete user." }, { status: 500 });
  }
}

export async function PATCH(request) {
  let adminUser;
  try {
    adminUser = await requireAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "FORBIDDEN" ? "Forbidden." : "Unauthorized." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  if (typeof prisma.user?.update !== "function" || typeof prisma.user?.count !== "function") {
    return NextResponse.json({ error: "User model is unavailable." }, { status: 503 });
  }

  try {
    const payload = await request.json().catch(() => null);
    const userId = String(payload?.userId || "").trim();
    const role = String(payload?.role || "").trim();
    const hasRoleUpdate = Object.values(Role).includes(role);
    const hasArchiveUpdate = typeof payload?.archived === "boolean";

    if (!userId || Number(hasRoleUpdate) + Number(hasArchiveUpdate) !== 1) {
      return NextResponse.json(
        { error: "Provide a userId and exactly one valid role or archived value." },
        { status: 400 },
      );
    }

    if (userId === adminUser.id && hasArchiveUpdate && payload.archived) {
      return NextResponse.json({ error: "You cannot archive your own account." }, { status: 400 });
    }

    if (userId === adminUser.id && hasRoleUpdate && role !== Role.ADMIN) {
      return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, archivedAt: true },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (hasRoleUpdate && target.archivedAt) {
      return NextResponse.json({ error: "Restore this user before changing their role." }, { status: 400 });
    }

    const removesActiveAdmin =
      target.role === Role.ADMIN && !target.archivedAt &&
      ((hasRoleUpdate && role !== Role.ADMIN) || (hasArchiveUpdate && payload.archived));

    if (removesActiveAdmin) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN, archivedAt: null } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "At least one admin account must remain." }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: hasArchiveUpdate ? { archivedAt: payload.archived ? new Date() : null } : { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        archivedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update user." }, { status: 500 });
  }
}
