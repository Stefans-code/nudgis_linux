import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { revokeToken } from "../services/tokenBlacklist";

export const authRouter = Router();

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "default_development_jwt_secret_change_in_production_32_bytes";

// Login Lockout Rate Limiter persistito su DB (Max 5 tentativi falliti per IP in 15 minuti).
// Prima era una Map in-memoria: si azzerava ad ogni riavvio del server e non funzionava
// con più istanze/repliche dietro un load balancer.
const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

authRouter.post("/login", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
  const now = new Date();

  const record = await prisma.loginAttempt.findUnique({ where: { ip } });
  if (record?.lockoutUntil && record.lockoutUntil > now) {
    const remainingSec = Math.ceil((record.lockoutUntil.getTime() - now.getTime()) / 1000);
    return res.status(429).json({ error: `Troppi tentativi falliti. Riprova tra ${remainingSec} secondi.` });
  }

  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email e password richiesti" });

  const user = await prisma.adminUser.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const attempts = (record?.count || 0) + 1;
    if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
      await prisma.loginAttempt.upsert({
        where: { ip },
        update: { count: attempts, lockoutUntil: new Date(now.getTime() + LOCKOUT_MS) },
        create: { ip, count: attempts, lockoutUntil: new Date(now.getTime() + LOCKOUT_MS) },
      });
      return res.status(429).json({ error: "Account temporaneamente bloccato per troppi tentativi errati (15 minuti)." });
    }
    await prisma.loginAttempt.upsert({
      where: { ip },
      update: { count: attempts, lockoutUntil: null },
      create: { ip, count: attempts, lockoutUntil: null },
    });
    return res.status(401).json({ error: "Credenziali non valide" });
  }

  // Reset tentativi falliti su login riuscito
  await prisma.loginAttempt.deleteMany({ where: { ip } });

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: "12h",
  });
  // Il ruolo torna anche fuori dal JWT: il frontend lo usa per mostrare/nascondere le
  // sezioni riservate agli owner (gestione utenti, creazione/eliminazione creator, ecc.)
  // senza dover decodificare il token lato client.
  res.json({ token, role: user.role, email: user.email });
});

// Logout sicuro con revoca del Token JWT
authRouter.post("/logout", async (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    await revokeToken(header.slice(7));
  }
  res.json({ message: "Logout effettuato e token revocato con successo" });
});
