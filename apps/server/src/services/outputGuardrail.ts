/**
 * Output Guardrail Safety Filter (Sicurezza LLM & Anti-Injection l'Output)
 * Verifica che la risposta generata dal modello non contenga perdite di prompt di sistema,
 * frammenti di istruzioni interne o rotture del personaggio.
 */
export function sanitizeLlmOutput(replyText: string, fallbackPersonaName: string = "Eli"): string {
  if (!replyText || !replyText.trim()) {
    return "Scusami tesoro, non ho capito bene. Cosa mi dicevi? 😊";
  }

  let sanitized = replyText;

  // 1. Rimuove eventuali perdite di delimitatori di sistema o tag di prompt
  sanitized = sanitized.replace(/<utente>[\s\S]*?<\/utente>/gi, "");
  sanitized = sanitized.replace(/## PERSONA|## REGOLE|## SICUREZZA/gi, "");
  // Rete di sicurezza extra: extractHeatTag (heatTag.ts) dovrebbe già averlo rimosso
  // PRIMA di arrivare qui, ma se per qualche motivo il chiamante non lo facesse,
  // il tag di valutazione interesse non deve MAI arrivare al fan.
  sanitized = sanitized.replace(/\[\[\s*HEAT\s*:\s*(hot|neutral|cold)\s*\]\]/gi, "");

  // 2. Rimuove frasi da AI generica (es. "Come modello AI", "Sono un'Intelligenza Artificiale")
  if (/sono un'intelligenza artificiale|sono un modello di lingua|come ai|come assistente virtuale/i.test(sanitized)) {
    return `Ahah ma cosa dici tesoro! Sono ${fallbackPersonaName}! Dimmi piuttosto di te 😊`;
  }

  return sanitized.trim();
}
