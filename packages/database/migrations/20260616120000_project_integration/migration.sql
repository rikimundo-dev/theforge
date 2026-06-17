-- Cross-project integration: NEW ↔ LEGACY handoff, traces, stage snapshot

CREATE TYPE "IntegrationTraceStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'IMPLEMENTED', 'REJECTED');

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "linkedLegacyProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "linkedNewProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "integrationHandoff" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "integrationHandoffUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "linkedNewProjectId" TEXT;
ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "handoffSnapshot" JSONB;
ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "handoffImportedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Project_linkedLegacyProjectId_idx" ON "Project"("linkedLegacyProjectId");
CREATE INDEX IF NOT EXISTS "Project_linkedNewProjectId_idx" ON "Project"("linkedNewProjectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_linkedLegacyProjectId_fkey') THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_linkedLegacyProjectId_fkey"
      FOREIGN KEY ("linkedLegacyProjectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_linkedNewProjectId_fkey') THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_linkedNewProjectId_fkey"
      FOREIGN KEY ("linkedNewProjectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "IntegrationTrace" (
  "id" TEXT NOT NULL,
  "newProjectId" TEXT NOT NULL,
  "legacyProjectId" TEXT NOT NULL,
  "newLegId" TEXT NOT NULL,
  "legacyStoryId" TEXT,
  "legacyStageId" TEXT,
  "screenOrEndpoint" TEXT,
  "status" "IntegrationTraceStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationTrace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationTrace_newProjectId_legacyProjectId_newLegId_key"
  ON "IntegrationTrace"("newProjectId", "legacyProjectId", "newLegId");
CREATE INDEX IF NOT EXISTS "IntegrationTrace_legacyProjectId_idx" ON "IntegrationTrace"("legacyProjectId");
CREATE INDEX IF NOT EXISTS "IntegrationTrace_newProjectId_idx" ON "IntegrationTrace"("newProjectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationTrace_newProjectId_fkey') THEN
    ALTER TABLE "IntegrationTrace"
      ADD CONSTRAINT "IntegrationTrace_newProjectId_fkey"
      FOREIGN KEY ("newProjectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationTrace_legacyProjectId_fkey') THEN
    ALTER TABLE "IntegrationTrace"
      ADD CONSTRAINT "IntegrationTrace_legacyProjectId_fkey"
      FOREIGN KEY ("legacyProjectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
