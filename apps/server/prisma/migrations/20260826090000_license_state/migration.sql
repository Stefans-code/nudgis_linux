-- Stato cache della licenza (phone-home verso apps/license-server).
CREATE TABLE "LicenseState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "instanceId" TEXT NOT NULL,
    "cachedStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "cachedExpiresAt" DATETIME,
    "cachedMaxCreators" INTEGER,
    "cachedCustomerName" TEXT,
    "lastCheckAt" DATETIME,
    "lastValidAt" DATETIME,
    "lastError" TEXT
);
