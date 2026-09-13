import { prisma } from "../lib/prisma";
import { LlmProvider } from "./llm/types";

/**
 * "AI Training Draft" (visto nello screenshot reale del prodotto di riferimento):
 * analizza fino a 900 coppie di messaggi reali già scambiati con i fan ("fase 0") e
 * genera una BOZZA di istruzioni extra e shortcut, da rivedere e salvare manualmente
 * dal pannello — non viene mai salvata automaticamente.
 *
 * Nota sui limiti di contesto: 900 coppie di messaggi possono superare la finestra di
 * contesto di molti modelli (specialmente locali via Ollama). Qui campioniamo al
 * massimo MAX_PAIRS_IN_PROMPT coppie più recenti per restare in un prompt ragionevole,
 * pur avendo raccolto fino a 900 dal DB come richiesto.
 */
const MAX_PAIRS_FROM_DB = 900;
const MAX_PAIRS_IN_PROMPT = 150; // campione recente, per non eccedere il contesto del modello

export interface AiTrainingDraftResult {
  suggestedInstructions: string;
  suggestedShortcuts: { command: string; content: string }[];
  pairsAnalyzed: number;
  pairsAvailable: number;
}

const DRAFT_PROMPT_HEADER = `Analizza questa trascrizione di conversazioni reali tra un'assistente (ruolo "assistant") e dei fan (ruolo "user") su Telegram, per vendita di contenuti.

Il tuo compito è produrre DUE cose in output, in questo formato ESATTO (non aggiungere altro testo prima o dopo):

===ISTRUZIONI===
(qui un elenco puntato di istruzioni operative ricorrenti che sembrano seguite nelle risposte "assistant" — tono, timing, come gestisce prezzi/richieste/obiezioni. Scrivi in italiano, concreto e specifico, come regole da dare a un altro assistente AI.)

===SHORTCUT===
(qui, se noti che l'assistente ripete spesso blocchi di testo lunghi e identici — es. un listino prezzi, una descrizione standard — elenca ogni blocco così, uno per riga: comando|testo completo. Es: /listino|Videochiamata 5 min: 30€... Se non ne trovi nessuno, scrivi "nessuno".)

Conversazioni:
`;

function parseDraftResponse(raw: string): { suggestedInstructions: string; suggestedShortcuts: { command: string; content: string }[] } {
  const instructionsMatch = raw.match(/===ISTRUZIONI===([\s\S]*?)(===SHORTCUT===|$)/i);
  const shortcutsMatch = raw.match(/===SHORTCUT===([\s\S]*)$/i);

  const suggestedInstructions = (instructionsMatch?.[1] ?? raw).trim();
  const shortcutsBlock = (shortcutsMatch?.[1] ?? "").trim();

  const suggestedShortcuts: { command: string; content: string }[] = [];
  if (shortcutsBlock && !/^nessuno$/i.test(shortcutsBlock)) {
    for (const line of shortcutsBlock.split("\n")) {
      const [command, ...rest] = line.split("|");
      const content = rest.join("|").trim();
      if (command?.trim().startsWith("/") && content) {
        suggestedShortcuts.push({ command: command.trim(), content });
      }
    }
  }

  return { suggestedInstructions, suggestedShortcuts };
}

export async function generateAiTrainingDraft(creatorId: string, llm: LlmProvider): Promise<AiTrainingDraftResult> {
  const fans = await prisma.fan.findMany({ where: { creatorId }, select: { id: true } });
  const fanIds = fans.map((f) => f.id);

  const messages = await prisma.message.findMany({
    where: { fanId: { in: fanIds } },
    orderBy: { createdAt: "desc" },
    take: MAX_PAIRS_FROM_DB * 2, // in+out insieme, approssimazione delle "coppie"
  });

  const pairsAvailable = Math.floor(messages.length / 2);

  const sample = messages.slice(0, MAX_PAIRS_IN_PROMPT * 2).reverse();
  const transcript = sample.map((m) => `${m.direction === "in" ? "user" : "assistant"}: ${m.text}`).join("\n");

  if (!transcript.trim()) {
    return { suggestedInstructions: "", suggestedShortcuts: [], pairsAnalyzed: 0, pairsAvailable: 0 };
  }

  const raw = await llm.generateRaw(DRAFT_PROMPT_HEADER + transcript);
  const { suggestedInstructions, suggestedShortcuts } = parseDraftResponse(raw);

  return {
    suggestedInstructions,
    suggestedShortcuts,
    pairsAnalyzed: Math.floor(sample.length / 2),
    pairsAvailable,
  };
}
