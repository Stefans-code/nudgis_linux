import { Router } from "express";
import { z } from "zod";
import {
  startLogin,
  submitLoginCode,
  submitLoginPassword,
  getLoginStatus,
  isFolderSessionConnected,
  disconnectFolderSession,
} from "../services/telegramMtproto";

export const telegramAuthRouter = Router();

// Login MTProto in 3 step (numero → codice SMS → eventuale password 2FA). Va fatto
// UNA VOLTA dall'operatore Telegram che possiede l'account da cui gestire le cartelle
// reali; il codice arriva sul suo telefono, non può essere automatizzato.

telegramAuthRouter.get("/status", async (_req, res) => {
  const connected = await isFolderSessionConnected();
  res.json({ connected });
});

const startInput = z.object({ phoneNumber: z.string().min(6) });
telegramAuthRouter.post("/start", async (req, res) => {
  const parsed = startInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await startLogin(parsed.data.phoneNumber);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Errore avvio login Telegram" });
  }
});

const codeInput = z.object({ phoneNumber: z.string().min(6), code: z.string().min(3) });
telegramAuthRouter.post("/code", (req, res) => {
  const parsed = codeInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    submitLoginCode(parsed.data.phoneNumber, parsed.data.code);
    res.json({ status: "code_submitted" });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Errore invio codice" });
  }
});

const passwordInput = z.object({ phoneNumber: z.string().min(6), password: z.string().min(1) });
telegramAuthRouter.post("/password", (req, res) => {
  const parsed = passwordInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    submitLoginPassword(parsed.data.phoneNumber, parsed.data.password);
    res.json({ status: "password_submitted" });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Errore invio password" });
  }
});

telegramAuthRouter.get("/status/:phoneNumber", async (req, res) => {
  const result = await getLoginStatus(req.params.phoneNumber);
  res.json(result);
});

telegramAuthRouter.post("/disconnect", async (_req, res) => {
  await disconnectFolderSession();
  res.json({ status: "disconnected" });
});
