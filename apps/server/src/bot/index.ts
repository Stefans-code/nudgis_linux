import { Bot } from "grammy";
import { prisma } from "../lib/prisma";
import { registerHandlers } from "./handlers";
import { startOutboundWorker } from "../services/outboundQueue";
import { decryptCredential } from "../services/crypto";
import { isLicenseUsable } from "../services/licensing";
import { logger } from "../lib/logger";

const runningBots = new Map<string, Bot>();

/**
 * Avvia un'istanza bot per ogni creator attivo che ha un token configurato.
 * Nota sul bug "il bot lascia indietro chat quando gestisce troppi utilizzatori
 * insieme": la soluzione scelta qui è quella suggerita dal founder nel brief,
 * opzione 2 — un processo bot separato per creator, così i limiti di uno non
 * influenzano gli altri, invece di un solo bot condiviso da tutti.
 */
export async function startAllBots() {
  // Licenza commerciale (phone-home, vedi services/licensing.ts): no-op se non
  // configurata (installazione interna/di sviluppo, non venduta a un cliente).
  const license = await isLicenseUsable();
  if (!license.usable) {
    logger.warn(`[bot] Nessun bot avviato: licenza non valida (${license.reason})`);
    return;
  }

  const creators = await prisma.creator.findMany({
    where: { isActive: true, telegramBotToken: { not: null } },
  });

  for (const creator of creators) {
    if (!creator.telegramBotToken) continue;
    if (runningBots.has(creator.id)) continue;

    // Attestazione di responsabilità obbligatoria (età fan, ToS provider LLM, GDPR):
    // il bot non parte finché un admin non l'ha confermata dal pannello. Non è un
    // controllo di sicurezza automatico sui contenuti — è un blocco reale che impedisce
    // di dimenticarsene, con un record verificabile di chi/quando l'ha attivato.
    if (!creator.complianceAcknowledgedAt) {
      logger.warn(
        `[bot:${creator.name}] NON avviato: attestazione di responsabilità mancante (tab Persona & AI Settings del pannello)`
      );
      continue;
    }

    const rawToken = decryptCredential(creator.telegramBotToken);
    if (!rawToken) continue;

    const bot = new Bot(rawToken);
    registerHandlers(bot, creator.id);
    startOutboundWorker(bot);

    bot.catch((err) => {
      logger.error(`[bot:${creator.name}] errore non gestito:`, err);
    });

    bot.start({ drop_pending_updates: false });
    runningBots.set(creator.id, bot);
    logger.info(`[bot:${creator.name}] avviato con successo`);
  }
}

export function getRunningBot(creatorId: string): Bot | undefined {
  return runningBots.get(creatorId);
}
