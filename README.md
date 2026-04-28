# TheForge

Monorepo Turborepo: API NestJS + Web React (Vite) + Prisma. LLM vía **OpenRouter**, Semáforo MDD, motor de estimación MXN. Despliegue Dokploy-ready con Docker.

## Estructura

- **apps/api** — NestJS: proyectos, sesiones, AI (OpenRouter), engine (cost-calculator, semáforo).
- **apps/web** — React (Vite) + Tailwind.
- **packages/database** — Prisma schema y client.
- **packages/shared-types** — DTOs e interfaces (Zod).
- **packages/config** — TS, ESLint, Tailwind base.

## Requisitos

- Node ≥20
- npm (workspaces en la raíz; opcional `package-lock.json` para builds reproducibles / `npm ci` en CI)
- PostgreSQL 15 (para API)
- Opcional: Redis (para colas futuras)

## Desarrollo

```bash
npm install
# Base de datos: crear DB y DATABASE_URL en .env (api o root)
npm run db:generate
npm run db:push
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173 (proxy /api → 3000)

## Build

```bash
npm run build
```

## Docker (Dokploy) — un solo contenedor

Un único contenedor **theforge-db** con Postgres + API + Web (Nginx). Conexión interna: `postgresql://theforge:theforge@localhost:5432/theforge`.

Las imágenes (`Dockerfile` raíz, `apps/api/Dockerfile`, `apps/web/Dockerfile`) instalan dependencias con **`npm install`** en el contexto del monorepo (copian `package.json`, `turbo.json`, `.npmrc` y los `package.json` de workspaces). Cuando tengas un **`package-lock.json` en la raíz** generado con `npm install`, puedes cambiar el `Dockerfile` a `COPY package-lock.json ./` + `npm ci` para builds más deterministas.

```bash
docker compose up --build
```

- **Contenedor:** `theforge-db` (nombre del servicio y del contenedor)
- **Puerto:** 80 (Web + proxy `/api` → API en el mismo contenedor)
- **Volumen:** `theforge_db_data` (datos de Postgres)

Variables de entorno: referencia completa (qué hace cada una, valores posibles y defaults) en **`.env.example`** en la raíz del monorepo.

### Compose multi-servicio (`docker-compose.yml`)

`THEFORGE_MCP_URL` y `MCP_AUTH_TOKEN` **no** se interpolan con `${VAR:-}` en el servicio `theforge-api`: un valor vacío en el bloque `environment` impide que las mismas claves lleguen desde `.env` o desde las variables de **ese** servicio en Dokploy. El servicio usa `env_file: .env` (opcional, `required: false`) más lo que inyecte el orquestador en el contenedor API.

## Docs

- [Índice de arquitectura](docs/notebooklm/THEFORGE-INDEX.md)
- [Blueprint](blueprint.md)
- [MDD](mdd.md)
