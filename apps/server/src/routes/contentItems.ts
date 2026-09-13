import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { sendContentItemToFan } from "../bot/handlers";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const contentItemsRouter = Router();

async function resolveCreatorIdForContentItem(id: string) {
  const item = await prisma.contentItem.findUnique({ where: { id }, select: { creatorId: true } });
  return item?.creatorId ?? null;
}

const input = z.object({
  externalId: z.string().min(1),
  folder: z.string().optional().default("generico"),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().optional().default("EUR"),
  mediaUrl: z.string().optional().refine((url) => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false; // Rifiuta protocolli non sicuri (Point 8)
    }
  }, { message: "mediaUrl deve essere un URL HTTP o HTTPS valido" }),
  isActive: z.boolean().optional().default(true),
});

// brief pagina 5: "andrebbero racchiuse per cartelle" -> raggruppiamo per folder qui.
// sblocchi/incassato: calcolati DAVVERO dalle Transaction collegate (prima erano "0"/"€0.00" hardcoded nel frontend).
contentItemsRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const items = await prisma.contentItem.findMany({
    where: { creatorId: req.params.creatorId },
    orderBy: [{ folder: "asc" }, { createdAt: "desc" }],
  });

  const salesByItem = await prisma.transaction.groupBy({
    by: ["contentItemId"],
    where: { creatorId: req.params.creatorId, source: "content_item", contentItemId: { not: null } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const salesMap = new Map(salesByItem.map((s) => [s.contentItemId, s]));

  const itemsWithStats = items.map((item) => {
    const sales = salesMap.get(item.id);
    return {
      ...item,
      unlockCount: sales?._count._all ?? 0,
      earnedCents: sales?._sum.amountCents ?? 0,
    };
  });

  const grouped: Record<string, typeof itemsWithStats> = {};
  for (const item of itemsWithStats) {
    grouped[item.folder] ??= [];
    grouped[item.folder].push(item);
  }
  res.json(grouped);
});

contentItemsRouter.post("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.contentItem.create({
    data: { ...parsed.data, creatorId: req.params.creatorId },
  });
  res.status(201).json(item);
});

contentItemsRouter.patch("/:id", requireCreatorAccessViaResource(resolveCreatorIdForContentItem), async (req, res) => {
  const parsed = input.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.contentItem.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(item);
});

contentItemsRouter.delete("/:id", requireCreatorAccessViaResource(resolveCreatorIdForContentItem), async (req, res) => {
  await prisma.contentItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// Invio manuale di un contenuto singolo a un fan specifico dal pannello admin
// (brief: "caricare contenuti specifici e singoli" / rispondere a richieste tipo "foto piedi live").
// Verifico l'isolamento multi-tenant: l'articolo ed il fan DEVONO appartenere alla stessa creator (Point 9)
contentItemsRouter.post("/:id/send/:fanId", requireCreatorAccessViaResource(resolveCreatorIdForContentItem), async (req, res) => {
  const item = await prisma.contentItem.findUnique({ where: { id: req.params.id } });
  const fan = await prisma.fan.findUnique({ where: { id: req.params.fanId } });

  if (!item || !fan) {
    return res.status(404).json({ error: "Contenuto o Fan non trovato" });
  }

  if (item.creatorId !== fan.creatorId) {
    return res.status(403).json({ error: "Isolamento Creator: Impossibile inviare il contenuto di un'altra creator a questo fan" });
  }

  await sendContentItemToFan(req.params.fanId, req.params.id);
  res.status(202).json({ queued: true });
});

// Marca un contenuto come VENDUTO davvero (il bot non può rilevare da solo un pagamento
// esterno via Tribute/Stars/bonifico: la conferma resta un passaggio umano dell'admin,
// come per i pagamenti esterni). Registra un incasso reale in Transaction, usato dalla
// dashboard invece di una stima fissa.
const markSoldInput = z.object({
  amountCents: z.number().int().positive().optional(), // default: priceCents dell'oggetto
});
contentItemsRouter.post("/:id/mark-sold/:fanId", requireCreatorAccessViaResource(resolveCreatorIdForContentItem), async (req, res) => {
  const parsed = markSoldInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.contentItem.findUnique({ where: { id: req.params.id } });
  const fan = await prisma.fan.findUnique({ where: { id: req.params.fanId } });
  if (!item || !fan) return res.status(404).json({ error: "Contenuto o Fan non trovato" });
  if (item.creatorId !== fan.creatorId) {
    return res.status(403).json({ error: "Isolamento Creator: contenuto e fan non appartengono alla stessa creator" });
  }

  const transaction = await prisma.transaction.create({
    data: {
      creatorId: item.creatorId,
      fanId: fan.id,
      contentItemId: item.id,
      source: "content_item",
      description: `Vendita contenuto: "${item.title}" (#${item.externalId})`,
      amountCents: parsed.data.amountCents ?? item.priceCents,
      currency: item.currency,
      // Snapshot per rendere misurabile in futuro se le vendite si concentrano in una
      // fase/heat particolare (non un A/B test, ma dati reali su cui ragionare dopo).
      fanSexchatPhaseAtSale: fan.sexchatPhase,
      fanHeatScoreAtSale: fan.heatScore,
    },
  });

  res.status(201).json(transaction);
});
