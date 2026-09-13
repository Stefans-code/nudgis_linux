import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";
import { evaluateSexchatStateMachine } from "../sexchatStateMachine";
import { blendHeatScore } from "../sexchatHeat";
import { heatTagToScore } from "../heatTag";

/**
 * Test di INTEGRAZIONE: nessun mock, DB SQLite di test reale (vedi vitest.config.ts +
 * src/test/globalSetup.ts). Verificano che l'intera pipeline — persistenza su Fan,
 * escalation/de-escalation di fase, memoria dell'heat score nel tempo — si comporti
 * come progettato su scenari di conversazione scriptati.
 *
 * IMPORTANTE — cosa NON sono: non sono un A/B test su traffico reale. Non esiste modo
 * di fabbricare dati di comportamento di fan veri. Sono una validazione della LOGICA:
 * dato uno scenario di conversazione con un andamento noto (chiaramente interessato,
 * chiaramente freddo, sarcastico ma "salvato" dalla valutazione del LLM...), il sistema
 * deve produrre le fasi/punteggi attesi. Se in futuro la logica viene toccata e uno
 * scenario smette di comportarsi come atteso, questi test lo segnalano.
 */

async function createTestCreator() {
  return prisma.creator.create({ data: { name: `Test Creator ${Date.now()}-${Math.random()}` } });
}

async function createTestFan(creatorId: string) {
  return prisma.fan.create({
    data: { creatorId, telegramChatId: `chat-${Date.now()}-${Math.random()}` },
  });
}

async function sendFanMessage(fanId: string, text: string) {
  await prisma.message.create({ data: { fanId, direction: "in", text } });
}

describe("evaluateSexchatStateMachine (integrazione, DB reale)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("SCENARIO 'fan interessato': converge alla fase di offerta entro 6 messaggi e resta lì", async () => {
    const creator = await createTestCreator();
    const fan = await createTestFan(creator.id);

    const conversation = [
      "ciao, ho visto il tuo profilo",
      "sei davvero bellissima",
      "mi piace molto come scrivi",
      "voglio vederti, mandami qualcosa 🔥",
      "sono davvero eccitato, dai",
      "quanto costa il video?",
    ];

    let lastResult;
    for (let i = 0; i < conversation.length; i++) {
      await sendFanMessage(fan.id, conversation[i]);
      lastResult = await evaluateSexchatStateMachine(fan.id, i + 1, conversation[i]);
    }

    expect(lastResult!.currentPhase).toBe("phase3_locked_offer");
    expect(lastResult!.heat.signal).toBe("hot");
  });

  it("SCENARIO 'fan freddo/sensibile al prezzo': NON riceve l'offerta anche dopo 6+ messaggi", async () => {
    const creator = await createTestCreator();
    const fan = await createTestFan(creator.id);

    const conversation = [
      "ciao",
      "come va",
      "ok",
      "troppo caro per me comunque",
      "non mi interessa spendere soldi",
      "basta, non voglio altro",
    ];

    let lastResult;
    for (let i = 0; i < conversation.length; i++) {
      await sendFanMessage(fan.id, conversation[i]);
      lastResult = await evaluateSexchatStateMachine(fan.id, i + 1, conversation[i]);
    }

    expect(lastResult!.currentPhase).not.toBe("phase3_locked_offer");
    expect(lastResult!.heat.signal).toBe("cold");
  });

  it("SCENARIO 'de-escalation': un fan interessato che poi rifiuta esplicitamente torna in teaser", async () => {
    const creator = await createTestCreator();
    const fan = await createTestFan(creator.id);

    const hotStart = ["ciao bella", "mi piaci molto", "voglio vederti 🔥", "mandami tutto, sei sexy", "dai non aspetto altro", "quanto costa?"];
    for (let i = 0; i < hotStart.length; i++) {
      await sendFanMessage(fan.id, hotStart[i]);
      await evaluateSexchatStateMachine(fan.id, i + 1, hotStart[i]);
    }
    const beforeRefusal = await prisma.fan.findUniqueOrThrow({ where: { id: fan.id } });
    expect(beforeRefusal.sexchatPhase).toBe("phase3_locked_offer");

    // Ora rifiuta chiaramente dopo aver visto il prezzo.
    const refusal = "no, troppo caro, non mi interessa più, basta";
    await sendFanMessage(fan.id, refusal);
    const afterRefusal = await evaluateSexchatStateMachine(fan.id, hotStart.length + 1, refusal);

    expect(afterRefusal.currentPhase).toBe("phase2_teaser_preview");
  });

  it("SCENARIO 'memoria persistente': uno storico molto positivo attutisce un singolo messaggio scarno isolato", async () => {
    const creator = await createTestCreator();
    const fan = await createTestFan(creator.id);

    const hotHistory = ["voglio vederti 🔥", "sei bellissima, adoro", "mandami tutto quello che hai 😍", "dai non vedo l'ora", "mi piaci troppo", "quanto costa il video personalizzato?"];
    for (let i = 0; i < hotHistory.length; i++) {
      await sendFanMessage(fan.id, hotHistory[i]);
      await evaluateSexchatStateMachine(fan.id, i + 1, hotHistory[i]);
    }
    const fanBefore = await prisma.fan.findUniqueOrThrow({ where: { id: fan.id } });
    expect(fanBefore.heatScore).toBeGreaterThan(0);

    // Un singolo messaggio scarno/neutro non deve azzerare tutto lo storico positivo.
    await sendFanMessage(fan.id, "ok");
    const result = await evaluateSexchatStateMachine(fan.id, hotHistory.length + 1, "ok");

    expect(result.heat.score).toBeGreaterThan(0);
    expect(result.currentPhase).toBe("phase3_locked_offer");
  });

  it("SCENARIO 'sarcasmo corretto dal LLM': il pattern a parole chiave legge male, il tag LLM corregge la memoria per il turno successivo", async () => {
    const creator = await createTestCreator();
    const fan = await createTestFan(creator.id);

    // Messaggio letteralmente ambiguo per il pattern-matching: contiene "voglio" ma è
    // chiaramente sarcastico/insofferente nel contesto (cosa che solo un LLM può cogliere).
    const sarcasticMessage = "ah certo, voglio proprio pagare per questo, sono al settimo cielo";
    await sendFanMessage(fan.id, sarcasticMessage);
    const keywordOnlyResult = await evaluateSexchatStateMachine(fan.id, 1, sarcasticMessage);

    // Simula ciò che handlers.ts fa dopo la generazione: il LLM valuta correttamente il
    // sarcasmo e restituisce [[HEAT:cold]], che affina la memoria persistita.
    const refinedScore = blendHeatScore(keywordOnlyResult.heat.score, heatTagToScore("cold"));
    await prisma.fan.update({ where: { id: fan.id }, data: { heatScore: refinedScore } });

    const fanAfterCorrection = await prisma.fan.findUniqueOrThrow({ where: { id: fan.id } });
    // La correzione del LLM deve aver abbassato il punteggio rispetto alla sola lettura a parole chiave.
    expect(fanAfterCorrection.heatScore).toBeLessThan(keywordOnlyResult.heat.score);
  });
});
