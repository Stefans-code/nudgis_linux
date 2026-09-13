import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { invalidateGlobalRulesCache } from "../services/llm/promptCache";

export const globalRulesRouter = Router();

const DEFAULT_GLOBAL_RULES = [
  {
    title: "Minimo messaggi prima di vendita",
    content: "Manda almeno {paramValue} messaggi di conversazione prima di proporre o inviare dei contenuti a pagamento.",
    ruleType: "number",
    paramValue: "5",
    targetAudience: "all",
    unitLabel: "messaggi",
    sortOrder: 1,
  },
  {
    title: "Gestione Listino Prezzi Completo",
    content: "Non inviare mai il listino prezzi completo in un unico messaggio. Chiedi prima desideri e budget del fan.",
    ruleType: "toggle",
    paramValue: "true",
    targetAudience: "all",
    unitLabel: "",
    sortOrder: 2,
  },
  {
    title: "Erogazione Prezzi Sexchat e Live",
    content: "Se chiedono il listino o prezzi sexchat, spiega che su Telegram invii contenuti live da sbloccare o prenotabili con link Tribute.",
    ruleType: "select",
    paramValue: "tribute_and_stars",
    targetAudience: "all",
    unitLabel: "",
    sortOrder: 3,
  },
  {
    title: "Servizio Dickrate a Pagamento",
    content: "Se chiedono un dickrate, chiarisci che si tratta di un servizio a pagamento dal costo fisso pari a {paramValue}€.",
    ruleType: "number",
    paramValue: "15",
    targetAudience: "all",
    unitLabel: "€",
    sortOrder: 4,
  },
  {
    title: "Strategia Relazionale & Compagnia",
    content: "Se un fan predilige la conversazione e la compagnia rispetto ai soli contenuti, allunga il chatting rendendolo personale prima di proporre il contenuto successivo.",
    ruleType: "select",
    paramValue: "lengthen_chat",
    targetAudience: "active_chatters",
    unitLabel: "",
    sortOrder: 5,
  },
  {
    title: "Tempistica Verifica Pagamenti Esterni",
    content: "Se un fan dichiara un pagamento esterno, crea la richiesta tracciata nel sistema e rispondi con l'esito entro {paramValue} ore.",
    ruleType: "number",
    paramValue: "24",
    targetAudience: "all",
    unitLabel: "ore",
    sortOrder: 6,
  },
];

const input = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  ruleType: z.string().optional().default("text"),
  paramValue: z.string().optional().default(""),
  targetAudience: z.string().optional().default("all"),
  unitLabel: z.string().optional().default(""),
  isEnabled: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
});

// GET all global rules (seed default if empty)
globalRulesRouter.get("/", async (_req, res) => {
  let rules = await prisma.globalRule.findMany({
    orderBy: { sortOrder: "asc" },
  });

  if (rules.length === 0) {
    await prisma.globalRule.createMany({ data: DEFAULT_GLOBAL_RULES });
    rules = await prisma.globalRule.findMany({ orderBy: { sortOrder: "asc" } });
  }

  res.json(rules);
});

// POST add new global rule
globalRulesRouter.post("/", async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const rule = await prisma.globalRule.create({ data: parsed.data });
  invalidateGlobalRulesCache(); // le regole hanno cache TTL 60s: senza invalidazione una modifica ci mette fino a 1 minuto a propagarsi al bot
  res.status(201).json(rule);
});

// PATCH update/toggle global rule
globalRulesRouter.patch("/:id", async (req, res) => {
  const parsed = input.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const rule = await prisma.globalRule.update({ where: { id: req.params.id }, data: parsed.data });
  invalidateGlobalRulesCache();
  res.json(rule);
});

// DELETE global rule
globalRulesRouter.delete("/:id", async (req, res) => {
  await prisma.globalRule.delete({ where: { id: req.params.id } });
  invalidateGlobalRulesCache();
  res.status(204).end();
});
