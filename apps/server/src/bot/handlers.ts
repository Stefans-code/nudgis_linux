import { Bot, Context } from "grammy";
import { prisma } from "../lib/prisma";
import { getLlmProviderForCreator } from "../services/llm";
import { computeTypingDelayMs, sleep } from "../services/typingDelay";
import { enqueueOutbound } from "../services/outboundQueue";
import { recordPaymentClaimIfNeeded, looksLikeExternalPaymentClaim } from "../services/paymentClaims";
import { recordFollowUpOptOutIfNeeded, looksLikeFollowUpOptOut } from "../services/followUpOptOut";
import { startTypingIndicator } from "../services/typingIndicator";
import { logger } from "../lib/logger";

const MAX_MESSAGES_PER_FAN = 200;

async function getOrCreateFan(creatorId: string, chatId: string, displayName?: string) {
  return prisma.fan.upsert({
    where: { creatorId_telegramChatId: { creatorId, telegramChatId: chatId } },
    update: { displayName, lastMessageAt: new Date() },
    create: { creatorId, telegramChatId: chatId, displayName, lastMessageAt: new Date() },
  });
}

import { evaluateSexchatStateMachine } from "../services/sexchatStateMachine";
import { sanitizeLlmOutput } from "../services/outputGuardrail";
import { extractHeatTag, heatTagToScore } from "../services/heatTag";
import { blendHeatScore } from "../services/sexchatHeat";
import { buildShortcutsInstruction, expandShortcuts } from "../services/shortcuts";

export function registerHandlers(bot: Bot, creatorId: string) {
  // Gestione messaggi di testo
  bot.on("message:text", async (ctx: Context) => {
    const chatId = String(ctx.chat!.id);
    const text = ctx.message?.text ?? "";
    const fan = await getOrCreateFan(creatorId, chatId, ctx.from?.first_name);

    if (fan.maxMessagesUsed >= MAX_MESSAGES_PER_FAN) {
      return;
    }

    // Mostra "sta scrivendo..." SUBITO, non solo dopo che la risposta è pronta:
    // riduce l'attesa percepita (brief: velocità + tempo di risposta realistico).
    const stopTyping = startTypingIndicator(ctx);

    await prisma.message.create({ data: { fanId: fan.id, direction: "in", text } });
    await prisma.fan.update({
      where: { id: fan.id },
      data: { maxMessagesUsed: { increment: 1 } },
    });

    // Rilevamento immediato via parole chiave (garantito anche se la generazione LLM
    // dovesse fallire più sotto). Il LLM affina questi due segnali dopo la generazione
    // (vedi extractHeatTag) — chiamato di nuovo SOLO se le parole chiave non li avevano
    // già presi, per non creare doppioni.
    const keywordCaughtPaymentClaim = looksLikeExternalPaymentClaim(text);
    const keywordCaughtOptOut = looksLikeFollowUpOptOut(text);
    await recordPaymentClaimIfNeeded(fan.id, text);
    await recordFollowUpOptOutIfNeeded(fan.id, text);

    const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
    const instructions = await prisma.extraInstruction.findMany({
      where: { creatorId, isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
    const shortcuts = await prisma.creatorShortcut.findMany({ where: { creatorId } });

    try {
      // Esegue la Macchina a Stati della Sexchat (Fase 1/2/3/4)
      const sexchatState = await evaluateSexchatStateMachine(fan.id, fan.maxMessagesUsed + 1, text);

      const history = await prisma.message.findMany({
        where: { fanId: fan.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // Risolve il provider LLM specifico per questo creator (Ollama / DeepSeek / Claude / OpenAI)
      const llm = getLlmProviderForCreator(creator);
      const rawReply = await llm.generateReply({
        creatorId: creator.id,
        personaPrompt: creator.personaPrompt,
        standardInstructions: [
          ...instructions.filter((i) => i.isStandard).map((i) => i.content),
          sexchatState.instructionPrompt,
          buildShortcutsInstruction(shortcuts),
        ].filter(Boolean),
        customInstructions: instructions.filter((i) => !i.isStandard).map((i) => i.content),
        history: history
          .reverse()
          .slice(0, -1)
          .map((m) => ({ role: m.direction === "in" ? ("user" as const) : ("assistant" as const), content: m.text })),
        incomingMessage: text,
      });

      // Estrae i tag di valutazione (heatTag.ts) PRIMA della sanificazione: sono
      // valutazioni semantiche reali del LLM su interesse/pagamento/opt-out (gestiscono
      // sarcasmo, ironia, frasi indirette — cosa che il pattern-matching a parole chiave
      // da solo non può fare), da non mostrare mai al fan.
      const { cleanedText, llmHeatSignal, llmPaymentClaimSignal, llmOptOutSignal } = extractHeatTag(rawReply);

      // Sanificazione Output & Guardrail Anti-Injection (Punto 1 Audit)
      const reply = sanitizeLlmOutput(cleanedText, creator.name);

      // Affina la memoria persistita dell'interesse del fan (Fan.heatScore) con la
      // valutazione semantica del LLM su QUESTO turno, invece di lasciarla solo alla
      // lettura a parole chiave fatta prima di generare la risposta.
      if (llmHeatSignal) {
        const refinedScore = blendHeatScore(sexchatState.heat.score, heatTagToScore(llmHeatSignal));
        await prisma.fan.update({ where: { id: fan.id }, data: { heatScore: refinedScore } });
      }

      // Se le parole chiave non avevano già intercettato pagamento esterno / opt-out,
      // ma il LLM sì (frase indiretta o non standard), li registra ora.
      if (!keywordCaughtPaymentClaim && llmPaymentClaimSignal === "yes") {
        await recordPaymentClaimIfNeeded(fan.id, text, true);
      }
      if (!keywordCaughtOptOut && llmOptOutSignal === "yes") {
        await recordFollowUpOptOutIfNeeded(fan.id, text, true);
      }

      // Riconosce eventuali comandi rapidi (es. "/listino") che il LLM ha inserito nella
      // risposta e li espande nel testo completo salvato — mandato come messaggio
      // SEPARATO, senza ritardo di digitazione (è testo precompilato, non "scritto lì
      // per lì" dal personaggio).
      const { mainText, expansions } = expandShortcuts(reply, shortcuts);

      if (mainText) {
        const delayMs = computeTypingDelayMs(mainText);
        await sleep(Math.min(delayMs, 3000));
        await enqueueOutbound(fan.id, mainText);
      }
      for (const expansion of expansions) {
        await enqueueOutbound(fan.id, expansion);
      }
    } finally {
      // Ferma sempre l'indicatore "sta scrivendo", anche se la generazione fallisce:
      // altrimenti resterebbe un interval attivo all'infinito (memory/leak di chiamate API).
      stopTyping();
    }
  });

  // Gestione media / foto / nota vocale inviati dai fan su Telegram
  bot.on(["message:photo", "message:video", "message:voice", "message:sticker"], async (ctx: Context) => {
    const chatId = String(ctx.chat!.id);
    const fan = await getOrCreateFan(creatorId, chatId, ctx.from?.first_name);
    const mediaDescription = ctx.message?.photo ? "[Ha inviato una foto]" : 
                             ctx.message?.video ? "[Ha inviato un video]" : 
                             ctx.message?.voice ? "[Ha inviato una nota vocale]" : "[Ha inviato uno sticker]";

    await prisma.message.create({ data: { fanId: fan.id, direction: "in", text: mediaDescription } });

    const stopTyping = startTypingIndicator(ctx);
    try {
      const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
      const llm = getLlmProviderForCreator(creator);

      const reply = await llm.generateReply({
        creatorId: creator.id,
        personaPrompt: creator.personaPrompt,
        standardInstructions: [],
        customInstructions: [],
        history: [],
        incomingMessage: `L'utente ti ha appena inviato questo contenuto: ${mediaDescription}. Rispondi in modo provocante ed entusiasta!`,
      });

      await enqueueOutbound(fan.id, reply);
    } finally {
      stopTyping();
    }
  });

  bot.command("send_content", async (ctx) => {
    await ctx.reply("Comando riservato al pannello admin.");
  });
}

export async function sendContentItemToFan(fanId: string, contentItemId: string) {
  const item = await prisma.contentItem.findUniqueOrThrow({ where: { id: contentItemId } });
  const caption = `${item.title}\n\n${item.description}\n\nPrezzo: ${(item.priceCents / 100).toFixed(2)} ${item.currency}`;
  await enqueueOutbound(fanId, caption, item.mediaUrl ?? undefined);
}
