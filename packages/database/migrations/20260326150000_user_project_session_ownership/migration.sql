-- Usuario propietario + userId en Project y Session (Fase 1 seguridad).

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userId" TEXT;

DO $$
DECLARE
  uid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" LIMIT 1) THEN
    uid := gen_random_uuid()::text;
    INSERT INTO "User" ("id", "email", "createdAt")
    VALUES (uid, 'jorge.correa@kreoint.mx', CURRENT_TIMESTAMP);
  ELSE
    SELECT "id" INTO uid FROM "User" LIMIT 1;
  END IF;

  UPDATE "Project" SET "userId" = uid WHERE "userId" IS NULL;
  UPDATE "Session" s
    SET "userId" = p."userId"
    FROM "Project" p
    WHERE s."projectId" = p."id" AND s."userId" IS NULL;
END $$;

ALTER TABLE "Project" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "userId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_userId_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey') THEN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
