import { Bot } from "grammy";
import { prisma } from "../lib/prisma";

/**
 * Coda di invio persistente su DB.
 *
 * Risolve il bug segnalato nel brief ("il bot lascia indietro e non risponde
 * a diverse chat"): invece di inviare il messaggio "a fuoco e dimentica" dentro
 * l'handler del bot, ogni messaggio in uscita viene prima scritto come riga
 * OutboundQueueItem, e un worker separato lo processa con retry/backoff.
 * Se il processo si riavvia o un invio fallisce, il messaggio resta in coda
 * invece di sparire silenziosamente.
 *
 * Il rate limiting rispetta i limiti UFFICIALI documentati della Bot API di
 * Telegram (non un tentativo di scoprire "quanto si può spammare senza essere
 * beccati"): max ~1 messaggio/secondo per singola chat, max ~30 messaggi/secondo
 * complessivi per bot. https://core.telegram.org/bots/faq#my-bot-is-hitting-limits
 */
const GLOBAL_MAX_PER_SECOND = 25; // margine di sicurezza sotto il limite ufficiale di 30/s
const PER_CHAT_MIN_INTERVAL_MS = 1100; // margine sopra il limite ufficiale di 1/s per chat
const MAX_ATTEMPTS = 5;

const lastSentPerChat = new Map<string, number>();
let tokens = GLOBAL_MAX_PER_SECOND;
setInterval(() => {
  tokens = GLOBAL_MAX_PER_SECOND;
}, 1000);

export async function enqueueOutbound(fanId: string, text: string, mediaUrl?: string) {
  return prisma.outboundQueueItem.create({
    data: { fanId, text, mediaUrl },
  });
}

export function startOutboundWorker(bot: Bot, intervalMs = 300) {
  setInterval(async () => {
    if (tokens <= 0) return;

    const item = await prisma.outboundQueueItem.findFirst({
      where: { status: "pending", scheduledAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
    });
    if (!item) return;

    const fan = await prisma.fan.findUnique({ where: { id: item.fanId } });
    if (!fan) {
      await prisma.outboundQueueItem.update({
        where: { id: item.id },
        data: { status: "dead_letter", lastError: "fan non trovato" },
      });
      return;
    }

    const lastSent = lastSentPerChat.get(fan.telegramChatId) ?? 0;
    if (Date.now() - lastSent < PER_CHAT_MIN_INTERVAL_MS) return; // riprovo al prossimo tick

    await prisma.outboundQueueItem.update({
      where: { id: item.id },
      data: { status: "processing" },
    });
    tokens -= 1;

    try {
      if (item.mediaUrl) {
        await bot.api.sendPhoto(fan.telegramChatId, item.mediaUrl, { caption: item.text });
      } else {
        await bot.api.sendMessage(fan.telegramChatId, item.text);
      }
      lastSentPerChat.set(fan.telegramChatId, Date.now());

      await prisma.outboundQueueItem.update({
        where: { id: item.id },
        data: { status: "sent" },
      });
      await prisma.message.create({
        data: { fanId: fan.id, direction: "out", text: item.text, status: "sent" },
      });
    } catch (err: any) {
      const attempts = item.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      // backoff esponenziale: 5s, 25s, 125s, ...
      const backoffMs = Math.min(15 * 60 * 1000, 5000 * Math.pow(5, attempts - 1));

      await prisma.outboundQueueItem.update({
        where: { id: item.id },
        data: {
          status: failed ? "dead_letter" : "pending",
          attempts,
          lastError: String(err?.message ?? err),
          scheduledAt: new Date(Date.now() + backoffMs),
        },
      });
    }
  }, intervalMs);
}
