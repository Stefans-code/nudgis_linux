import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const extraInstructionsRouter = Router();

async function resolveCreatorIdForInstruction(id: string) {
  const item = await prisma.extraInstruction.findUnique({ where: { id }, select: { creatorId: true } });
  return item?.creatorId ?? null;
}

const input = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  isStandard: z.boolean().optional().default(false),
  isEnabled: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
});

// Lista istruzioni di un creator
extraInstructionsRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const items = await prisma.extraInstruction.findMany({
    where: { creatorId: req.params.creatorId },
    orderBy: { sortOrder: "asc" },
  });
  res.json(items);
});

// Crea istruzione: il TESTO lo scrive chi gestisce il pannello (non è precompilato da noi).
extraInstructionsRouter.post("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.extraInstruction.create({
    data: { ...parsed.data, creatorId: req.params.creatorId },
  });
  res.status(201).json(item);
});

extraInstructionsRouter.patch("/:id", requireCreatorAccessViaResource(resolveCreatorIdForInstruction), async (req, res) => {
  const parsed = input.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.extraInstruction.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(item);
});

extraInstructionsRouter.delete("/:id", requireCreatorAccessViaResource(resolveCreatorIdForInstruction), async (req, res) => {
  await prisma.extraInstruction.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
