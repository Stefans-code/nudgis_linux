-- Opt-out fan dal follow-up automatico + tetto giornaliero e varianti template
-- (applica i risultati della ricerca sui limiti di automazione Telegram, brief pagina 2).
ALTER TABLE "Fan" ADD COLUMN "followUpOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FollowUpRule" ADD COLUMN "templateVariant2" TEXT;
ALTER TABLE "FollowUpRule" ADD COLUMN "templateVariant3" TEXT;
ALTER TABLE "FollowUpRule" ADD COLUMN "maxPerDay" INTEGER NOT NULL DEFAULT 40;

-- Persistenza su DB di revoca token JWT e rate-limit login (prima in-memory).
CREATE TABLE "RevokedToken" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "revokedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LoginAttempt" (
    "ip" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- Sessione MTProto (GramJS) per le cartelle Telegram reali.
CREATE TABLE "TelegramUserSession" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'owner',
    "phoneNumber" TEXT NOT NULL,
    "sessionString" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
