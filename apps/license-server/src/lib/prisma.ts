// Import dal client generato LOCALMENTE (vedi "output" in prisma/schema.prisma) per
// non collidere col client di apps/server nel node_modules radice del monorepo.
import { PrismaClient } from "../generated/prisma-client";

export const prisma = new PrismaClient();
