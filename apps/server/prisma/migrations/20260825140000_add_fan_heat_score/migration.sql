-- Media mobile persistente dell'interesse del fan (memoria oltre gli ultimi 6 messaggi).
ALTER TABLE "Fan" ADD COLUMN "heatScore" REAL NOT NULL DEFAULT 0;
