import { Router } from "express";
import { prisma } from "../lib/prisma";
import { computeAllCreatorsEarnings, computeCreatorEarnings } from "../services/earnings";

export const dashboardRouter = Router();

// Visibilità sui messaggi bloccati/falliti: risponde direttamente al bug
// "il bot lascia indietro alcune chat" dando uno strumento per vederle e
// eventualmente re-inviarle manualmente, invece che sparire nel nulla.
dashboardRouter.get("/queue-status", async (_req, res) => {
  const [pending, processing, deadLetter, sentLast24h] = await Promise.all([
    prisma.outboundQueueItem.count({ where: { status: "pending" } }),
    prisma.outboundQueueItem.count({ where: { status: "processing" } }),
    prisma.outboundQueueItem.findMany({ where: { status: "dead_letter" }, take: 50, orderBy: { updatedAt: "desc" } }),
    prisma.outboundQueueItem.count({
      where: { status: "sent", updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  res.json({ pending, processing, deadLetterCount: deadLetter.length, deadLetter, sentLast24h });
});

dashboardRouter.get("/stats", async (_req, res) => {
  const [totalCreators, activeBots, totalFans, pendingClaims, confirmedClaims, totalMessages, transactionCount, earnings] =
    await Promise.all([
      prisma.creator.count(),
      prisma.creator.count({ where: { isActive: true, telegramBotToken: { not: null } } }),
      prisma.fan.count(),
      prisma.externalPaymentClaim.count({ where: { status: "pending" } }),
      prisma.externalPaymentClaim.count({ where: { status: "confirmed" } }),
      prisma.message.count(),
      prisma.transaction.count(),
      // Incasso REALE con vincolo di prelievo (Creator.withdrawalHoldDays), non più
      // solo un totale unico — vedi services/earnings.ts.
      computeAllCreatorsEarnings(),
    ]);

  res.json({
    totalCreators,
    activeBots,
    totalFans,
    pendingClaims,
    approvedClaims: confirmedClaims,
    totalMessages,
    transactionCount,
    totalEarningsCents: earnings.totalCents,
    totalEarningsFormatted: `€${(earnings.totalCents / 100).toFixed(2)}`,
    pendingCents: earnings.pendingCents,
    pendingFormatted: `€${(earnings.pendingCents / 100).toFixed(2)}`,
    withdrawableCents: earnings.withdrawableCents,
    withdrawableFormatted: `€${(earnings.withdrawableCents / 100).toFixed(2)}`,
  });
});

// Elenco transazioni reali, per audit/dettaglio in dashboard.
dashboardRouter.get("/transactions", async (req, res) => {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : undefined;
  const transactions = await prisma.transaction.findMany({
    where: creatorId ? { creatorId } : undefined,
    include: { fan: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(transactions);
});

dashboardRouter.post("/queue/:id/retry", async (req, res) => {
  const item = await prisma.outboundQueueItem.update({
    where: { id: req.params.id },
    data: { status: "pending", attempts: 0, lastError: null, scheduledAt: new Date() },
  });
  res.json(item);
});
