-- MDD Auditor: instancia de proveedor dedicada (opcional; si null, usa la activa/default).
ALTER TABLE "UserAISettings" ADD COLUMN IF NOT EXISTS "mddAuditorTenantInstanceId" TEXT;

ALTER TABLE "UserAISettings" DROP CONSTRAINT IF EXISTS "UserAISettings_mddAuditorTenantInstanceId_fkey";
ALTER TABLE "UserAISettings" ADD CONSTRAINT "UserAISettings_mddAuditorTenantInstanceId_fkey"
  FOREIGN KEY ("mddAuditorTenantInstanceId") REFERENCES "ProviderInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
