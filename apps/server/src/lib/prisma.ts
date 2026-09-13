// Import dal client generato LOCALMENTE (vedi "output" in prisma/schema.prisma), non
// dal pacchetto "@prisma/client" condiviso nel node_modules radice del monorepo — che
// altrimenti verrebbe sovrascritto da qualunque altra app del workspace (es.
// apps/license-server) che generi il proprio client Prisma con uno schema diverso.
import { PrismaClient } from "../generated/prisma-client";

export const prisma = new PrismaClient();
