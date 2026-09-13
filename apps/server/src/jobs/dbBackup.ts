import fs from "fs";
import path from "path";
import cron from "node-cron";
import { logger } from "../lib/logger";
import { resolveSqliteFilePath } from "../lib/paths";

/**
 * Job di Backup Automatico del Database SQLite con retention di 7 giorni.
 *
 * BUG FIX: prima il path del DB era hardcoded relativo a __dirname
 * ("../../prisma/dev.db"), ignorando completamente DATABASE_URL — in Docker/exe
 * (dove usiamo un path diverso apposta, es. "file:/data/nugis.db") avrebbe fatto
 * backup del file SBAGLIATO (o di niente). E dentro l'eseguibile pacchettizzato con
 * pkg, __dirname punta dentro uno snapshot di sola lettura: creare la cartella
 * backups lì falliva con "Cannot mkdir in a snapshot" (scoperto avviando l'exe per
 * davvero). Ora il path del DB si legge da DATABASE_URL (services/lib/paths.ts) e i
 * backup vanno in una cartella accanto al file DB vero, non a __dirname.
 */
export function scheduleDatabaseBackupJob() {
  const dbPath = resolveSqliteFilePath();
  if (!dbPath) {
    logger.warn("[db-backup] DATABASE_URL non è un file SQLite riconoscibile: backup automatico disattivato.");
    return;
  }
  const backupDir = path.join(path.dirname(dbPath), "backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Esegue un backup ogni notte alle 03:00
  cron.schedule("0 3 * * *", () => {
    try {
      if (!fs.existsSync(dbPath)) return;

      const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(backupDir, `nugis_backup_${dateStr}.db`);

      fs.copyFileSync(dbPath, backupPath);
      logger.info(`[db-backup] Backup SQLite creato con successo: ${path.basename(backupPath)}`);

      // Retention cleanup: elimina i backup più vecchi di 7 giorni
      const files = fs.readdirSync(backupDir);
      const now = Date.now();
      const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(backupDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          logger.info(`[db-backup] Eliminato backup obsoleto (>7 giorni): ${file}`);
        }
      }
    } catch (err) {
      logger.error("[db-backup] Errore durante l'esecuzione del backup database:", err);
    }
  });
}
