import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { startAllBots } from "../bot";
import { requireOwner } from "./authMiddleware";
import { requireCreatorAccessParam } from "./creatorAccess";

export const creatorsRouter = Router();

// Default "ollama" (modello locale open-weight), non un provider cloud: DeepSeek,
// Anthropic e OpenAI vietano tutti e tre esplicitamente contenuto sessualmente
// esplicito nei loro Termini d'Uso (vedi warning nel pannello, tab AI Settings) — usarli
// per default per il sexchatting esporrebbe chiunque crei una creator a un rischio non
// dichiarato. Restano comunque selezionabili esplicitamente, sotto la responsabilità di
// chi lo fa (vedi attestazione di responsabilità, Creator.complianceAcknowledgedAt).
const creatorInput = z.object({
  name: z.string().min(1),
  telegramBotToken: z.string().optional(),
  personaPrompt: z.string().optional().default(""),
  llmProvider: z.string().optional().default("ollama"),
  llmApiKey: z.string().optional(),
  llmModel: z.string().optional().default("llama3.2"),
  withdrawalHoldDays: z.number().int().nonnegative().optional(),
});

import { encryptCredential, maskCredential } from "../services/crypto";
import { computeCreatorEarnings } from "../services/earnings";
import { getLlmProviderForCreator } from "../services/llm";
import { generateAiTrainingDraft } from "../services/aiTrainingDraft";
import { getMaxCreators, getLicenseStatusForUi } from "../services/licensing";

creatorsRouter.get("/", async (req, res) => {
  const admin = req.adminUser!;

  // Un chatter vede solo le creator che gli sono state assegnate; un owner le vede tutte.
  const creators = await prisma.creator.findMany({
    where:
      admin.role === "owner"
        ? undefined
        : { chatterAccess: { some: { adminUserId: admin.sub } } },
    orderBy: { createdAt: "desc" },
  });

  const sanitized = creators.map((c) => {
    const apiKeyInfo = maskCredential(c.llmApiKey);
    const tokenInfo = maskCredential(c.telegramBotToken);

    return {
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      personaPrompt: c.personaPrompt,
      llmProvider: c.llmProvider,
      llmModel: c.llmModel,
      hasApiKey: apiKeyInfo.hasCredential,
      apiKeyMasked: apiKeyInfo.masked,
      hasTelegramToken: tokenInfo.hasCredential,
      telegramTokenMasked: tokenInfo.masked,
      createdAt: c.createdAt,
      complianceAcknowledgedAt: c.complianceAcknowledgedAt,
      withdrawalHoldDays: c.withdrawalHoldDays,
    };
  });

  res.json(sanitized);
});

// Guadagni reali di UNA creator, con vincolo di prelievo (Creator.withdrawalHoldDays) —
// usato nell'header della scheda creator invece dei "€0.00" statici di prima.
creatorsRouter.get("/:id/earnings", requireCreatorAccessParam("id"), async (req, res) => {
  const earnings = await computeCreatorEarnings(req.params.id);
  res.json({
    totalCents: earnings.totalCents,
    totalFormatted: `€${(earnings.totalCents / 100).toFixed(2)}`,
    pendingCents: earnings.pendingCents,
    pendingFormatted: `€${(earnings.pendingCents / 100).toFixed(2)}`,
    withdrawableCents: earnings.withdrawableCents,
    withdrawableFormatted: `€${(earnings.withdrawableCents / 100).toFixed(2)}`,
  });
});

// Solo gli owner creano nuove creator (i chatter gestiscono quelle assegnate, non ne aprono di nuove).
creatorsRouter.post("/", requireOwner, async (req, res) => {
  const parsed = creatorInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Limite di licenza (phone-home, vedi services/licensing.ts): no-op se non configurata.
  const maxCreators = await getMaxCreators();
  const currentCount = await prisma.creator.count();
  if (currentCount >= maxCreators) {
    return res.status(403).json({
      error: `Limite di ${maxCreators} creator raggiunto per questa licenza. Contatta chi ti ha venduto Nugis per aumentarlo.`,
    });
  }

  const data = { ...parsed.data };
  if (data.llmApiKey) data.llmApiKey = encryptCredential(data.llmApiKey) || undefined;
  if (data.telegramBotToken) data.telegramBotToken = encryptCredential(data.telegramBotToken) || undefined;

  const creator = await prisma.creator.create({ data });

  // Regole standard di default (non esplicite), applicabili subito, modificabili da qui in poi.
  await prisma.extraInstruction.createMany({
    data: [
      {
        creatorId: creator.id,
        title: "Minimo messaggi prima di contenuti a pagamento",
        content: "Manda almeno 5-6 messaggi in chat prima di proporre o inviare contenuti a pagamento.",
        isStandard: true,
        sortOrder: 1,
      },
      {
        creatorId: creator.id,
        title: "Mai listino completo",
        content: "Non inviare mai il listino prezzi completo al fan in un unico messaggio.",
        isStandard: true,
        sortOrder: 2,
      },
      {
        creatorId: creator.id,
        title: "Chiedi preferenze e budget",
        content: "Prima di proporre contenuti, chiedi cosa desidera il fan e quale budget ha a disposizione.",
        isStandard: true,
        sortOrder: 3,
      },
      {
        creatorId: creator.id,
        title: "Pagamenti esterni alla piattaforma",
        content:
          "Se un fan dice di aver pagato con un metodo esterno alla piattaforma, digli la verità: che stai controllando davvero (la richiesta viene registrata e verificata dal team) e che gli dai una risposta con l'esito entro 24-48h. Non dire 'controllo' per poi non rispondere più: quando la verifica è fatta, comunica sempre l'esito reale, sia se il pagamento risulta confermato sia se non risulta trovato.",
        isStandard: true,
        sortOrder: 4,
      },
    ],
  });

  await prisma.followUpRule.create({
    data: { creatorId: creator.id, isEnabled: false },
  });

  // Seeding listino prezzi predefinito da Slide 4 del Brief (Prezzi Videochiamate & Video Personalizzati)
  await prisma.pricingItem.createMany({
    data: [
      { creatorId: creator.id, category: "videocall", label: "Videochiamata 5 Minuti", priceCents: 3000, currency: "EUR", sortOrder: 1 },
      { creatorId: creator.id, category: "videocall", label: "Videochiamata 10 Minuti", priceCents: 4000, currency: "EUR", sortOrder: 2 },
      { creatorId: creator.id, category: "videocall", label: "Videochiamata 15 Minuti", priceCents: 6000, currency: "EUR", sortOrder: 3 },
      { creatorId: creator.id, category: "custom_video", label: "Video Personalizzato 5 Minuti Soft (Senza Toy)", priceCents: 7000, currency: "USD", sortOrder: 1 },
      { creatorId: creator.id, category: "custom_video", label: "Video Personalizzato 5 Minuti Intenso (Con Toy Classico)", priceCents: 9999, currency: "USD", sortOrder: 2 },
    ],
  });

  startAllBots().catch((e) => console.error("startAllBots:", e));

  res.status(201).json({ id: creator.id, name: creator.name });
});

// Un chatter può modificare le impostazioni (persona, AI) delle creator assegnate —
// è letteralmente il suo lavoro — ma non crearne/eliminarne di nuove.
creatorsRouter.patch("/:id", requireCreatorAccessParam("id"), async (req, res) => {
  const parsed = creatorInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: Record<string, unknown> = { ...parsed.data };
  if (data.llmApiKey) data.llmApiKey = encryptCredential(data.llmApiKey as string) || undefined;
  if (data.telegramBotToken) data.telegramBotToken = encryptCredential(data.telegramBotToken as string) || undefined;

  // Cambiare provider LLM cambia il rischio (ogni provider ha i suoi ToS sul contenuto,
  // vedi tab AI Settings): l'attestazione precedente non è più valida, va rifatta.
  if (parsed.data.llmProvider) {
    const current = await prisma.creator.findUnique({ where: { id: req.params.id }, select: { llmProvider: true } });
    if (current && current.llmProvider !== parsed.data.llmProvider) {
      data.complianceAcknowledgedAt = null;
      data.complianceAcknowledgedByAdminUserId = null;
    }
  }

  const creator = await prisma.creator.update({ where: { id: req.params.id }, data });
  res.json({ id: creator.id, name: creator.name, complianceAcknowledgedAt: creator.complianceAcknowledgedAt });
});

// Attestazione di responsabilità (età fan, ToS provider LLM, GDPR) — vedi bot/index.ts,
// il bot non parte finché non è presente. Chiunque abbia accesso alla creator può
// attivarla (owner o chatter assegnato): è chi materialmente gestisce il profilo.
const complianceAckInput = z.object({ acknowledged: z.literal(true) });
creatorsRouter.post("/:id/compliance-ack", requireCreatorAccessParam("id"), async (req, res) => {
  const parsed = complianceAckInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Serve confermare esplicitamente (acknowledged: true)." });
  }

  const creator = await prisma.creator.update({
    where: { id: req.params.id },
    data: {
      complianceAcknowledgedAt: new Date(),
      complianceAcknowledgedByAdminUserId: req.adminUser!.sub,
    },
  });

  // Se il bot era in attesa solo di questa conferma, prova ad avviarlo subito.
  startAllBots().catch((e) => console.error("startAllBots:", e));

  res.json({ complianceAcknowledgedAt: creator.complianceAcknowledgedAt });
});

// "AI Training Draft": analizza le chat reali già scambiate e propone una bozza di
// istruzioni extra + shortcut, da rivedere e salvare manualmente (non tocca il DB).
creatorsRouter.post("/:id/generate-instructions-from-chats", requireCreatorAccessParam("id"), async (req, res) => {
  const creator = await prisma.creator.findUnique({ where: { id: req.params.id } });
  if (!creator) return res.status(404).json({ error: "Creator non trovata" });

  try {
    const llm = getLlmProviderForCreator(creator);
    const draft = await generateAiTrainingDraft(creator.id, llm);
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Errore durante la generazione della bozza" });
  }
});

// Stato della licenza (phone-home) per mostrare un banner nel pannello — visibile a
// qualunque admin, non solo owner: se scade tutti devono saperlo, non solo chi gestisce le licenze.
creatorsRouter.get("/license-status", async (_req, res) => {
  res.json(await getLicenseStatusForUi());
});

creatorsRouter.delete("/:id", requireOwner, async (req, res) => {
  await prisma.creator.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
