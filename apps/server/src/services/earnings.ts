import { prisma } from "../lib/prisma";

/**
 * Guadagni reali con vincolo di prelievo (visto nello screenshot reale del prodotto di
 * riferimento: "Pending 21d" / "Withdrawable"). Un incasso confermato (Transaction) non
 * è prelevabile subito: resta "pending" per Creator.withdrawalHoldDays giorni dalla
 * data della transazione, poi diventa "withdrawable".
 */
export interface EarningsSummary {
  totalCents: number;
  pendingCents: number;
  withdrawableCents: number;
}

export async function computeCreatorEarnings(creatorId: string): Promise<EarningsSummary> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { withdrawalHoldDays: true },
  });
  const holdCutoff = new Date(Date.now() - creator.withdrawalHoldDays * 24 * 60 * 60 * 1000);

  const [pending, withdrawable] = await Promise.all([
    prisma.transaction.aggregate({
      where: { creatorId, createdAt: { gte: holdCutoff } },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { creatorId, createdAt: { lt: holdCutoff } },
      _sum: { amountCents: true },
    }),
  ]);

  const pendingCents = pending._sum.amountCents ?? 0;
  const withdrawableCents = withdrawable._sum.amountCents ?? 0;
  return { totalCents: pendingCents + withdrawableCents, pendingCents, withdrawableCents };
}

/** Somma aggregata su TUTTE le creator, rispettando il withdrawalHoldDays di ciascuna. */
export async function computeAllCreatorsEarnings(): Promise<EarningsSummary> {
  const creators = await prisma.creator.findMany({ select: { id: true, withdrawalHoldDays: true } });
  const holdDaysByCreator = new Map(creators.map((c) => [c.id, c.withdrawalHoldDays]));

  const transactions = await prisma.transaction.findMany({
    select: { creatorId: true, amountCents: true, createdAt: true },
  });

  const now = Date.now();
  let pendingCents = 0;
  let withdrawableCents = 0;

  for (const t of transactions) {
    const holdDays = holdDaysByCreator.get(t.creatorId) ?? 21;
    const cutoffMs = now - holdDays * 24 * 60 * 60 * 1000;
    if (t.createdAt.getTime() >= cutoffMs) pendingCents += t.amountCents;
    else withdrawableCents += t.amountCents;
  }

  return { totalCents: pendingCents + withdrawableCents, pendingCents, withdrawableCents };
}
