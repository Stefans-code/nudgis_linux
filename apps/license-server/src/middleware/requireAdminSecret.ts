import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

/**
 * Autenticazione minimale per le route /admin/*: un singolo segreto condiviso
 * (LICENSE_ADMIN_SECRET), non un vero sistema di login — questo è uno strumento
 * interno per l'ufficio che vende le licenze, non un pannello multi-utente.
 * Confronto a tempo costante per evitare timing attack banali.
 */
export function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-admin-secret"];
  const expected = process.env.LICENSE_ADMIN_SECRET;

  if (!expected) {
    return res.status(500).json({ error: "LICENSE_ADMIN_SECRET non configurato sul server." });
  }
  if (typeof provided !== "string") {
    return res.status(401).json({ error: "Header x-admin-secret mancante." });
  }

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  const isValid = providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!isValid) return res.status(401).json({ error: "Segreto non valido." });
  next();
}
