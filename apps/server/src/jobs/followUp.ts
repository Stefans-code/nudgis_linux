import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { enqueueOutbound } from "../services/outboundQueue";

/**
 * Follow-up giornaliero (brief pagina 2): ricontatta le chat con attività
 * OGGI ma non ancora ricontattate, mai quelle di ieri o precedenti — esattamente
 * come richiesto nel brief ("quelle del giorno prima no").
 *
 * Attivabile/disattivabile per creator da pannello admin (FollowUpRule.isEnabled).
 * Gira ogni ora; ogni chat viene toccata al massimo una volta per giorno.
 *
 * Regole anti-ban applicate (ricerca sui limiti di automazione Telegram, vedi
 * docs/telegram-automation-limits.md): Telegram non pubblica soglie ufficiali di
 * spam/ban per i bot, ma dati di community indicano che pochi report (5-7 in 24h)
 * possono far limitare/bannare l'account, e che mandare testo IDENTICO a molti
 * utenti nella stessa finestra temporale è uno dei pattern riconosciuti dai filtri
 * anti-spam. Applichiamo quindi: tetto giornaliero configurabile per creator
 * (default 40, in linea con la soglia prudenziale emersa dalla ricerca), rotazione
 * fra più varianti testuali, jitter casuale fra un invio e l'altro, e rispetto
 * dell'opt-out esplicito del fan.
 */
export function scheduleFollowUpJob() {
  cron.schedule("0 * * * *", async () => {
    const rules = await prisma.followUpRule.findMany({ where: { isEnabled: true } });

    for (const rule of rules) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const cutoff = new Date(Date.now() - rule.minHoursSinceLastMessage * 60 * 60 * 1000);

      // Quanti follow-up sono già stati mandati oggi per questo creator: il tetto
      // giornaliero (maxPerDay) vale per l'intero creator, non per singolo batch orario.
      const alreadySentToday = await prisma.fan.count({
        where: { creatorId: rule.creatorId, lastContactedByFollowUp: { gte: startOfToday } },
      });
      const remainingBudget = rule.maxPerDay - alreadySentToday;
      if (remainingBudget <= 0) continue;

      const fans = await prisma.fan.findMany({
        where: {
          creatorId: rule.creatorId,
          lastMessageAt: { gte: startOfToday, lte: cutoff }, // solo attività di oggi (Slide 2 Brief)
          followUpOptOut: false, // rispetta chi ha chiesto di non essere ricontattato
          OR: [
            { lastContactedByFollowUp: null },
            { lastContactedByFollowUp: { lt: startOfToday } },
          ],
        },
        take: Math.min(15, remainingBudget), // batch orario limitato dal budget giornaliero residuo
      });

      const templateVariants = [rule.template, rule.templateVariant2, rule.templateVariant3].filter(
        (t): t is string => !!t && t.trim().length > 0
      );

      for (const fan of fans) {
        // Jitter causale anti-spam: ritardo di 15-45s tra invii per simulare comportamento umano
        const randomJitterMs = Math.floor(Math.random() * (45000 - 15000 + 1)) + 15000;
        await new Promise((resolve) => setTimeout(resolve, randomJitterMs));

        // Rotazione fra le varianti testuali disponibili: evita di mandare lo stesso
        // testo identico a tutti, uno dei pattern che fa scattare i filtri anti-spam.
        const text = templateVariants[Math.floor(Math.random() * templateVariants.length)];

        await enqueueOutbound(fan.id, text);
        await prisma.fan.update({
          where: { id: fan.id },
          data: { lastContactedByFollowUp: new Date() },
        });
      }

      if (fans.length) {
        console.log(`[follow-up] creator=${rule.creatorId} contattati=${fans.length} (budget residuo oggi: ${remainingBudget - fans.length}/${rule.maxPerDay})`);
      }
    }
  });
}
