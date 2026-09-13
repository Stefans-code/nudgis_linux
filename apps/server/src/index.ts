import "dotenv/config";
import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import { getAppBaseDir } from "./lib/paths";
import { authRouter } from "./routes/auth";
import { requireAdmin, requireOwner } from "./routes/authMiddleware";
import { creatorsRouter } from "./routes/creators";
import { adminUsersRouter } from "./routes/adminUsers";
import { extraInstructionsRouter } from "./routes/extraInstructions";
import { contentItemsRouter } from "./routes/contentItems";
import { pricingItemsRouter } from "./routes/pricingItems";
import { fansRouter } from "./routes/fans";
import { followUpRouter } from "./routes/followUp";
import { shortcutsRouter } from "./routes/shortcuts";
import { dashboardRouter } from "./routes/dashboard";
import { paymentClaimsRouter } from "./routes/paymentClaims";
import { globalRulesRouter } from "./routes/globalRules";
import { telegramAuthRouter } from "./routes/telegramAuth";
import { startAllBots } from "./bot";
import { scheduleFollowUpJob } from "./jobs/followUp";
import { scheduleQuickReengagementJob } from "./jobs/quickReengagement";
import { scheduleDatabaseBackupJob } from "./jobs/dbBackup";
import { scheduleSecurityCleanupJob } from "./jobs/cleanupExpiredSecurity";
import { scheduleLicenseCheckJob } from "./jobs/licenseCheck";
import { checkLicense } from "./services/licensing";
import { bootstrapAdminIfNeeded } from "./services/bootstrapAdmin";
import { autoMigrate } from "./services/autoMigrate";
import { logger } from "./lib/logger";

// Validazione di sicurezza all'avvio (Point 4)
if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 32)) {
  console.error("FATAL: ADMIN_JWT_SECRET non impostato o troppo corto in produzione! Impostare una chiave sicura >= 32 caratteri.");
  process.exit(1);
}

const app = express();

// Security HTTP Headers (Point 7)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));

// Payload Body Limits per prevenire DoS (Point 7)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);

// Tutto ciò che segue richiede login admin
app.use("/admin/creators", requireAdmin, creatorsRouter);
app.use("/admin/extra-instructions", requireAdmin, extraInstructionsRouter);
app.use("/admin/content-items", requireAdmin, contentItemsRouter);
app.use("/admin/pricing-items", requireAdmin, pricingItemsRouter);
app.use("/admin/fans", requireAdmin, fansRouter);
app.use("/admin/follow-up", requireAdmin, followUpRouter);
app.use("/admin/shortcuts", requireAdmin, shortcutsRouter);
// Dashboard aggrega dati (finanziari, code) di TUTTE le creator: riservata agli owner
// per non far vedere a un chatter numeri/incassi di creator che non gli appartengono.
app.use("/admin/dashboard", requireAdmin, requireOwner, dashboardRouter);
app.use("/admin/payment-claims", requireAdmin, paymentClaimsRouter);
// Regole globali e login MTProto sono impostazioni condivise da TUTTE le creator:
// riservate agli owner per evitare che un chatter cambi regole che valgono anche per
// creator di altri chatter, o scolleghi la sessione Telegram condivisa.
app.use("/admin/global-rules", requireAdmin, requireOwner, globalRulesRouter);
app.use("/admin/telegram-auth", requireAdmin, requireOwner, telegramAuthRouter);
// Gestione utenti admin/chatter: solo owner.
app.use("/admin/admin-users", requireAdmin, requireOwner, adminUsersRouter);

// Serve il pannello web (build statica di apps/web) dallo STESSO processo, per la
// distribuzione come eseguibile singolo (pkg): niente nginx/secondo processo separato,
// un solo .exe che espone sia API che interfaccia. In sviluppo normale (npm run
// dev:server + dev:web separati su porte diverse) questa cartella semplicemente non
// esiste e le route sotto restano inattive senza causare errori.
//
// process.pkg è definito solo quando il codice gira DENTRO un eseguibile pkg: in quel
// caso i file statici NON sono nello snapshot ma in una cartella "public" accanto
// all'exe (vedi scripts/build-exe.js), perché pkg gestisce male file binari/grandi
// dentro lo snapshot compresso — vedi lib/paths.ts.
const publicDir = path.join(getAppBaseDir(), "public");

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback: qualunque rotta non-API serve index.html, il routing lo fa React Router.
  app.get(/^(?!\/(admin|auth|health)).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
  logger.info(`[server] Pannello web servito da ${publicDir}`);
}

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  logger.info(`[server] API in ascolto su http://localhost:${port}`);
});

// Ordine di boot: 1) migrazioni DB (idempotente, sicura anche se già applicate dalla
// CLI vera es. in Docker — vedi services/autoMigrate.ts, necessaria per l'exe dove non
// esiste "prisma migrate deploy"), 2) admin iniziale se manca, 3) licenza, 4) bot.
autoMigrate()
  .then(() => bootstrapAdminIfNeeded())
  .then(() => checkLicense())
  .then(() => startAllBots())
  .catch((e) => logger.error("Errore avvio bot:", e));

scheduleFollowUpJob();
scheduleQuickReengagementJob();
scheduleDatabaseBackupJob();
scheduleSecurityCleanupJob();
scheduleLicenseCheckJob();
