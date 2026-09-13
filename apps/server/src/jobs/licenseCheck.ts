import cron from "node-cron";
import { checkLicense } from "../services/licensing";
import { logger } from "../lib/logger";

/**
 * Verifica periodica della licenza (phone-home). No-op se LICENSE_SERVER_URL/
 * LICENSE_KEY non sono configurati (vedi services/licensing.ts).
 */
export function scheduleLicenseCheckJob() {
  cron.schedule("0 */6 * * *", () => {
    checkLicense().catch((err) => logger.error("[license-check] Errore imprevisto:", err));
  });
}
