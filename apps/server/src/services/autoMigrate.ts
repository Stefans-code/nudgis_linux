import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { getAppBaseDir } from "../lib/paths";
import { logger } from "../lib/logger";

/**
 * Applica le migrazioni Prisma pendenti a runtime, leggendo direttamente i file
 * migration.sql dentro ogni sottocartella di prisma/migrations. Serve per
 * l'eseguibile pacchettizzato (.exe) e
 * per l'uso standalone di "node dist/index.js": non c'è una CLI "prisma migrate
 * deploy" disponibile dentro l'exe (niente Node_modules/prisma), quindi il server se
 * le applica da solo al boot — stesso ruolo del comando nel CMD del Dockerfile, ma
 * qui è codice invece di un comando di shell.
 *
 * NB: è una reimplementazione minimale (traccia le migrazioni applicate in una
 * tabella "_prisma_migrations" compatibile con quella vera di Prisma), non usa i
 * checksum di validazione che usa la CLI ufficiale — sufficiente per applicare gli
 * script SQL in ordine una sola volta, non per gli scenari avanzati (rollback,
 * conflitti) che gestisce la CLI vera.
 */
/**
 * Estrae gli statement SQL eseguibili da un file migration.sql, rimuovendo i commenti
 * a riga singola PRIMA di dividere per ";" — funzione pura, testata separatamente
 * (era proprio qui che si nascondeva il bug: unire commenti e statement nello stesso
 * "blocco" prima di dividere per ";" causava lo scarto silenzioso di statement reali).
 */
export function parseSqlStatements(rawSql: string): string[] {
  const sqlWithoutComments = rawSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return sqlWithoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function autoMigrate(): Promise<void> {
  const migrationsDir = path.join(getAppBaseDir(), "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`[auto-migrate] Cartella migrazioni non trovata (${migrationsDir}): salto.`);
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  const applied = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedNames = new Set(applied.map((a) => a.migration_name));

  const folders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // le cartelle sono nominate con timestamp, l'ordine alfabetico = ordine cronologico

  for (const folder of folders) {
    if (appliedNames.has(folder)) continue;

    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;

    const rawSql = fs.readFileSync(sqlPath, "utf8");

    // BUG FIX: prima si divideva il file per ";" e si scartava un intero "blocco"
    // (commenti multi-riga + lo statement SQL reale che li seguiva, tutti uniti fino
    // al primo ";") se INIZIAVA con "--" — perdendo silenziosamente statement reali
    // ogni volta che una migrazione aveva un commento multi-riga prima di un ALTER
    // TABLE (es. add_creator_llm_fields). Ora rimuoviamo le righe di commento PRIMA
    // di dividere per ";", così i commenti non si "attaccano" più allo statement dopo.
    const sqlWithoutComments = rawSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    // Split ingenuo su ";": funziona per le nostre migrazioni (nessun ";" dentro
    // stringhe/valori di default), non è un parser SQL generico.
    const statements = sqlWithoutComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (err) {
        logger.error(`[auto-migrate] Statement fallito in ${folder}: ${statement.slice(0, 200)}`, err);
        throw err;
      }
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)`,
      crypto.randomUUID(),
      "applied-by-autoMigrate",
      folder,
      statements.length
    );
    logger.info(`[auto-migrate] Applicata migrazione: ${folder}`);
  }
}
