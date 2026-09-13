import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { bootstrapAdminIfNeeded } from "../src/services/bootstrapAdmin";

// Wrapper sottile: la logica vera è in services/bootstrapAdmin.ts, condivisa con
// l'avvio automatico del server (index.ts) — così anche l'eseguibile pacchettizzato
// (.exe, dove "tsx" per lanciare questo script non esiste) crea l'admin iniziale da solo.
bootstrapAdminIfNeeded()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
