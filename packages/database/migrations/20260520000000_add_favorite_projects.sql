-- Migration: add_favorite_projects
-- Fecha: 2026-05-20
-- Descripción: Agrega modelo FavoriteProject para que los usuarios marquen
-- proyectos favoritos (corazón) con persistencia.

-- 1. Crear tabla FavoriteProject
CREATE TABLE IF NOT EXISTS "FavoriteProject" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteProject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FavoriteProject_userId_projectId_key" UNIQUE ("userId", "projectId")
);

-- 2. Foreign keys
ALTER TABLE "FavoriteProject" ADD CONSTRAINT "FavoriteProject_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "FavoriteProject" ADD CONSTRAINT "FavoriteProject_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

-- 3. Índices
CREATE INDEX IF NOT EXISTS "FavoriteProject_userId_idx" ON "FavoriteProject"("userId");