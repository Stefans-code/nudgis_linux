-- Ruoli admin (owner = accesso completo, chatter = solo creator assegnate) + tabella
-- di assegnazione creator<->chatter. Gli AdminUser esistenti diventano "owner" di
-- default, così il comportamento attuale (unico admin, accesso a tutto) non cambia
-- per chi già usa il sistema.
ALTER TABLE "AdminUser" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'owner';

CREATE TABLE "AdminCreatorAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminCreatorAccess_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminCreatorAccess_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminCreatorAccess_adminUserId_creatorId_key" ON "AdminCreatorAccess"("adminUserId", "creatorId");
