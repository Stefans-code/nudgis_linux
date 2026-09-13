import { prisma } from "../lib/prisma";
import { computeFanHeatScore, blendHeatScore, signalFromScore, HeatResult } from "./sexchatHeat";

export type SexchatPhase = "phase1_flirting" | "phase2_teaser_preview" | "phase3_locked_offer" | "phase4_completed";

export interface SexchatStateResult {
  currentPhase: SexchatPhase;
  instructionPrompt: string;
  nextAllowedAction: string;
  heat: HeatResult;
}

/**
 * Macchina a Stati Finita per la Sexchat (Brief Slide 5):
 * Struttura il flusso di chatting in 4 fasi progressive:
 * - Fase 1: Flirting & Empatia (Conversazione iniziale)
 * - Fase 2: Teaser & Anticipazione (Descrizione provocante del contenuto)
 * - Fase 3: Proposta Contenuto Locked (Offerta con ID media e prezzo esatto)
 * - Fase 4: Conversazione post-sblocco o continuazione relazionale.
 *
 * L'escalation NON è più solo un contatore di messaggi (bug: un fan che parlava
 * d'altro per 6 messaggi finiva comunque in "fase 3 offerta" per il solo conteggio).
 * Ora combina:
 *  - un floor minimo di messaggi (rispetta la regola business "5-6 messaggi prima di
 *    vendere", non salta mai la fase di flirting iniziale);
 *  - l'heat score del fan (services/sexchatHeat.ts), che ora combina la lettura
 *    "fresca" degli ultimi messaggi con una media mobile persistita su Fan.heatScore:
 *    dà memoria sull'INTERA conversazione (non solo gli ultimi 6 messaggi), gestisce
 *    le negazioni ("non voglio" non conta più come interesse) e pesa di più i
 *    messaggi recenti. Un fan "hot" può salire prima, un fan "cold" resta più a
 *    lungo in teaser invece di ricevere comunque un'offerta su una chat fredda;
 *  - una possibilità di RETROCEDERE di fase se il fan si raffredda dopo un'offerta
 *    (in fase 3/4 con heat chiaramente negativo torna in fase 2).
 *
 * Limite noto rimasto: resta pattern-matching su parole chiave, non vera comprensione
 * — sarcasmo o slang non standard possono ancora essere letti male. Non risolvibile
 * senza una chiamata LLM dedicata di classificazione (costo/latenza extra ad ogni
 * messaggio), scelta deliberatamente evitata per non contraddire l'obiettivo velocità.
 */
export async function evaluateSexchatStateMachine(
  fanId: string,
  messageCount: number,
  lastIncomingText: string
): Promise<SexchatStateResult> {
  const fan = await prisma.fan.findUnique({ where: { id: fanId } });
  // BUG FIX: prima si leggeva/scriveva su `folderTag`, lo stesso campo usato dall'admin per
  // taggare manualmente le "cartelle" fan nel pannello — la fase automatica sovrascriveva
  // silenziosamente il tag scelto a mano. Ora la fase vive nel suo campo dedicato `sexchatPhase`.
  const currentPhase = (fan?.sexchatPhase as SexchatPhase | undefined) || "phase1_flirting";

  // Ultimi messaggi IN del fan (cronologici) per calcolare l'heat score.
  const recentMessages = await prisma.message.findMany({
    where: { fanId, direction: "in" },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  // NB: il chiamante (bot/handlers.ts) salva già il messaggio corrente su Message
  // PRIMA di invocare questa funzione, quindi è già incluso in recentMessages.
  // Se lastIncomingText non risultasse tra gli ultimi messaggi salvati (chiamata da
  // un flusso diverso), lo aggiungiamo qui per non perderlo dal calcolo dell'heat.
  const chronological = recentMessages.map((m) => m.text).reverse();
  if (chronological[chronological.length - 1] !== lastIncomingText) {
    chronological.push(lastIncomingText);
  }
  const freshHeat = computeFanHeatScore(chronological);

  // Combina la lettura "fresca" (solo ultimi messaggi) con la media mobile persistita
  // sul Fan: dà memoria sull'intera conversazione, non solo sugli ultimi 6 messaggi.
  const runningScore = blendHeatScore(fan?.heatScore ?? 0, freshHeat.score);
  const heat: HeatResult = { score: runningScore, signal: signalFromScore(runningScore) };

  let phase: SexchatPhase;

  if (messageCount < 3) {
    // Floor: mai saltare il flirting iniziale, indipendentemente dall'heat.
    phase = "phase1_flirting";
  } else if (messageCount < 6) {
    phase = "phase2_teaser_preview";
  } else {
    // Dai 6 messaggi in su, l'heat decide se è il momento di spingere l'offerta
    // o se conviene restare in teaser un altro giro su un fan ancora tiepido/freddo.
    if (heat.signal === "cold") {
      phase = "phase2_teaser_preview";
    } else {
      phase = "phase3_locked_offer";
    }
  }

  // De-escalation: se eravamo già in fase 3/4 (offerta fatta) e il fan si è
  // chiaramente raffreddato ORA (rifiuto esplicito, "troppo caro", ecc.), torna in
  // teaser invece di insistere con un'altra offerta identica.
  //
  // BUG FIX (trovato dai test di integrazione, due iterazioni):
  // 1) `heat` (running score con memoria) non andava bene: uno storico molto positivo
  //    attutiva un rifiuto netto abbastanza da restare "hot" nonostante il fan avesse
  //    appena detto chiaramente "troppo caro, basta".
  // 2) `freshHeat` (media pesata sugli ultimi 6 messaggi) non bastava nemmeno lei: un
  //    solo rifiuto netto restava annacquato dalla media con 5 messaggi precedenti
  //    entusiasti nella stessa finestra, restando "neutral" invece di "cold".
  // La domanda giusta per la de-escalation è "il fan ha appena, ORA, detto chiaramente
  // che non è interessato?", non una media: va guardato SOLO l'ultimo messaggio.
  const latestMessageHeat = computeFanHeatScore([lastIncomingText]);
  if (
    (currentPhase === "phase3_locked_offer" || currentPhase === "phase4_completed") &&
    latestMessageHeat.signal === "cold"
  ) {
    phase = "phase2_teaser_preview";
  }

  // Persiste sempre la media mobile aggiornata (serve al prossimo messaggio come memoria),
  // e la fase solo se è cambiata.
  await prisma.fan.update({
    where: { id: fanId },
    data: {
      heatScore: runningScore,
      ...(currentPhase !== phase ? { sexchatPhase: phase } : {}),
    },
  });

  switch (phase) {
    case "phase1_flirting":
      return {
        currentPhase: "phase1_flirting",
        instructionPrompt: "FASE 1 (Flirting & Empatia): Parla con il fan, sii provocante e coinvolgente. NON proporre ancora contenuti a pagamento.",
        nextAllowedAction: "Continua a flirtare",
        heat,
      };
    case "phase2_teaser_preview":
      return {
        currentPhase: "phase2_teaser_preview",
        instructionPrompt:
          heat.signal === "cold"
            ? "FASE 2 (Teaser & Anticipazione, fan tiepido/freddo): il fan sembra poco interessato o sensibile al prezzo — NON proporre offerte a pagamento ora, torna a costruire complicità e curiosità senza insistere sulla vendita."
            : "FASE 2 (Teaser & Anticipazione): Stuzzica il fan parlando di cosa ti piacerebbe fargli vedere, ma senza inviare il prezzo definitivo.",
        nextAllowedAction: "Crea anticipazione",
        heat,
      };
    case "phase3_locked_offer":
      return {
        currentPhase: "phase3_locked_offer",
        instructionPrompt: "FASE 3 (Proposta Contenuto Locked, fan interessato): Proponi il contenuto sbloccabile con ID media e prezzo esatto dal catalogo.",
        nextAllowedAction: "Invia offerta locked",
        heat,
      };
    default:
      return {
        currentPhase: "phase4_completed",
        instructionPrompt: "FASE 4 (Post-Offerta): Ringrazia ed allunga la conversazione per mantenere viva la relazione.",
        nextAllowedAction: "Conversazione relazionale",
        heat,
      };
  }
}
