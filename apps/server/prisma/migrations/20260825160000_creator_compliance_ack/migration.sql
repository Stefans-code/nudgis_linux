-- Attestazione di responsabilità legale per creator (età fan, ToS provider LLM, GDPR):
-- il bot non parte finché non è valorizzata.
ALTER TABLE "Creator" ADD COLUMN "complianceAcknowledgedAt" DATETIME;
ALTER TABLE "Creator" ADD COLUMN "complianceAcknowledgedByAdminUserId" TEXT;
