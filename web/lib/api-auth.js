import { Role } from "@prisma/client";
import { getSessionCookieName, verifySessionToken } from "./auth";
import { prisma } from "./prisma";

export async function getRequestUser(request) {
  const bearer = request.headers.get("authorization");
  const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length).trim() : null;
  const cookieToken = request.cookies.get(getSessionCookieName())?.value;
  const token = bearerToken || cookieToken;
  if (!token) {
    return null;
  }
  const session = verifySessionToken(token);
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  return user;
}

export async function requireRequestUser(request) {
  const user = await getRequestUser(request);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin(request) {
  const user = await requireRequestUser(request);
  if (user.role !== Role.ADMIN) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
