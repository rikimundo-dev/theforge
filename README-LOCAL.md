# TheForge — Ejecución en local

Pasos para desarrollar en tu máquina. Se asume **Docker** instalado para la base de datos (no hace falta instalar PostgreSQL).

## Requisitos

- **Node** ≥20  
- **pnpm** 9 (`corepack enable`; `packageManager` en `package.json`)  
- **Colima** (runtime de contenedores en Mac; si no está corriendo, `dev:local` ejecuta `colima start --cpu 2 --memory 4`)  
- **Docker** CLI (para Postgres; Colima lo provee)

---

## Opción A: Postgres en Docker + app en local (recomendado)

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

### 2. Levantar solo Postgres

```bash
docker run -d --name theforge-db \
  -e POSTGRES_USER=theforge \
  -e POSTGRES_PASSWORD=theforge \
  -e POSTGRES_DB=theforge \
  -p 5432:5432 \
  postgres:15-alpine
```

### 3. Variables de entorno

En la raíz del repo (o en `apps/api`), crea `.env` (plantilla comentada con todas las variables: **`.env.example`** en la raíz).

```env
DATABASE_URL=postgresql://theforge:theforge@localhost:5432/theforge
```

Opcional (chat con IA vía **OpenRouter**):

```env
OPENROUTER_API_KEY=sk-or-v1-...
# o alias: AI_API_KEY / OPENAI_API_KEY
# OPENROUTER_CHAT_MODEL=nousresearch/hermes-3-llama-3.1-405b   # default en código
```

### 4. Crear tablas (Prisma)

```bash
pnpm run db:generate
pnpm run db:push
```

### 5. Arrancar API y Web

**Todo en una sola terminal (recomendado si no necesitas separar logs):**

Levanta Postgres si no está y luego API + Web:

```bash
pnpm run dev:local
```

O solo API + Web (Postgres ya levantado):

```bash
pnpm run dev
```

**Back y front en terminales separadas**

Útil para ver logs de cada uno por separado o depurar solo uno.

1. Asegura Postgres (solo la primera vez o si lo paraste):

   ```bash
   node scripts/ensure-postgres.js
   ```

2. **Terminal 1 — Backend (API):** (incluye Colima + Postgres si no están)

   Desde la raíz:

   ```bash
   pnpm run dev:api
   ```

3. **Terminal 2 — Frontend (Web):**

   Desde la raíz:

   ```bash
   pnpm run dev:web
   ```

- **Web:** http://localhost:5173  
- **API:** http://localhost:3000 (el proxy `/api` en la web apunta aquí)

### Parar Postgres

```bash
docker stop theforge-db
docker rm theforge-db   # si quieres borrar el contenedor (los datos se pierden)
```

Para conservar datos, solo `docker stop theforge-db`; al volver a hacer `docker run ...` usa otro nombre o el mismo si ya lo borraste.

---

## Opción B: Todo con Docker (un solo contenedor)

Mismo contenedor que en Dokploy: Postgres + API + Web.

```bash
docker compose up --build
```

- **App:** http://localhost:80  
- **Contenedor:** `theforge-db`  
- **Datos:** volumen `theforge_db_data`

Útil para probar el despliegue o si no quieres tener Node/npm en local.

---

## Opción C: Postgres instalado en la máquina

Si tienes PostgreSQL 15 en local:

1. Crea la base de datos `theforge` y un usuario/contraseña.
2. En `.env`:

   ```env
   DATABASE_URL=postgresql://USUARIO:PASSWORD@localhost:5432/theforge
   ```

3. Luego: `pnpm install` → `pnpm run db:generate` → `pnpm run db:push` → `pnpm run dev`.

---

## Resumen rápido (Opción A)

```bash
pnpm install
echo "DATABASE_URL=postgresql://theforge:theforge@localhost:5432/theforge" > .env
pnpm run db:generate && pnpm run db:push
pnpm run dev:local
```

`dev:local` levanta Postgres en Docker si no existe o está parado; luego arranca API y Web. Si prefieres levantar Postgres a mano, usa el comando `docker run ...` del paso 2 y luego `pnpm run dev`.

Abre http://localhost:5173 y crea un proyecto para comprobar que todo va bien.
