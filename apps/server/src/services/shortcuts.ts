/**
 * Comandi rapidi che il LLM può inserire nella propria risposta (es. "/listino"),
 * riconosciuti e sostituiti col testo completo salvato (vedi CreatorShortcut nello
 * schema). Il testo espanso viene mandato come messaggio SEPARATO senza il ritardo di
 * digitazione simulato (è testo precompilato, non generato lì per lì) — comportamento
 * visto nello screenshot reale del prodotto di riferimento.
 */

export interface ShortcutDef {
  command: string; // con slash iniziale, es. "/listino"
  content: string;
}

export interface ExpandShortcutsResult {
  mainText: string; // testo della risposta SENZA i comandi (rimossi)
  expansions: string[]; // testi completi da mandare come messaggi separati, in ordine
}

/** Istruzione da iniettare nel system prompt: elenca i comandi disponibili al LLM. */
export function buildShortcutsInstruction(shortcuts: ShortcutDef[]): string {
  if (!shortcuts.length) return "";
  const list = shortcuts.map((s) => `- ${s.command}`).join("\n");
  return (
    "## COMANDI RAPIDI DISPONIBILI\n" +
    "Se la situazione lo richiede (es. il fan chiede il listino prezzi), invece di riscrivere " +
    "tu il testo completo, inserisci ESATTAMENTE uno di questi comandi da solo su una riga " +
    "nella tua risposta — verrà sostituito automaticamente col testo predefinito:\n" +
    `${list}\n` +
    "Non modificare né abbreviare il comando, scrivilo identico a come è elencato qui."
  );
}

/**
 * Estrae i comandi riconosciuti dal testo (su una riga propria, tollerante a spazi) e
 * restituisce il testo "pulito" più le espansioni da mandare come messaggi separati.
 */
export function expandShortcuts(rawText: string, shortcuts: ShortcutDef[]): ExpandShortcutsResult {
  if (!rawText || !shortcuts.length) return { mainText: rawText, expansions: [] };

  const byCommand = new Map(shortcuts.map((s) => [s.command.toLowerCase(), s.content]));
  const expansions: string[] = [];

  const lines = rawText.split("\n");
  const remainingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = byCommand.get(trimmed.toLowerCase());
    if (trimmed.startsWith("/") && match !== undefined) {
      expansions.push(match);
      continue; // riga rimossa dal testo principale
    }
    remainingLines.push(line);
  }

  return {
    mainText: remainingLines.join("\n").trim(),
    expansions,
  };
}
