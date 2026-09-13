import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { enqueueOutbound } from "../services/outboundQueue";
import { requireCreatorAccessParam, requireCreatorAccessViaResource } from "./creatorAccess";

export const paymentClaimsRouter = Router();

async function resolveCreatorIdForClaim(id: string) {
  const claim = await prisma.externalPaymentClaim.findUnique({ where: { id }, select: { fan: { select: { creatorId: true } } } });
  return claim?.fan.creatorId ?? null;
}

// Elenco richieste di verifica pagamento esterno per un creator (join su Fan).
paymentClaimsRouter.get("/creator/:creatorId", requireCreatorAccessParam(), async (req, res) => {
  const claims = await prisma.externalPaymentClaim.findMany({
    where: { fan: { creatorId: req.params.creatorId } },
    include: { fan: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(claims);
});

const resolveInput = z
  .object({
    status: z.enum(["confirmed", "not_found"]),
    resolutionNote: z.string().optional(),
    // messaggio onesto da mandare al fan con l'esito reale, indipendentemente dal risultato
    replyToFan: z.string().min(1),
    // importo REALE confermato (in centesimi): obbligatorio solo se status="confirmed",
    // così la dashboard mostra un incasso vero e non più una stima fissa.
    amountCents: z.number().int().positive().optional(),
    currency: z.string().optional().default("EUR"),
  })
  .refine((data) => data.status !== "confirmed" || typeof data.amountCents === "number", {
    message: "amountCents è obbligatorio quando lo stato è 'confirmed', per registrare l'incasso reale.",
    path: ["amountCents"],
  });

// Chiude davvero la verifica: registra l'esito E manda al fan la risposta reale,
// così "controllo e ti rispondo" non resta una promessa vuota. Se confermato, registra
// anche l'incasso reale in Transaction (usato dalla dashboard invece di una stima).
paymentClaimsRouter.post("/:id/resolve", requireCreatorAccessViaResource(resolveCreatorIdForClaim), async (req, res) => {
  const parsed = resolveInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const claim = await prisma.externalPaymentClaim.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote,
      resolvedAt: new Date(),
    },
    include: { fan: true },
  });

  if (parsed.data.status === "confirmed" && parsed.data.amountCents) {
    await prisma.transaction.create({
      data: {
        creatorId: claim.fan.creatorId,
        fanId: claim.fanId,
        source: "payment_claim",
        description: `Pagamento esterno confermato: "${claim.fanMessage.slice(0, 80)}"`,
        amountCents: parsed.data.amountCents,
        currency: parsed.data.currency,
        // Snapshot per rendere misurabile in futuro se le vendite si concentrano in una
        // fase/heat particolare (non un A/B test, ma dati reali su cui ragionare dopo).
        fanSexchatPhaseAtSale: claim.fan.sexchatPhase,
        fanHeatScoreAtSale: claim.fan.heatScore,
      },
    });
  }

  await enqueueOutbound(claim.fanId, parsed.data.replyToFan);

  res.json(claim);
});
