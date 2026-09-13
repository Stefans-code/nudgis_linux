import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Crea l'admin iniziale da ADMIN_DEFAULT_EMAIL/ADMIN_DEFAULT_PASSWORD se non esiste
 * ancora nessun utente admin. Chiamata sia da prisma/seed.ts (flusso di sviluppo
 * normale, "npx prisma db seed") sia automaticamente all'avvio del server
 * (index.ts) — quest'ultimo è ciò che permette all'eseguibile pacchettizzato (.exe)
 * di funzionare senza bisogno di "tsx" per lanciare il seed, che nell'exe non esiste.
 */
export async function bootstrapAdminIfNeeded(): Promise<void> {
  const email = process.env.ADMIN_DEFAULT_EMAIL;
  const password = process.env.ADMIN_DEFAULT_PASSWORD;

  if (!email || !password) {
    logger.warn("[bootstrap-admin] ADMIN_DEFAULT_EMAIL/ADMIN_DEFAULT_PASSWORD non impostati: nessun admin creato automaticamente.");
    return;
  }

  const anyAdminExists = (await prisma.adminUser.count()) > 0;
  if (anyAdminExists) return; // non tocca nulla se esiste già almeno un admin

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.create({ data: { email, passwordHash, role: "owner" } });
  logger.info(`[bootstrap-admin] Primo admin (owner) creato: ${email}`);
}
