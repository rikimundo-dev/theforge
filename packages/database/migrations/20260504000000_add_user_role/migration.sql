-- Añadir role y name al User (multi-usuario RBAC).
-- Los usuarios existentes mantienen su rol actual; por defecto se asigna 'admin'
-- a los existentes para no romper el acceso de usuarios actuales.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'developer';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- Backfill: los usuarios existentes antes de esta migración obtienen rol 'admin'
-- para que no pierdan acceso a borrar proyectos.
UPDATE "User" SET "role" = 'admin' WHERE "role" = 'developer' AND "createdAt" < '2026-05-04';
