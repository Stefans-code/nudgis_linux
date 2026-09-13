import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireCreatorAccessParam } from "./creatorAccess";

export const followUpRouter = Router();

const input = z.object({
  isEnabled: z.boolean().optional(),
  template: z.string().min(1).optional(),
  templateVariant2: z.string().optional(),
  templateVariant3: z.string().optional(),
  minHoursSinceLastMessage: z.number().int().positive().optional(),
  maxPerDay: z.number().int().positive().optional(),
});

followUpRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const rule = await prisma.followUpRule.findUnique({ where: { creatorId: req.params.creatorId } });
  res.json(rule);
});

followUpRouter.patch("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const rule = await prisma.followUpRule.upsert({
    where: { creatorId: req.params.creatorId },
    update: parsed.data,
    create: { creatorId: req.params.creatorId, ...parsed.data },
  });
  res.json(rule);
});
