/**
 * Punteggio di "interesse" (heat) del fan, calcolato dai suoi ultimi messaggi.
 * Funzione PURA (nessuna chiamata DB/rete) apposta per essere testabile e per non
 * aggiungere latenza: è solo pattern-matching su testo, non una chiamata LLM extra.
 *
 * Usata da sexchatStateMachine per non far dipendere l'escalation della sexchat
 * SOLO dal numero di messaggi scambiati (bug segnalato: un fan che parla d'altro
 * per 6 messaggi finiva comunque in "fase 3 offerta" solo per il conteggio).
 */

const INTEREST_KEYWORDS = [
  "voglio",
  "quanto costa",
  "quanto viene",
  "mandami",
  "fammi vedere",
  "fammi sentire",
  "manda",
  "dai",
  "si",
  "sì",
  "adoro",
  "mi piaci",
  "bella",
  "sexy",
  "eccitat",
  "hot",
  "video",
  "foto",
  "vederti",
  "toccarti",
];

const INTEREST_EMOJI = ["🔥", "😍", "🥵", "❤️", "😈", "🤤", "💦", "😏"];

const DISINTEREST_KEYWORDS = [
  "no grazie",
  "non mi interessa",
  "non ora",
  "magari dopo",
  "troppo caro",
  "troppo costoso",
  "non voglio",
  "basta",
  "non posso",
  "niente soldi",
  "non ho soldi",
];

/** Messaggi troppo corti e generici segnalano basso coinvolgimento (non per forza rifiuto). */
const LOW_ENGAGEMENT_REPLIES = ["ok", "boh", "vabbè", "vabbe", "mah", "si", "no", "ah"];

/**
 * Negazioni italiane comuni che, se trovate SUBITO PRIMA di una keyword di interesse
 * (entro una manciata di caratteri, tipicamente 1-2 parole), ne capovolgono il senso:
 * "non voglio" non è interesse, è il contrario. Senza questo controllo "non voglio"
 * veniva letto come un match su "voglio" e contava come segnale positivo — un bug reale
 * di lettura, non solo un limite teorico.
 */
const NEGATION_WORDS = ["non ", "mai ", "no "];
const NEGATION_LOOKBACK_CHARS = 12; // "assolutamente non " ~ copre negazioni con un avverbio in mezzo

function isNegatedAt(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - NEGATION_LOOKBACK_CHARS);
  const window = text.slice(windowStart, matchIndex);
  return NEGATION_WORDS.some((neg) => window.includes(neg));
}

export interface HeatResult {
  score: number; // può essere negativo
  signal: "hot" | "neutral" | "cold";
}

/**
 * Calcola l'heat score sugli ultimi messaggi del fan (i più recenti pesano di più).
 * @param recentFanMessages messaggi del fan in ordine cronologico (più vecchio -> più recente)
 */
export function computeFanHeatScore(recentFanMessages: string[]): HeatResult {
  let score = 0;

  recentFanMessages.forEach((raw, idx) => {
    const text = raw.toLowerCase().trim();
    // Pesa di più i messaggi più recenti (l'ultimo conta il doppio del terzultimo).
    const recencyWeight = 1 + idx / Math.max(1, recentFanMessages.length - 1);

    for (const kw of INTEREST_KEYWORDS) {
      const matchIndex = text.indexOf(kw);
      if (matchIndex === -1) continue;
      // Negato ("non voglio") -> non è più un segnale di interesse, diventa un segnale
      // di disinteresse leggero (invece di essere semplicemente ignorato).
      score += isNegatedAt(text, matchIndex) ? -1.5 * recencyWeight : 2 * recencyWeight;
    }
    for (const emoji of INTEREST_EMOJI) {
      if (text.includes(emoji)) score += 2 * recencyWeight;
    }
    for (const kw of DISINTEREST_KEYWORDS) {
      if (text.includes(kw)) score -= 4 * recencyWeight;
    }

    const isLowEngagement = LOW_ENGAGEMENT_REPLIES.includes(text.replace(/[^\wàèéìòù]/gi, ""));
    if (isLowEngagement) score -= 1 * recencyWeight;

    // Un messaggio lungo e articolato indica coinvolgimento, indipendentemente da parole chiave.
    if (text.length > 60) score += 1 * recencyWeight;
  });

  let signal: HeatResult["signal"] = "neutral";
  if (score >= 3) signal = "hot";
  else if (score <= -3) signal = "cold";

  return { score, signal };
}

/** Peso dato alla memoria storica (EWMA) rispetto alla lettura "fresca" degli ultimi messaggi. */
const HEAT_MEMORY_DECAY = 0.6;

/**
 * Combina l'heat score "fresco" (calcolato solo sugli ultimi messaggi) con una media
 * mobile persistita sul Fan (Fan.heatScore), per dare all'escalation della sexchat
 * memoria sull'INTERA conversazione, non solo sugli ultimi 6 messaggi salvati.
 * Es.: un fan che è stato molto interessato per 30 messaggi e poi risponde "ok" non
 * viene trattato come "cold" solo perché l'ultimo messaggio è scarno — la storia conta.
 */
export function blendHeatScore(previousRunningScore: number, freshScore: number): number {
  return previousRunningScore * HEAT_MEMORY_DECAY + freshScore * (1 - HEAT_MEMORY_DECAY);
}

export function signalFromScore(score: number): HeatResult["signal"] {
  if (score >= 3) return "hot";
  if (score <= -3) return "cold";
  return "neutral";
}
