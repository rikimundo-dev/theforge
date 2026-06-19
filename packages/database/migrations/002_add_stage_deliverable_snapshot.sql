-- P0.1: Stage deliverable snapshot for brownfield historical views
ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "deliverableSnapshot" JSONB;
