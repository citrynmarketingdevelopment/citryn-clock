import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const requiredModels = ["user", "clockEvent", "project", "projectMember", "projectColumn", "task", "taskAssignment"];

function isClientCompatible(client) {
  if (!client) return false;
  return requiredModels.every((model) => typeof client[model]?.findMany === "function");
}

function createClient() {
  return new PrismaClient({
    log: ["error"],
  });
}

let prisma = globalForPrisma.prisma;
if (!isClientCompatible(prisma)) {
  if (prisma?.$disconnect) {
    prisma.$disconnect().catch(() => undefined);
  }
  prisma = createClient();
}

export { prisma };

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
