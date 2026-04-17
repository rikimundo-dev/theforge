# TheForge

Monorepo Turborepo: API NestJS + Web React (Vite) + Prisma. IA agnóstica (OpenAI/Gemini), Semáforo MDD, motor de estimación MXN. Despliegue Dokploy-ready con Docker.

## Estructura

- **apps/api** — NestJS: proyectos, sesiones, AI (adapters OpenAI/Gemini), engine (cost-calculator, semáforo).
- **apps/web** — React (Vite) + Tailwind.
- **packages/database** — Prisma schema y client.
- **packages/shared-types** — DTOs e interfaces (Zod).
- **packages/config** — TS, ESLint, Tailwind base.

## Requisitos

- Node ≥20
- pnpm 9
- PostgreSQL 15 (para API)
- Opcional: Redis (para colas futuras)

## Desarrollo

```bash
pnpm install
# Base de datos: crear DB y DATABASE_URL en .env (api o root)
pnpm run db:generate
pnpm run db:push
pnpm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173 (proxy /api → 3000)

## Build

```bash
pnpm run build
```

## Docker (Dokploy) — un solo contenedor

Un único contenedor **theforge-db** con Postgres + API + Web (Nginx). Conexión interna: `postgresql://theforge:theforge@localhost:5432/theforge`.

```bash
docker compose up --build
```

- **Contenedor:** `theforge-db` (nombre del servicio y del contenedor)
- **Puerto:** 80 (Web + proxy `/api` → API en el mismo contenedor)
- **Volumen:** `theforge_db_data` (datos de Postgres)

Env opcionales: `AI_PROVIDER` (openai | google | kimi | …), `AI_API_KEY` (alias `OPENAI_API_KEY`), `GOOGLE_GENERATIVE_AI_API_KEY` — ver `.env.example`.

### Compose multi-servicio (`docker-compose.yml`)

`THEFORGE_MCP_URL` y `MCP_AUTH_TOKEN` **no** se interpolan con `${VAR:-}` en el servicio `theforge-api`: un valor vacío en el bloque `environment` impide que las mismas claves lleguen desde `.env` o desde las variables de **ese** servicio en Dokploy. El servicio usa `env_file: .env` (opcional, `required: false`) más lo que inyecte el orquestador en el contenedor API.

## Docs

- [Índice de arquitectura](docs/THEFORGE-INDEX.md)
- [Blueprint](blueprint.md)
- [MDD](mdd.md)
