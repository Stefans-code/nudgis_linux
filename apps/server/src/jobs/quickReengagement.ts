import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { enqueueOutbound } from "../services/outboundQueue";
import { logger } from "../lib/logger";

/**
 * Nudge "rapido", separato dal follow-up giornaliero (jobs/followUp.ts): visto nello
 * screenshot reale del prodotto di riferimento — "Runs every 5 minutes on chat with
 * last assistant msg between 5 and 10 minutes old". A differenza del follow-up
 * giornaliero (una volta al giorno, su chat ferme da ore), questo tocca il fan pochi
 * minuti dopo che il BOT ha scritto per ultimo senza ricevere risposta: un "ci sei
 * ancora?" quasi in tempo reale.
 *
 * Disattivato di default per creator (FollowUpRule.quickReengagementEnabled): è più
 * aggressivo del follow-up giornaliero, va attivato consapevolmente — vedi
 * docs/telegram-automation-limits.md per i rischi di un contatto troppo frequente.
 */
export function scheduleQuickReengagementJob() {
  cron.schedule("*/5 * * * *", async () => {
    const rules = await prisma.followUpRule.findMany({ where: { quickReengagementEnabled: true } });

    for (const rule of rules) {
      const now = Date.now();
      const windowStart = new Date(now - rule.quickReengagementMaxMinutes * 60 * 1000);
      const windowEnd = new Date(now - rule.quickReengagementMinMinutes * 60 * 1000);

      // Limitiamo la scansione ai fan con attività nelle ultime 24h: chat più vecchie
      // di così non possono avere un ultimo messaggio del bot "5-10 minuti fa".
      const candidates = await prisma.fan.findMany({
        where: {
          creatorId: rule.creatorId,
          followUpOptOut: false,
          lastMessageAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });

      let sent = 0;
      for (const { id: fanId } of candidates) {
        const lastMessage = await prisma.message.findFirst({
          where: { fanId },
          orderBy: { createdAt: "desc" },
        });
        if (!lastMessage || lastMessage.direction !== "out") continue;
        if (lastMessage.createdAt < windowStart || lastMessage.createdAt > windowEnd) continue;

        const fan = await prisma.fan.findUnique({ where: { id: fanId }, select: { lastQuickReengagementAt: true } });
        // Evita di rimandare più volte il nudge per lo stesso silenzio: solo se non ne
        // è già stato mandato uno DOPO l'ultimo messaggio del bot.
        if (fan?.lastQuickReengagementAt && fan.lastQuickReengagementAt > lastMessage.createdAt) continue;

        await enqueueOutbound(fanId, rule.quickReengagementTemplate);
        await prisma.fan.update({ where: { id: fanId }, data: { lastQuickReengagementAt: new Date() } });
        sent++;
      }

      if (sent) {
        logger.info(`[quick-reengagement] creator=${rule.creatorId} nudge inviati=${sent}`);
      }
    }
  });
}
