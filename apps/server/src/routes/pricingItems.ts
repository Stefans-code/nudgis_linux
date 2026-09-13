import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const pricingItemsRouter = Router();

async function resolveCreatorIdForPricingItem(id: string) {
  const item = await prisma.pricingItem.findUnique({ where: { id }, select: { creatorId: true } });
  return item?.creatorId ?? null;
}

const input = z.object({
  category: z.string().min(1), // es. "videocall" | "custom_video"
  label: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().optional().default("EUR"),
  sortOrder: z.number().optional().default(0),
});

pricingItemsRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const items = await prisma.pricingItem.findMany({
    where: { creatorId: req.params.creatorId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  res.json(items);
});

pricingItemsRouter.post("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.pricingItem.create({ data: { ...parsed.data, creatorId: req.params.creatorId } });
  res.status(201).json(item);
});

pricingItemsRouter.patch("/:id", requireCreatorAccessViaResource(resolveCreatorIdForPricingItem), async (req, res) => {
  const parsed = input.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.pricingItem.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(item);
});

pricingItemsRouter.delete("/:id", requireCreatorAccessViaResource(resolveCreatorIdForPricingItem), async (req, res) => {
  await prisma.pricingItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
