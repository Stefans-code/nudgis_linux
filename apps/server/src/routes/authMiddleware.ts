import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { isTokenRevoked } from "../services/tokenBlacklist";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "default_development_jwt_secret_change_in_production_32_bytes";

export type AdminRole = "owner" | "chatter";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
}

// Estende il tipo Request di Express per portarsi dietro l'utente admin decodificato
// (id, email, ruolo), così le route/i middleware successivi non devono riverificare il JWT.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminJwtPayload;
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Non autenticato: Token mancante" });

  const token = header.slice(7);

  let payload: AdminJwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload;
  } catch {
    return res.status(401).json({ error: "Token non valido o scaduto" });
  }

  // Controllo revoca JWT (Logout), persistito su DB.
  if (await isTokenRevoked(token)) {
    return res.status(401).json({ error: "Token revocato: effettuare nuovamente il login" });
  }

  req.adminUser = payload;
  next();
}

/** Solo per gli "owner": creazione/eliminazione creator, gestione utenti admin, regole globali. */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.adminUser?.role !== "owner") {
    return res.status(403).json({ error: "Azione riservata agli owner." });
  }
  next();
}
