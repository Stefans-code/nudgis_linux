import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";

/**
 * Verifica il comportamento GDPR di cancellazione (routes/fans.ts,
 * DELETE /:id/gdpr-erase): cancellare un fan deve rimuovere i suoi dati personali
 * (Message, ExternalPaymentClaim) ma NON le Transaction (obbligo di conservazione
 * contabile) — solo il collegamento al fan (fanId) deve sparire.
 */
async function createCreator() {
  return prisma.creator.create({ data: { name: `Creator ${Date.now()}-${Math.random()}` } });
}

describe("Cancellazione GDPR del fan (comportamento a livello DB)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cancella Message e ExternalPaymentClaim, mantiene la Transaction anonimizzata", async () => {
    const creator = await createCreator();
    const fan = await prisma.fan.create({
      data: { creatorId: creator.id, telegramChatId: `chat-${Date.now()}-${Math.random()}` },
    });

    await prisma.message.create({ data: { fanId: fan.id, direction: "in", text: "ciao" } });
    await prisma.externalPaymentClaim.create({ data: { fanId: fan.id, fanMessage: "ho pagato" } });
    const transaction = await prisma.transaction.create({
      data: {
        creatorId: creator.id,
        fanId: fan.id,
        source: "content_item",
        description: "Vendita test",
        amountCents: 5000,
      },
    });

    // Simula esattamente cosa fa l'endpoint: cancella il Fan (CASCADE su Message/claim).
    await prisma.fan.delete({ where: { id: fan.id } });

    const messages = await prisma.message.findMany({ where: { fanId: fan.id } });
    const claims = await prisma.externalPaymentClaim.findMany({ where: { fanId: fan.id } });
    expect(messages).toHaveLength(0);
    expect(claims).toHaveLength(0);

    const survivingTransaction = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(survivingTransaction).not.toBeNull();
    expect(survivingTransaction!.amountCents).toBe(5000);
    // Il dato contabile resta, il collegamento alla persona no.
    expect(survivingTransaction!.fanId).toBeNull();
  });
});
