/**
 * Il pattern-matching a parole chiave (sexchatHeat.ts, paymentClaims.ts,
 * followUpOptOut.ts) non può capire sarcasmo, ironia o frasi indirette — è un limite
 * reale di qualunque euristica testuale. La soluzione che lo risolve davvero è far
 * valutare al LLM stesso, che HA comprensione semantica del contesto, tre cose ad ogni
 * turno: quanto è interessato il fan, se sta dichiarando un pagamento esterno, se sta
 * chiedendo di non essere ricontattato. Farlo con chiamate dedicate costerebbe latenza
 * e token extra ad ogni messaggio (contro l'obiettivo "velocità" del brief).
 *
 * Soluzione: pigiare tutt'e tre le valutazioni nella STESSA chiamata già fatta per
 * generare la risposta. Il system prompt istruisce il modello ad appendere tag
 * invisibili a fine messaggio (es. "[[HEAT:hot]] [[PAYMENT_CLAIM:no]] [[OPTOUT:no]]"),
 * che qui vengono estratti e rimossi PRIMA di mandare il testo al fan. Zero chiamate
 * aggiuntive, comprensione semantica reale invece del solo pattern-matching.
 *
 * Le euristiche a parole chiave (paymentClaims.ts, followUpOptOut.ts) restano ATTIVE
 * come rete di sicurezza indipendente: se il LLM fallisce/non risponde col tag atteso
 * (fornitori/modelli diversi possono seguire l'istruzione in modo imperfetto), la
 * dichiarazione di pagamento o la richiesta di stop vengono comunque intercettate.
 * I due meccanismi si sommano in OR, non si sostituiscono.
 */

export type LlmHeatSignal = "hot" | "neutral" | "cold";
export type LlmBooleanSignal = "yes" | "no";

// Tollerante alla formattazione: i LLM non sono sempre precisi al carattere, quindi
// permettiamo spazi extra dopo "[[" e attorno ai ":" (es. "[[ heat : COLD ]]").
const HEAT_TAG_REGEX = /\[\[\s*HEAT\s*:\s*(hot|neutral|cold)\s*\]\]/gi;
const PAYMENT_TAG_REGEX = /\[\[\s*PAYMENT_CLAIM\s*:\s*(yes|no)\s*\]\]/gi;
const OPTOUT_TAG_REGEX = /\[\[\s*OPTOUT\s*:\s*(yes|no)\s*\]\]/gi;

export interface ExtractedLlmSignals {
  cleanedText: string;
  llmHeatSignal: LlmHeatSignal | null;
  llmPaymentClaimSignal: LlmBooleanSignal | null;
  llmOptOutSignal: LlmBooleanSignal | null;
}

function extractOne<T extends string>(text: string, regex: RegExp): { rest: string; value: T | null } {
  regex.lastIndex = 0;
  const match = regex.exec(text);
  const value = (match ? (match[1].toLowerCase() as T) : null);
  regex.lastIndex = 0;
  const rest = text.replace(regex, "");
  return { rest, value };
}

/**
 * Estrae e rimuove tutti e tre i tag di valutazione dal testo generato dal LLM.
 * Va chiamata SEMPRE prima di mandare il testo al fan, indipendentemente da dove i
 * tag compaiono nel messaggio (il modello non sempre li mette esattamente in fondo).
 */
export function extractHeatTag(rawReply: string): ExtractedLlmSignals {
  if (!rawReply) {
    return { cleanedText: rawReply, llmHeatSignal: null, llmPaymentClaimSignal: null, llmOptOutSignal: null };
  }

  let text = rawReply;
  const heat = extractOne<LlmHeatSignal>(text, HEAT_TAG_REGEX);
  text = heat.rest;
  const payment = extractOne<LlmBooleanSignal>(text, PAYMENT_TAG_REGEX);
  text = payment.rest;
  const optout = extractOne<LlmBooleanSignal>(text, OPTOUT_TAG_REGEX);
  text = optout.rest;

  return {
    cleanedText: text.trim(),
    llmHeatSignal: heat.value,
    llmPaymentClaimSignal: payment.value,
    llmOptOutSignal: optout.value,
  };
}

export function heatTagToScore(signal: LlmHeatSignal): number {
  if (signal === "hot") return 4;
  if (signal === "cold") return -4;
  return 0;
}

/** Istruzione da iniettare nel system prompt: sempre attiva, non lasciata a scelta del LLM. */
export const HEAT_TAG_INSTRUCTION =
  "## VALUTAZIONE INTERNA OBBLIGATORIA (invisibile al fan)\n" +
  "Dopo aver scritto la tua risposta normale al fan, alla fine del messaggio, su una riga a sé, " +
  "aggiungi ESATTAMENTE questi tre tag (capisci anche sarcasmo, ironia o frasi indirette, non fermarti alle parole letterali):\n" +
  "1. Interesse del fan in questa conversazione: [[HEAT:hot]] se è chiaramente interessato/coinvolto, " +
  "[[HEAT:cold]] se è indifferente, sarcastico, infastidito o sensibile al prezzo, altrimenti [[HEAT:neutral]].\n" +
  "2. Il fan sta dichiarando/lasciando intendere di aver GIÀ pagato con un metodo esterno alla piattaforma " +
  "(bonifico, PayPal, Revolut, contanti, altro): [[PAYMENT_CLAIM:yes]] oppure [[PAYMENT_CLAIM:no]].\n" +
  "3. Il fan sta chiedendo, anche indirettamente, di non essere ricontattato o di essere lasciato in pace: " +
  "[[OPTOUT:yes]] oppure [[OPTOUT:no]].\n" +
  "Questi tag NON verranno MAI visti dal fan (vengono rimossi automaticamente prima dell'invio): " +
  "non modificare mai il tuo modo di scrivere per questo, sono solo dati interni per il sistema.";
