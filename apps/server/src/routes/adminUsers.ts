import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

export const adminUsersRouter = Router();

// Tutte le route qui sotto sono già protette da requireOwner a livello di mount in index.ts.

adminUsersRouter.get("/", async (_req, res) => {
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      creatorAccess: { select: { creatorId: true, creator: { select: { name: true } } } },
    },
  });
  res.json(users);
});

const createInput = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Minimo 8 caratteri"),
  role: z.enum(["owner", "chatter"]).default("chatter"),
  creatorIds: z.array(z.string()).optional().default([]), // ignorato se role="owner"
});

adminUsersRouter.post("/", async (req, res) => {
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "Email già in uso" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.adminUser.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      creatorAccess:
        parsed.data.role === "chatter" && parsed.data.creatorIds.length
          ? { createMany: { data: parsed.data.creatorIds.map((creatorId) => ({ creatorId })) } }
          : undefined,
    },
  });

  res.status(201).json({ id: user.id, email: user.email, role: user.role });
});

const updateInput = z.object({
  password: z.string().min(8).optional(),
  role: z.enum(["owner", "chatter"]).optional(),
  creatorIds: z.array(z.string()).optional(), // se presente, SOSTITUISCE l'elenco assegnato
});

adminUsersRouter.patch("/:id", async (req, res) => {
  const parsed = updateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: Record<string, unknown> = {};
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  if (parsed.data.role) {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (target?.role === "owner" && parsed.data.role !== "owner") {
      const ownerCount = await prisma.adminUser.count({ where: { role: "owner" } });
      if (ownerCount <= 1) {
        return res.status(400).json({ error: "Impossibile retrocedere l'unico owner rimasto." });
      }
    }
    data.role = parsed.data.role;
  }

  if (parsed.data.creatorIds) {
    await prisma.adminCreatorAccess.deleteMany({ where: { adminUserId: req.params.id } });
    if (parsed.data.creatorIds.length) {
      await prisma.adminCreatorAccess.createMany({
        data: parsed.data.creatorIds.map((creatorId) => ({ adminUserId: req.params.id, creatorId })),
      });
    }
  }

  const user = await prisma.adminUser.update({ where: { id: req.params.id }, data });
  res.json({ id: user.id, email: user.email, role: user.role });
});

adminUsersRouter.delete("/:id", async (req, res) => {
  // Impedisce di restare senza nessun owner (il sistema diventerebbe inaccessibile
  // per la gestione utenti/creator).
  const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Utente non trovato" });

  if (target.role === "owner") {
    const ownerCount = await prisma.adminUser.count({ where: { role: "owner" } });
    if (ownerCount <= 1) {
      return res.status(400).json({ error: "Impossibile eliminare l'unico owner rimasto." });
    }
  }

  await prisma.adminUser.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
