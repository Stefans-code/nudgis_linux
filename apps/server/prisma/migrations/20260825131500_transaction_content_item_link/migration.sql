ALTER TABLE "Transaction" ADD COLUMN "contentItemId" TEXT REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Transaction_contentItemId_idx" ON "Transaction"("contentItemId");
