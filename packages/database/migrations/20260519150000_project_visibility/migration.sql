-- Project.visibility (PRIVATE | SHARED): listado y edición compartida entre usuarios.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Visibility') THEN
    CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'SHARED');
  END IF;
END
$$;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE';
