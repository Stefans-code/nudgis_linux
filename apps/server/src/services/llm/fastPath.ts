/**
 * Fast-Path Execution Engine (Ottimizzazione Velocità LLM Brief Slide 1)
 * Esegue un pattern-matching ultra-veloce (<5ms) per messaggi ricorrenti
 * evitando la latenza di rete della chiamata al modello LLM quando il fan richiede
 * informazioni dirette (es. link Tribute, istruzioni pagamento, esito verifica).
 */

export interface FastPathMatch {
  matched: boolean;
  replyText?: string;
}

export function checkFastPathMatch(incomingMessage: string): FastPathMatch {
  // BUG FIX: confronto con === troppo rigido — "dove pago?" (con punteggiatura,
  // normalissima da un fan su Telegram) non faceva match con "dove pago". Rimuoviamo
  // la punteggiatura finale prima del confronto esatto.
  const msg = incomingMessage.toLowerCase().trim().replace(/[?!.]+$/, "");

  // Pattern 1: Richiesta link di pagamento / Tribute
  if (
    msg === "link" ||
    msg === "dove pago" ||
    msg === "come pago" ||
    msg.includes("link tribute") ||
    msg.includes("invia link")
  ) {
    return {
      matched: true,
      replyText: "Trovi i miei contenuti sbloccabili e i servizi custom direttamente tramite il mio link ufficiale Tribute. Dimmi cosa ti piacerebbe vedere prima! 😊",
    };
  }

  // Pattern 2: Richiesta diretta esito pagamento inviato
  if (
    msg.includes("ho pagato") ||
    msg.includes("ricevuto pagamento") ||
    msg.includes("controllato pagamento")
  ) {
    return {
      matched: true,
      replyText: "Grazie tesoro! Ho registrato la tua richiesta nel sistema. Il nostro team sta effettuando il controllo del pagamento e ti comunicherò l'esito reale a breve! ✨",
    };
  }

  return { matched: false };
}
