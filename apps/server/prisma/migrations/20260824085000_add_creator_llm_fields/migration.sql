-- BUG FIX (drift storico): questi campi sono nello schema.prisma ed erano già in uso in
-- tutto il codice (routes/creators.ts, services/llm/index.ts) fin dall'inizio, ma non
-- risultavano MAI creati da nessuna migrazione su disco — erano stati aggiunti al dev.db
-- con un "prisma db push" diretto in una sessione precedente, senza generare la
-- migrazione corrispondente. Risultato: un database nuovo (produzione, CI, un altro
-- sviluppatore, o il DB di test di questa suite) applicando "prisma migrate deploy" da
-- zero otteneva una tabella Creator ROTTA, senza queste colonne, con crash immediati
-- alla prima creazione/lettura di un creator. Trovato dai test di integrazione.
ALTER TABLE "Creator" ADD COLUMN "llmProvider" TEXT NOT NULL DEFAULT 'deepseek';
ALTER TABLE "Creator" ADD COLUMN "llmApiKey" TEXT;
ALTER TABLE "Creator" ADD COLUMN "llmModel" TEXT DEFAULT 'deepseek-chat';
