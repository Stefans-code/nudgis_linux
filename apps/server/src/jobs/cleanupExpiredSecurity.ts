import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Pulizia periodica di RevokedToken e LoginAttempt scaduti (limite noto segnalato nel
 * README: erano persistiti su DB ma senza mai essere ripuliti, crescendo indefinitamente).
 * - RevokedToken: il JWT ha durata massima 12h (vedi routes/auth.ts), quindi una riga più
 *   vecchia di 12h è per un token comunque già scaduto da solo: la riga non serve più.
 * - LoginAttempt: il lockout dura 15 minuti; una riga non aggiornata da 24h non ha più
 *   nessun lockout attivo.
 */
const REVOKED_TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function scheduleSecurityCleanupJob() {
  // Ogni notte alle 03:30, sfalsato rispetto al backup DB (03:00) per non sovrapporsi.
  cron.schedule("30 3 * * *", async () => {
    try {
      const revokedCutoff = new Date(Date.now() - REVOKED_TOKEN_MAX_AGE_MS);
      const loginCutoff = new Date(Date.now() - LOGIN_ATTEMPT_MAX_AGE_MS);

      const [revokedResult, loginResult] = await Promise.all([
        prisma.revokedToken.deleteMany({ where: { revokedAt: { lt: revokedCutoff } } }),
        prisma.loginAttempt.deleteMany({ where: { updatedAt: { lt: loginCutoff } } }),
      ]);

      logger.info(
        `[security-cleanup] Rimossi ${revokedResult.count} token revocati scaduti e ${loginResult.count} record di rate-limit login obsoleti`
      );
    } catch (err) {
      logger.error("[security-cleanup] Errore durante la pulizia:", err);
    }
  });
}
