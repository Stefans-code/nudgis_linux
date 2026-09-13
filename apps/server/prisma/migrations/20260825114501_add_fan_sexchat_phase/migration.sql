-- Aggiunge un campo dedicato alla fase della sexchat state machine, separato dal
-- folderTag usato manualmente dall'admin nel pannello per taggare le cartelle fan.
ALTER TABLE "Fan" ADD COLUMN "sexchatPhase" TEXT;
