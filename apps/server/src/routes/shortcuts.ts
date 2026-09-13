import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const shortcutsRouter = Router();

async function resolveCreatorIdForShortcut(id: string) {
  const item = await prisma.creatorShortcut.findUnique({ where: { id }, select: { creatorId: true } });
  return item?.creatorId ?? null;
}

function normalizeCommand(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const input = z.object({
  command: z.string().min(1),
  content: z.string().min(1),
});

shortcutsRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const items = await prisma.creatorShortcut.findMany({
    where: { creatorId: req.params.creatorId },
    orderBy: { command: "asc" },
  });
  res.json(items);
});

shortcutsRouter.post("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.creatorShortcut.create({
    data: { creatorId: req.params.creatorId, command: normalizeCommand(parsed.data.command), content: parsed.data.content },
  });
  res.status(201).json(item);
});

shortcutsRouter.patch("/:id", requireCreatorAccessViaResource(resolveCreatorIdForShortcut), async (req, res) => {
  const parsed = input.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = { ...parsed.data };
  if (data.command) data.command = normalizeCommand(data.command);

  const item = await prisma.creatorShortcut.update({ where: { id: req.params.id }, data });
  res.json(item);
});

shortcutsRouter.delete("/:id", requireCreatorAccessViaResource(resolveCreatorIdForShortcut), async (req, res) => {
  await prisma.creatorShortcut.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
