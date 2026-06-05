# TheForge — Ejecución en local

Pasos para desarrollar en tu máquina. Se asume **Docker** instalado para infraestructura (no hace falta instalar PostgreSQL en el host).

## Requisitos

- **Node** ≥20  
- **pnpm** 9 (`corepack enable`; `packageManager` en `package.json`)  
- **Docker** (Docker Desktop, Colima en Mac, etc.)

---

## Opción A: Postgres + infra en Docker + app nativa (recomendado)

### 1. Dependencias

```bash
corepack enable
pnpm install
```

Si cambiaste de **npm** a **pnpm** (o al revés), borra `node_modules` y el lockfile del otro gestor antes de reinstalar:

```bash
rm -rf node_modules package-lock.json
pnpm install
```

No mezcles **npm** y **pnpm** en la misma raíz: usa solo `pnpm-lock.yaml`.

### 2. Infraestructura (automática)

`pnpm run dev:local` ejecuta `scripts/ensure-infra.js`, que levanta si hace falta:

| Contenedor | Puerto host | Uso |
|------------|-------------|-----|
| `theforge-db` | 5432 | PostgreSQL |
| `theforge-falkor-sdd` | 6379 | Grafo SDD (FalkorDB) |
| `theforge-redis-queue` | 6381 | Cola BullMQ (`REDIS_URL`) |

En Mac sin Docker Desktop, el script intenta arrancar **Colima** (`brew install colima`).

### 3. Variables de entorno

En la raíz del repo, crea `.env` (plantilla: **`.env.example`**).

**Mínimo local (Opción A):**

```env
DATABASE_URL=postgresql://theforge:theforge@localhost:5432/theforge
FALKORDB_SDD_URL=redis://localhost:6379
FALKORDB_URL=redis://localhost:6379
REDIS_URL=redis://localhost:6381
JWT_SECRET=local-dev-jwt-secret
TOKEN_MASTER_KEYS={"1":"<openssl rand -base64 32>"}
TOKEN_ACTIVE_KEY_VERSION=1
```

Opcional (chat con IA vía **OpenRouter**):

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

Sin `REDIS_URL`, la API usa cascadas de entregables en modo **síncrono** (timeouts en proyectos grandes).

### 4. Crear tablas (Prisma)

```bash
pnpm run db:generate
pnpm run db:push
```

### 5. Arrancar API y Web

**Todo en una sola terminal:**

```bash
pnpm run dev:local
```

O solo API + Web (infra ya levantada):

```bash
pnpm run dev
```

**Terminales separadas:** `pnpm run dev:api` y `pnpm run dev:web`.

- **Web:** http://localhost:5173  
- **API:** http://localhost:3000 (Vite proxy `/api` → API)

### Parar contenedores de infra

```bash
docker stop theforge-db theforge-falkor-sdd theforge-redis-queue
```

---

## Opción B: Stack completo en Docker (sin Dokploy)

Usa el compose base + override **local** (nginx con proxy `/api`, sin red `dokploy-network`):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Atajo:

```bash
pnpm run compose:local
```

| URL | Servicio |
|-----|----------|
| http://localhost:8080 | App (web + `/api` vía nginx) |
| http://localhost:3000 | API directa (debug) |
| http://localhost:8081 | Adminer |

El override monta `apps/web/nginx.local.conf` (proxy a `theforge-api:3000`).

---

## Opción C: Postgres instalado en la máquina

Si tienes PostgreSQL 15 en local:

1. Crea la base `theforge` y usuario/contraseña.
2. Ajusta `DATABASE_URL` en `.env`.
3. `pnpm install` → `db:generate` → `db:push` → `pnpm run dev`.

Sigue necesitando Falkor y Redis de cola para paridad con prod (vía `ensure-infra.js` o contenedores manuales).

---

## Resumen rápido (Opción A)

```bash
pnpm install
cp .env.example .env   # editar DATABASE_URL, TOKEN_MASTER_KEYS, REDIS_URL, etc.
pnpm run db:generate && pnpm run db:push
pnpm run dev:local
```

Abre http://localhost:5173.

---

## Otros despliegues

- **Dokploy (prod actual):** `docker-compose.yml` — ver [README.md](./README.md).
- **Coolify:** [docs/DEPLOY-COOLIFY.md](./docs/DEPLOY-COOLIFY.md).
