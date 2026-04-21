# Cómo debe consultar The Forge a Ariadne (reglas operativas)

Guía **cliente** (API Nest `TheForgeService` + agentes legacy) para no quedarse solo con §5 semántica ni con `semantic_search` vacío o demasiado corto.

## 1. Dos timeouts distintos

- **`THEFORGE_MCP_TIMEOUT_MS`**: aborta el `fetch` JSON-RPC de la API hacia `THEFORGE_MCP_URL`. `ask_codebase` al ingest suele tardar **más** que `semantic_search`. Si las §1–4 del doc. partida salen vacías y el prefacio habla de timeout, sube a **120000–300000** ms antes de culpar a Ariadne.
- **Timeout HTTP del cliente Workshop** (si aplica): debe ser ≥ suma razonable de rondas MCP en doc. partida.

## 2. `projectId` (workspace vs repo)

- **`ask_codebase`** y **`get_modification_plan`**: The Forge envía el **UUID del workspace** (`list_known_projects[].id`) + `scope.repoIds` con todos los `roots[].id` cuando el catálogo lo permite (`ariadne-mcp-scope.util.ts`).
- **`semantic_search`**, **`get_file_content`**, **`validate_before_edit`**, etc.: usan un **repo** (`graphProjectId`, típ. un `roots[].id`). En multi-root, `TheForgeService.semanticSearch` **repite** la búsqueda por cada root y concatena — el `projectId` que ves en trazas por repo es correcto.

## 3. `semantic_search`: queries y `limit`

- Términos genéricos en inglés (`data models entities database schema tables`) en un **Next público** sin capa de datos pueden devolver **vacío**; es índice keyword/grafo, no magia. Preferir términos de **dominio** (p. ej. `paciente`, `cita`, `disponibilidad`) o mover la pregunta de entidades al repo **backend** del catálogo.
- El agente de descubrimiento escalonado **no debe** pasar `limit` muy bajo: The Forge aplica suelo con **`LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR`** (por defecto = `LEGACY_SEMANTIC_SEARCH_LIMIT`, típ. 80) en `getStagedDiscoveryTheForgeTools` para ignorar cosas como `limit: 20` del LLM.

## 4. `ask_codebase` en modo clásico (fallback doc. partida)

- Por defecto las **cuatro** preguntas amplias van **secuenciales** (`LEGACY_CODEBASE_DOC_PARALLEL_ASK` ≠ `1`) para no saturar el MCP/ingest con cuatro chats largos a la vez.
- Si subes timeout y quieres velocidad, puedes reactivar paralelo con **`LEGACY_CODEBASE_DOC_PARALLEL_ASK=1`** bajo tu propio riesgo.

## 5. Paridad explorador vs Falkor

- Si el explorador web y el MCP discrepan en grafo, revisa en el **servidor** MCP `ARIADNE_API_BEARER` / `ARIADNE_API_JWT` hacia el API Nest (no es el token cliente→`/mcp`). Ver `MCP_HTTPS.md` § API Nest vs Falkor.

## 6. Prompt del agente (Plan-and-Execute)

- `apps/api/src/modules/legacy-flow/prompts/staged-discovery-mdd-prompt.md` incluye **Fase 0** (repos/roles) y contrato técnico MCP. Se hidrata con `{{theforgeProjectId}}` y `{{ariadneRepositoriesCatalog}}` (`list_known_projects`).
