import { prisma } from "../lib/prisma";

export interface ScorableContentItem {
  id: string;
  externalId: string;
  folder: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
}

export interface ScoredCandidate {
  item: ScorableContentItem;
  score: number;
}

export interface MatchedContentResult {
  matched: boolean; // true = match abbastanza sicuro da istruire la vendita diretta
  item?: ScorableContentItem & { formattedPrice: string };
  score?: number;
  // Candidati "possibili" (sotto la soglia di confidenza ma sopra il rumore): invece di
  // un secco sì/no, li passiamo al LLM così può scegliere semanticamente lui stesso,
  // capendo il contesto della frase invece di affidarsi solo al punteggio a parole chiave.
  candidates: (ScorableContentItem & { formattedPrice: string; score: number })[];
}

const CONFIDENT_MATCH_THRESHOLD = 20; // sopra: istruzione diretta di vendita
const CANDIDATE_THRESHOLD = 8; // sopra (ma sotto la confident): proposto come possibile candidato al LLM

/**
 * Punteggio multi-fattore PURO (nessuna chiamata DB), per essere testabile e per
 * poter essere riusato sia dal matching "confident" sia dalla lista di candidati
 * "possibili" lasciati decidere al LLM (matching semantico leggero, senza il costo/
 * latenza di una chiamata LLM dedicata solo per il matching).
 */
export function scoreContentItems(items: ScorableContentItem[], userMessage: string): ScoredCandidate[] {
  const msg = userMessage.toLowerCase();

  const scored = items.map((item) => {
    let score = 0;

    // 1. Match Esatto su ID Esterno (es. #21670210)
    if (item.externalId && msg.includes(item.externalId.toLowerCase())) {
      score += 100;
    }

    // 2. Match su Nome Cartella (es. "Foto Live Piedi", "Sexchat #1", "Video Coppia")
    const folderLower = item.folder.toLowerCase();
    const folderWords = folderLower.split(/\s+/);
    for (const word of folderWords) {
      if (word.length > 2 && msg.includes(word)) {
        score += 25;
      }
    }

    // 3. Match su Titolo del Contenuto
    const titleLower = item.title.toLowerCase();
    const titleWords = titleLower.split(/\s+/);
    for (const word of titleWords) {
      if (word.length > 3 && msg.includes(word)) {
        score += 15;
      }
    }

    // 4. Match su parole chiave tematiche rilevanti
    if (msg.includes("piedi") && (folderLower.includes("piedi") || titleLower.includes("piedi"))) {
      score += 30;
    }
    if (msg.includes("sexchat") && (folderLower.includes("sexchat") || titleLower.includes("sexchat"))) {
      score += 30;
    }
    if (msg.includes("coppia") && (folderLower.includes("coppia") || titleLower.includes("coppia"))) {
      score += 30;
    }
    if (msg.includes("live") && (folderLower.includes("live") || titleLower.includes("live"))) {
      score += 20;
    }

    return { item, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function formatItem(item: ScorableContentItem) {
  return { ...item, formattedPrice: `${(item.priceCents / 100).toFixed(2)}${item.currency === "EUR" ? "€" : ` ${item.currency}`}` };
}

/**
 * Motore di Matching Automatico "Richiesta Utente → Contenuto / Cartella Specifica".
 * Wrapper DB attorno a scoreContentItems: recupera il catalogo del creator e restituisce
 * sia il match "confident" (se c'è) sia una lista di candidati possibili sotto soglia,
 * così il prompt builder può lasciare al LLM la scelta finale invece di un cutoff rigido.
 */
export async function matchContentItemForRequest(
  creatorId: string,
  userMessage: string
): Promise<MatchedContentResult> {
  const items = await prisma.contentItem.findMany({ where: { creatorId, isActive: true } });
  if (!items.length) return { matched: false, candidates: [] };

  const scored = scoreContentItems(items, userMessage);
  const best = scored[0];

  const candidates = scored
    .filter((s) => s.score >= CANDIDATE_THRESHOLD && s.score < CONFIDENT_MATCH_THRESHOLD)
    .slice(0, 3)
    .map((s) => ({ ...formatItem(s.item), score: s.score }));

  if (best && best.score >= CONFIDENT_MATCH_THRESHOLD) {
    return {
      matched: true,
      score: best.score,
      item: formatItem(best.item),
      candidates,
    };
  }

  return { matched: false, candidates };
}
