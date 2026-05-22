-- Safe schema sync: align PostgreSQL with schema.prisma without dropping LangGraph checkpoints or row data.
-- Idempotent: safe to run multiple times.

-- 1. FavoriteProject (missing in some deploys; migration file is not in _prisma_migrations)
CREATE TABLE IF NOT EXISTS "FavoriteProject" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FavoriteProject_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FavoriteProject_userId_projectId_key'
  ) THEN
    ALTER TABLE "FavoriteProject"
      ADD CONSTRAINT "FavoriteProject_userId_projectId_key" UNIQUE ("userId", "projectId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FavoriteProject_userId_fkey'
  ) THEN
    ALTER TABLE "FavoriteProject"
      ADD CONSTRAINT "FavoriteProject_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FavoriteProject_projectId_fkey'
  ) THEN
    ALTER TABLE "FavoriteProject"
      ADD CONSTRAINT "FavoriteProject_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FavoriteProject_userId_idx" ON "FavoriteProject"("userId");

-- 2. Project: merge relicProjectId into theforgeProjectId before dropping orphan column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'relicProjectId'
  ) THEN
    UPDATE "Project"
    SET "theforgeProjectId" = "relicProjectId"
    WHERE "theforgeProjectId" IS NULL AND "relicProjectId" IS NOT NULL;

    ALTER TABLE "Project" DROP COLUMN "relicProjectId";
  END IF;
END $$;

-- 3. LangGraph checkpoint tables (keep data; create if missing)
CREATE TABLE IF NOT EXISTS "public"."checkpoint_migrations" (
  v INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "public"."checkpoints" (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS "public"."checkpoint_blobs" (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  blob BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS "public"."checkpoint_writes" (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  blob BYTEA NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

ALTER TABLE "public"."checkpoint_blobs" ALTER COLUMN "blob" DROP NOT NULL;

INSERT INTO "public"."checkpoint_migrations" (v) VALUES (0) ON CONFLICT (v) DO NOTHING;
INSERT INTO "public"."checkpoint_migrations" (v) VALUES (1) ON CONFLICT (v) DO NOTHING;
INSERT INTO "public"."checkpoint_migrations" (v) VALUES (2) ON CONFLICT (v) DO NOTHING;
INSERT INTO "public"."checkpoint_migrations" (v) VALUES (3) ON CONFLICT (v) DO NOTHING;
INSERT INTO "public"."checkpoint_migrations" (v) VALUES (4) ON CONFLICT (v) DO NOTHING;

-- 4. User: MCP / Ariadne columns (present in schema.prisma; add if missing on older DBs)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ariadneMcpUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ariadneMcpToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_mcpSecret_key" ON "User"("mcpSecret");
