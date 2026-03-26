-- Fase 4: enums explícitos (idempotente). Útil si una migración falló por tipo ausente o orden distinto en deploy.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Status') THEN
    CREATE TYPE "Status" AS ENUM ('ROJO', 'AMARILLO', 'VERDE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectType') THEN
    CREATE TYPE "ProjectType" AS ENUM ('NEW', 'LEGACY');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComplexityLevel') THEN
    CREATE TYPE "ComplexityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StageStatus') THEN
    CREATE TYPE "StageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'SUPERSEDED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EpisodicMemoryKind') THEN
    CREATE TYPE "EpisodicMemoryKind" AS ENUM (
      'REASONING_TRACE',
      'ARCHITECTURE_DECISION',
      'REFLEXION_FEEDBACK',
      'EVALUATOR_REJECTION',
      'TOOL_OUTPUT'
    );
  END IF;
END
$$;
