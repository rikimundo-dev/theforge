# @theforge/database

Prisma schema y client compartido.

- **Schema:** `schema.prisma` — **`User`** (email único; JWT `sub` tras OTP), `Project` (**`userId`** → propietario), `Session` (**`userId`** redundante con propietario del proyecto), `Estimation`, `Status`, **`Stage`**, **`EpisodicMemory`**, `ArchitecturalPreference`, `AgentStateCheckpoint`.
- **Migración `20260326150000_user_project_session_ownership`:** crea `User`, enlaza proyectos/sesiones existentes al primer usuario insertado (`jorge.correa@kreoint.mx` si la tabla está vacía) y exige `userId` NOT NULL.
- **Migración `20260327140000_ensure_pg_enums_idempotent`:** crea con `IF NOT EXISTS` los ENUM de Prisma (`Status`, `ProjectType`, `ComplexityLevel`, `StageStatus`, `EpisodicMemoryKind`) para desbloquear deploys donde faltaba el tipo antes de `ADD COLUMN …`.
- **Client:** generado en `src/generated`; exportado por el package.

Desde la **raíz** del monorepo: `pnpm run db:generate` (o el `build` del paquete) genera el client. `pnpm run db:push` aplica el schema a la DB. `pnpm run db:migrate` ejecuta migraciones en producción.

**LangGraph (Paso 0 / DBGA):** las tablas `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations` en `public` las crea `PostgresSaver.setup()` al arrancar la API y también la migración `20260513180000_langgraph_checkpoint_tables` (idempotente). Si ves `relation "public.checkpoints" does not exist`, aplica migraciones pendientes y redeploy de la API.

**Imagen Docker (API):** el `ENTRYPOINT` del contenedor ejecuta `prisma migrate deploy` en cada arranque antes de levantar Nest; el CLI `prisma` va en `dependencies` de este package para que el deploy no dependa de devDependencies.

**Memoria agéntica:** `Stage.shortTermContext` (JSON, STM); `EpisodicMemory` con `kind` (`REASONING_TRACE`, `ARCHITECTURE_DECISION`, `REFLEXION_FEEDBACK`, `EVALUATOR_REJECTION`, `TOOL_OUTPUT`). `Stage.isLegacy` y `Stage.theforgeProjectId` enrutan el flujo legacy; si `theforgeProjectId` es null en stage, aplica el del `Project`.

**Si la BD fue creada con `db push`** y ya tiene las tablas, marcar la migración inicial como aplicada (solo una vez):

```bash
cd packages/database
DATABASE_URL="postgresql://..." npx prisma migrate resolve --applied 20250309000000_initial_schema
```

**Si `20250311000000_add_project_type_relic` falla por "ProjectType already exists"** (p. ej. tras un `db push` previo), marcar como aplicada y volver a desplegar:

```bash
cd packages/database
DATABASE_URL="postgresql://user:pass@host:5432/theforge" npx prisma migrate resolve --applied 20250311000000_add_project_type_relic
```

### P3018 — `relation "Project" does not exist` (20250311100000_add_legacy_flow_state)

Ocurre cuando la BD está vacía pero `20250311000000_add_project_type_relic` fue marcada como aplicada (p. ej. por un entrypoint que ejecutaba `resolve --applied` en cada arranque). **Solución:** la migración `20250309000000_initial_schema` crea Project, Session, Estimation y ArchitecturalPreference. Redespliega con la imagen que incluye esta migración; el entrypoint ya no marca migraciones como aplicadas en cada arranque.

### P3009 — `20250319140000_stage_sdd_deliverables` failed (migrate deploy bloqueado)

Suele deberse a que en PostgreSQL **no existía el tipo** `"Status"` al ejecutar `ADD COLUMN "status" "Status"` en `Stage` (las migraciones SQL del repo no creaban ese enum; solo aparecía vía `schema.prisma` / push). El `migration.sql` del repo **ya incluye** `CREATE TYPE "Status"` al inicio; hace falta **desbloquear** el registro fallido en `_prisma_migrations`.

#### Atajo (caso típico: Postgres hizo rollback y solo quedó marcada como fallida)

El **entrypoint de la API** ejecuta en cada arranque, **antes** de `migrate deploy`:

`prisma migrate resolve --rolled-back 20250319140000_stage_sdd_deliverables`  
(solo desbloquea si esa migración sigue en estado fallido; si ya está aplicada o no aplicaba, Prisma sale con error y el script lo ignora sin ensuciar el log.)

1. Despliega una imagen **con el `migration.sql` actualizado** (enum `Status` al inicio).
2. **Redeploy** del servicio API — no hace falta variable de entorno para esta migración.

Manual (misma `DATABASE_URL` que producción):

```bash
cd packages/database
export DATABASE_URL="postgresql://..."
npx prisma migrate resolve --rolled-back 20250319140000_stage_sdd_deliverables
npx prisma migrate deploy
```

**1. Ver el registro y el estado real** (contra la misma `DATABASE_URL` que usa el contenedor API):

```sql
SELECT migration_name, finished_at, logs, started_at
FROM "_prisma_migrations"
WHERE migration_name = '20250319140000_stage_sdd_deliverables';

-- ¿Existe el enum?
SELECT typname FROM pg_type WHERE typname = 'Status';

-- Columnas relevantes (ajusta si tu baseline difiere)
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('Project', 'Stage', 'Estimation')
ORDER BY table_name, ordinal_position;
```

**2. Si la migración quedó a medias** (p. ej. ya existe `workflowStatus` en `Stage` pero el deploy sigue fallando): no reintentes `deploy` a ciegas. Opciones:

- **A) Deshacer lo aplicado** (solo si puedes borrar datos de prueba / snapshot previo): revertir manualmente los `ALTER` de esa migración hasta un estado coherente con la migración anterior, luego:

  ```bash
  npx prisma migrate resolve --rolled-back 20250319140000_stage_sdd_deliverables
  ```

  Vuelve a desplegar con una imagen que incluya el `migration.sql` actualizado (crea el enum `Status` al inicio).

- **B) Completar a mano** el SQL restante de `migrations/20250319140000_stage_sdd_deliverables/migration.sql` (crear enum `Status` si falta, luego el resto según lo que ya tengas) y marcar aplicada:

  ```bash
  npx prisma migrate resolve --applied 20250319140000_stage_sdd_deliverables
  ```

**3. Si aún no tocaste la DB** y solo falló por el enum: con el `migration.sql` corregido (enum al inicio), `resolve --rolled-back` y otro `migrate deploy` deberían aplicar la migración entera de nuevo.

### P3018 — `constraint "Estimation_projectId_key" does not exist` (u otro nombre)

La migración `stage_sdd_deliverables` asumía nombres fijos de FK/UNIQUE en `Estimation`. Bases creadas con `db push` u otra versión de Prisma pueden tener **otro nombre** o solo un índice único. El `migration.sql` del repo usa bloques `DO` que buscan en `pg_catalog` el FK a `Project` y el `UNIQUE` sobre `projectId`, más `DROP INDEX IF EXISTS` para nombres habituales.

Tras un fallo **P3018**, vuelve a ejecutar `migrate resolve --rolled-back` para esa migración (el entrypoint de la API lo intenta solo) y redeploy con el SQL actualizado.

### P3009 — `20260319130000_agent_checkpoint_mdd_stage` failed

El entrypoint ya incluye `resolve --rolled-back` para esta migración. Si falla de nuevo tras redeploy:

**Opción A — Sin rebuild:** Añadir en el environment del contenedor API:
```
PRISMA_RESOLVE_ROLLED_BACK=20260319130000_agent_checkpoint_mdd_stage
```
Redeploy. En el siguiente arranque el entrypoint desbloqueará y `migrate deploy` reintentará.

**Opción B — Manual** (con la misma `DATABASE_URL` de producción):
```bash
cd packages/database
export DATABASE_URL="postgresql://theforge:theforge@theforge-db:5432/theforge"
npx prisma migrate resolve --rolled-back 20260319130000_agent_checkpoint_mdd_stage
npx prisma migrate deploy
```
