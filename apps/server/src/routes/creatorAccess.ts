import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

/**
 * Controllo di accesso multi-operatore: un "owner" vede sempre tutto, un "chatter" vede
 * SOLO le creator esplicitamente assegnategli (AdminCreatorAccess) — pensato per
 * un'agenzia con più chatter che gestiscono creator/clienti diversi tra loro, senza
 * vedersi a vicenda i dati (fan, contenuti, guadagni, istruzioni custom).
 */
export async function hasCreatorAccess(adminUserId: string, role: string, creatorId: string): Promise<boolean> {
  if (role === "owner") return true;
  const access = await prisma.adminCreatorAccess.findUnique({
    where: { adminUserId_creatorId: { adminUserId, creatorId } },
  });
  return !!access;
}

/**
 * Middleware per le route con :creatorId direttamente nel path (es. "/creator/:creatorId").
 */
export function requireCreatorAccessParam(paramName: string = "creatorId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const admin = req.adminUser;
    if (!admin) return res.status(401).json({ error: "Non autenticato" });

    const creatorId = req.params[paramName];
    if (!creatorId) return res.status(400).json({ error: `Parametro ${paramName} mancante` });

    if (await hasCreatorAccess(admin.sub, admin.role, creatorId)) return next();
    res.status(403).json({ error: "Non hai accesso a questa creator." });
  };
}

/**
 * Middleware per le route su una risorsa figlia identificata solo da :id (es.
 * "/content-items/:id"), dove il creatorId va risolto guardando la risorsa stessa.
 * `resolveCreatorId` isola la query specifica per ogni tipo di risorsa.
 */
export function requireCreatorAccessViaResource(
  resolveCreatorId: (id: string) => Promise<string | null>,
  paramName: string = "id"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const admin = req.adminUser;
    if (!admin) return res.status(401).json({ error: "Non autenticato" });

    const resourceId = req.params[paramName];
    const creatorId = await resolveCreatorId(resourceId);
    if (!creatorId) return res.status(404).json({ error: "Risorsa non trovata" });

    if (await hasCreatorAccess(admin.sub, admin.role, creatorId)) return next();
    res.status(403).json({ error: "Non hai accesso alla creator di questa risorsa." });
  };
}
