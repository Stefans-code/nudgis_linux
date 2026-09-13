import { prisma } from "../lib/prisma";

/**
 * Euristica semplice per intercettare in chat una dichiarazione di pagamento
 * "esterno" (fuori dai canali ufficiali tribute/Stars) fatta dal fan. Non è
 * un rilevatore perfetto: è pensato per creare comunque una traccia in coda
 * di verifica, così l'admin la vede anche se l'AI non l'ha gestita bene.
 */
const PAYMENT_KEYWORDS = [
  "ho pagato",
  "ho già pagato",
  "gia pagato",
  "pagamento fatto",
  "ho inviato i soldi",
  "ho fatto il bonifico",
  "bonifico",
  "paypal",
  "revolut",
  "postepay",
  "satispay",
  "ho mandato i soldi",
];

export function looksLikeExternalPaymentClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * @param llmSaysPaymentClaim valutazione semantica del LLM (heatTag.ts, tag
 * [[PAYMENT_CLAIM:yes|no]]), che coglie dichiarazioni indirette/sarcastiche che le
 * parole chiave da sole perderebbero. In OR con l'euristica: se UNO dei due la rileva,
 * viene tracciata — meglio una verifica in più che una dichiarazione di pagamento persa.
 */
export async function recordPaymentClaimIfNeeded(
  fanId: string,
  text: string,
  llmSaysPaymentClaim: boolean = false
) {
  if (!looksLikeExternalPaymentClaim(text) && !llmSaysPaymentClaim) return null;
  return prisma.externalPaymentClaim.create({
    data: { fanId, fanMessage: text },
  });
}
