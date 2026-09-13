CREATE TABLE "License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "maxCreators" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastCheckAt" DATETIME,
    "lastCheckInstanceId" TEXT,
    "lastCheckIp" TEXT
);

CREATE UNIQUE INDEX "License_key_key" ON "License"("key");
