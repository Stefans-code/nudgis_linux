import { prisma } from "../lib/prisma";

/**
 * Rileva se il fan sta chiedendo esplicitamente di non essere ricontattato in
 * automatico (ricerca sui limiti Telegram, brief pagina 2: rispettare le richieste
 * di stop è la difesa più semplice ed efficace contro i report che fanno scattare
 * i filtri anti-spam sull'account bot).
 */
const OPT_OUT_KEYWORDS = [
  "non scrivermi più",
  "non contattarmi più",
  "smettila di scrivermi",
  "basta messaggi",
  "togli notifiche",
  "non mandarmi più messaggi",
  "stop messaggi",
  "/stop",
];

export function looksLikeFollowUpOptOut(text: string): boolean {
  const lower = text.toLowerCase();
  return OPT_OUT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * @param llmSaysOptOut valutazione semantica del LLM (heatTag.ts, tag [[OPTOUT:yes|no]]),
 * che coglie richieste indirette ("lasciami in pace", "smettila", in dialetto/slang) che
 * la lista di parole chiave da sola perderebbe. In OR con l'euristica.
 */
export async function recordFollowUpOptOutIfNeeded(
  fanId: string,
  text: string,
  llmSaysOptOut: boolean = false
) {
  if (!looksLikeFollowUpOptOut(text) && !llmSaysOptOut) return;
  await prisma.fan.update({ where: { id: fanId }, data: { followUpOptOut: true } });
}
