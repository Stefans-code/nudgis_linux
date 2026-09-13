/**
 * Calcola un ritardo di risposta "realistico" in base alla lunghezza del messaggio
 * da inviare, per non rispondere in modo innaturalmente istantaneo (brief pagina 1:
 * "tempo di risposta realistico per lunghezza media inviati").
 *
 * Modello semplice: velocità media di battitura ~ 35 caratteri/secondo (persona che scrive
 * velocemente su telefono), con un minimo e un massimo per non essere né istantanei
 * né esageratamente lenti, più una piccola componente casuale.
 */
const CHARS_PER_SECOND = 35;
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 12000;

export function computeTypingDelayMs(replyText: string): number {
  const base = (replyText.length / CHARS_PER_SECOND) * 1000;
  const jitter = base * (Math.random() * 0.3 - 0.15); // +-15%
  let total = base + jitter;

  // Cadenza Notturna: di notte (23:00 - 07:00) si scrive più lentamente nella realtà (+40% di ritardo)
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 7) {
    total *= 1.4;
  }

  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(total)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
