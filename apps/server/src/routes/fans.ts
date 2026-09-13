import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const fansRouter = Router();

async function resolveCreatorIdForFan(id: string) {
  const fan = await prisma.fan.findUnique({ where: { id }, select: { creatorId: true } });
  return fan?.creatorId ?? null;
}

// brief pagina 1: "auto-aggiungere clienti a cartella chat Telegram se possibile".
// La Bot API non permette di creare/modificare le cartelle chat dell'account
// personale: serve una sessione utente MTProto autorizzata dal proprietario
// dell'account (login one-time via routes/telegramAuth.ts). Se quella sessione è
// collegata, l'endpoint sotto crea DAVVERO la cartella; altrimenti resta disponibile
// il tag interno "folderTag" gestito qui sotto come fallback sempre funzionante.
import { createOrUpdateRealFolder, generateShareableFolderLink, isFolderSessionConnected } from "../services/telegramMtproto";

fansRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const fans = await prisma.fan.findMany({
    where: { creatorId: req.params.creatorId },
    orderBy: { lastMessageAt: "desc" },
  });
  res.json(fans);
});

fansRouter.patch("/:id/folder", requireCreatorAccessViaResource(resolveCreatorIdForFan), async (req, res) => {
  const { folderTag } = req.body ?? {};
  const fan = await prisma.fan.update({ where: { id: req.params.id }, data: { folderTag } });
  res.json(fan);
});

fansRouter.get("/telegram-folder-status", async (_req, res) => {
  res.json({ connected: await isFolderSessionConnected() });
});

// Crea/aggiorna DAVVERO una cartella chat Telegram (MTProto) con dentro i fan
// selezionati, se una sessione utente è stata collegata (vedi /admin/telegram-auth).
// Se non è collegata nessuna sessione, risponde 409 con istruzioni chiare invece di
// fingere di aver fatto qualcosa: niente più payload "finto" restituito come se fosse fatto.
fansRouter.post("/creator/:creatorId/mtproto-folder", requireCreatorAccessParam(), async (req, res) => {
  const { folderTitle, folderId = 1, folderTag } = req.body ?? {};

  if (!(await isFolderSessionConnected())) {
    return res.status(409).json({
      error:
        "Nessuna sessione Telegram personale collegata. Completa il login MTProto (numero + codice SMS) prima di poter creare cartelle reali.",
      requiresLogin: true,
    });
  }

  const fans = await prisma.fan.findMany({
    where: { creatorId: req.params.creatorId, folderTag: folderTag || undefined },
    select: { telegramChatId: true },
  });

  try {
    const result = await createOrUpdateRealFolder({
      folderId: Number(folderId),
      folderTitle: folderTitle || "Fan VIP",
      includeChatIds: fans.map((f) => f.telegramChatId),
    });

    res.json({
      message: "Cartella Telegram creata/aggiornata con successo.",
      ...result,
      shareableLink: generateShareableFolderLink(folderTitle || "fan-vip"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Errore durante la creazione della cartella Telegram" });
  }
});

fansRouter.get("/:id/messages", requireCreatorAccessViaResource(resolveCreatorIdForFan), async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { fanId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

// --- GDPR: diritto di accesso e diritto all'oblio sui dati del fan ---
// Non è consulenza legale: è la parte tecnica (export/cancellazione dati) che un DPO/
// avvocato può chiedere di implementare. Vedi docs/gdpr-data-handling.md per il quadro
// completo (quali dati, perché, quanto restano).

// Diritto di accesso: esporta tutti i dati personali collegati al fan in un unico JSON.
fansRouter.get("/:id/gdpr-export", requireCreatorAccessViaResource(resolveCreatorIdForFan), async (req, res) => {
  const fan = await prisma.fan.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      paymentClaims: true,
      transactions: true, // qui il fanId è ancora presente, non ancora anonimizzato
    },
  });
  if (!fan) return res.status(404).json({ error: "Fan non trovato" });

  res.setHeader("Content-Disposition", `attachment; filename="fan-${fan.id}-dati-personali.json"`);
  res.json({ exportedAt: new Date().toISOString(), fan });
});

// Diritto all'oblio: cancella i dati personali del fan. I messaggi e le richieste di
// verifica pagamento vengono cancellati (CASCADE nello schema). Le Transaction
// (incassi reali, rilevanti per contabilità/fiscalità) NON vengono cancellate ma
// perdono il collegamento al fan (Transaction.fanId -> SetNull nello schema): resta
// la prova contabile dell'incasso, sparisce il legame con la persona identificabile.
fansRouter.delete("/:id/gdpr-erase", requireCreatorAccessViaResource(resolveCreatorIdForFan), async (req, res) => {
  const fan = await prisma.fan.findUnique({ where: { id: req.params.id } });
  if (!fan) return res.status(404).json({ error: "Fan non trovato" });

  await prisma.fan.delete({ where: { id: req.params.id } });

  res.json({
    erased: true,
    note: "Messaggi e richieste di pagamento eliminati. Le transazioni contabili sono state mantenute in forma anonima (senza collegamento al fan).",
  });
});
