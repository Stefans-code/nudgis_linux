-- Le 4 funzioni viste negli screenshot reali del prodotto di riferimento.
ALTER TABLE "Creator" ADD COLUMN "withdrawalHoldDays" INTEGER NOT NULL DEFAULT 21;

ALTER TABLE "Fan" ADD COLUMN "lastQuickReengagementAt" DATETIME;

ALTER TABLE "FollowUpRule" ADD COLUMN "quickReengagementEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FollowUpRule" ADD COLUMN "quickReengagementTemplate" TEXT NOT NULL DEFAULT 'Ci sei ancora? 😊';
ALTER TABLE "FollowUpRule" ADD COLUMN "quickReengagementMinMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "FollowUpRule" ADD COLUMN "quickReengagementMaxMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE "CreatorShortcut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorShortcut_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatorShortcut_creatorId_command_key" ON "CreatorShortcut"("creatorId", "command");
