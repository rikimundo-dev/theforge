-- BRD / Manual To-Be / As-Is por etapa (antes del MDD técnico).
ALTER TABLE "Stage" ADD COLUMN "brdContent" TEXT,
ADD COLUMN "toBeManualContent" TEXT,
ADD COLUMN "asIsManualContent" TEXT,
ADD COLUMN "brdApprovedAt" TIMESTAMP(3),
ADD COLUMN "toBeApprovedAt" TIMESTAMP(3);
