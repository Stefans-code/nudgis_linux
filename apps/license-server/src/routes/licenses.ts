import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAdminSecret } from "../middleware/requireAdminSecret";

// Route amministrative (solo per l'ufficio, protette da LICENSE_ADMIN_SECRET) —
// creare/elencare/modificare/revocare licenze. Montato su /admin/licenses in index.ts.
export const licensesAdminRouter = Router();

// Route pubblica usata dalle installazioni Nugis dei clienti (phone-home), NON protetta
// da LICENSE_ADMIN_SECRET — è la chiave di licenza stessa a fare da credenziale.
// Montata su /validate in index.ts.
export const licenseValidateRouter = Router();

function generateLicenseKey(): string {
  // Formato leggibile per essere comunicato al cliente via email/messaggio:
  // NUGIS-XXXX-XXXX-XXXX-XXXX (20 caratteri esadecimali maiuscoli in 4 blocchi).
  const raw = crypto.randomBytes(10).toString("hex").toUpperCase();
  const blocks = raw.match(/.{1,4}/g) ?? [raw];
  return `NUGIS-${blocks.join("-")}`;
}

function maskKey(key: string): string {
  return `${key.slice(0, 10)}****${key.slice(-4)}`;
}

const createInput = z.object({
  customerName: z.string().min(1),
  expiresAt: z.string().min(1), // ISO date
  maxCreators: z.number().int().positive().optional().default(5),
  notes: z.string().optional().default(""),
});

licensesAdminRouter.use(requireAdminSecret);

licensesAdminRouter.post("/", async (req, res) => {
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const license = await prisma.license.create({
    data: {
      key: generateLicenseKey(),
      customerName: parsed.data.customerName,
      expiresAt: new Date(parsed.data.expiresAt),
      maxCreators: parsed.data.maxCreators,
      notes: parsed.data.notes,
    },
  });

  // La chiave in chiaro viene mostrata SOLO qui, alla creazione: copiarla e comunicarla
  // subito al cliente (via canale sicuro, non email in chiaro se possibile) — nelle
  // liste successive verrà sempre mascherata.
  res.status(201).json(license);
});

licensesAdminRouter.get("/", async (_req, res) => {
  const licenses = await prisma.license.findMany({ orderBy: { createdAt: "desc" } });
  res.json(licenses.map((l) => ({ ...l, key: maskKey(l.key) })));
});

const updateInput = z.object({
  status: z.enum(["active", "revoked"]).optional(),
  expiresAt: z.string().min(1).optional(),
  maxCreators: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

licensesAdminRouter.patch("/:id", async (req, res) => {
  const parsed = updateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.expiresAt) data.expiresAt = new Date(parsed.data.expiresAt);

  const license = await prisma.license.update({ where: { id: req.params.id }, data });
  res.json({ ...license, key: maskKey(license.key) });
});

licensesAdminRouter.delete("/:id", async (req, res) => {
  await prisma.license.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

const validateInput = z.object({
  key: z.string().min(1),
  instanceId: z.string().min(1),
});

licenseValidateRouter.post("/", async (req, res) => {
  const parsed = validateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ valid: false, error: "Richiesta non valida" });

  const license = await prisma.license.findUnique({ where: { key: parsed.data.key } });
  if (!license) {
    return res.status(404).json({ valid: false, error: "Chiave di licenza non riconosciuta" });
  }

  // Traccia l'ultimo check-in per visibilità dell'ufficio (quale cliente ha controllato,
  // da quale installazione, quando) — non blocca la risposta se fallisce.
  await prisma.license
    .update({
      where: { id: license.id },
      data: { lastCheckAt: new Date(), lastCheckInstanceId: parsed.data.instanceId, lastCheckIp: req.ip },
    })
    .catch(() => {});

  const now = new Date();
  if (license.status === "revoked") {
    return res.json({ valid: false, reason: "revoked", message: "Licenza revocata dal venditore." });
  }
  if (license.expiresAt < now) {
    return res.json({ valid: false, reason: "expired", expiresAt: license.expiresAt, message: "Licenza scaduta." });
  }

  res.json({
    valid: true,
    expiresAt: license.expiresAt,
    maxCreators: license.maxCreators,
    customerName: license.customerName,
  });
});
