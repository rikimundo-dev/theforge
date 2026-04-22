# Módulo TheForge (cliente MCP)

Integración HTTP JSON-RPC con el MCP AriadneSpecs (`THEFORGE_MCP_URL`): proyectos, `get_modification_plan`, `ask_codebase`, búsqueda semántica, contenido de archivo, **modelo C4** (`get_c4_model` → contexto de Blueprint legacy) y herramientas SDD (`validate_before_edit`, etc.).

## `list_known_projects` → ids (canónico: repo Ariadne `docs/MCP_HTTPS.md` o `docs/notebooklm/MCP_HTTPS.md`, SPEC-MCP-001)

- **`id`**: proyecto workspace Ariadne → rutas ingest **`/projects/:id/...`** (`get_modification_plan`, `ask_codebase` según spec).
- **`roots[].id`**: repo → **`/repositories/:id/...`** y valor típico de `projectId` en nodos Falkor según sync.
- **`TheForgeService`** cachea `list_known_projects` (`THEFORGE_LIST_PROJECTS_CACHE_MS`, default 60s; `0` = sin caché) y, a partir del UUID guardado en `Project.theforgeProjectId`, calcula:
  - **`workspaceProjectId`**: siempre el **`id` del workspace** cuando el catálogo lo permite (si guardaste un `roots[].id`, se busca el proyecto padre). Se usa como **`projectId`** en **`ask_codebase`** y **`get_modification_plan`** (alineado con `POST /projects/:id/chat` y `POST /projects/:id/modification-plan`).
  - **`graphProjectId`**: repo para **grafo / herramientas MCP solo-UUID**: primer `roots[].id` si elegiste el workspace, o el **mismo** `roots[].id` si elegiste un repo. Se usa en `get_file_content`, `get_definitions`, etc. **`TheForgeService.semanticSearch`**: con proyecto multi-root, el servicio usa **`scope.repoIds`** del catálogo y **concatena** una `semantic_search` por repo (el MCP no tiene `scope`). Con un solo root, una sola llamada con `limit` total.
  - **`scope.repoIds`**: en **`ask_codebase`** y **`get_modification_plan`**, lista de `roots[].id`. Si `theforgeProjectId` es el **workspace** `id`, son todos los roots; si es un **`roots[].id`**, igualmente se envían **todos** los roots del padre (proyecto completo en ingest). Para acotar a un repo, el caller puede pasar `opts.scope.repoIds` y hace overlay (ver `mergeAriadneCodebaseScope`).
- **Sharding (`FALKOR_SHARD_BY_PROJECT`)**: el UUID en Falkor debe coincidir con el índice; si el despliegue parte por proyecto, revisar que `graphProjectId` sea el que usa el sync (repo vs workspace) según `.ariadne-project` / ingest.

**Depuración:** con `DEBUG_MCP=1` (o `true`), `TheForgeService.postTheForgeMcp` registra cada cuerpo JSON-RPC enviado y la respuesta cruda (truncada por `DEBUG_MCP_MAX_RESPONSE_CHARS`, default 32768; request por `DEBUG_MCP_MAX_REQUEST_CHARS`, default 65536). En Docker: variable en `.env` o `docker-compose` (`DEBUG_MCP: ${DEBUG_MCP:-0}`).

**Despliegue Docker:** en `docker-compose.yml`, `THEFORGE_MCP_URL` / tokens MCP no deben quedar fijados a `""` vía `${VAR:-}`; ver comentarios en el compose y `README` raíz (Dokploy → servicio `theforge-api`).

## Contexto evidencia-primero (legacy / entregables)

`theforge-evidence-context.util.ts` arma Markdown de contexto para **SDD legacy**:

1. Varios `semantic_search` (`LEGACY_SEMANTIC_SEARCH_LIMIT`, default **80** hits por query; recorte markdown `LEGACY_SEMANTIC_SECTION_MAX_CHARS`, default **16000**). El armado de **doc. partida** §5 (`generate-codebase-doc` modo clásico) usa `clipLegacySemanticSectionForCodebaseDoc` → `LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS` (default **48000**).
2. Extracción heurística de rutas desde el texto MCP (`extractCandidatePathsFromMcpText`).
3. `get_functions_in_file` por rutas candidatas (tope configurable).
4. Con **`LEGACY_ANALYZER_COMPACT=1` (default):** no se vuelcan extractos completos de archivo; un paso **Legacy Analyzer** (`runLegacyAnalyzerPass`) devuelve secciones fijas (impacto, API, datos, riesgos) vía `ask_codebase` solo sobre la evidencia recortada. Con `LEGACY_ANALYZER_COMPACT=0` se restaura el flujo anterior (extractos de archivo + síntesis larga).
5. Anexo de evidencia bruta: `LEGACY_ANALYZER_ATTACH_RAW=1` (solo debug).

**Caché:** `TheForgeContextCacheService` (memoria) deduplica `getContextForDeliverables` por `projectId` + huella del primer índice semántico + `THEFORGE_CONTEXT_REVISION` opcional. Desactivar: `THEFORGE_CONTEXT_CACHE=0`.

`TheForgeService.getContextForDeliverables` sigue usando `buildLegacyEvidenceMarkdown` (pipeline anterior) cuando `LEGACY_EVIDENCE_FIRST_CONTEXT` está activo. **`LegacyCoordinatorService.generateCodebaseDoc` / `generateMdd`** usan en su lugar **descubrimiento escalonado** (LLM + `ask_codebase` / `semantic_search` / `get_file_content`, prompt `legacy-flow/prompts/staged-discovery-mdd-prompt.md`) con el mismo flag; el system prompt incluye catálogo `list_known_projects` (`{{ariadneRepositoriesCatalog}}`) para **Fase 0** repos/roles antes de profundizar. `gatherLegacyIndexSignals` sigue siendo la fase **sin LLM** para la puerta índice↔SDD en Falkor (ver `docs/LEGACY-EVIDENCE-CONTEXT.md` y `legacy-flow/README.md`).

Variables relevantes: ver `.env.example` en la raíz del monorepo (prefijo `LEGACY_*`, `THEFORGE_CONTEXT_*`). **`LEGACY_SEMANTIC_KEEP_MARKDOWN_DOCS`:** si no está en `1`, se eliminan del texto de evidencia las líneas `**MarkdownDoc:**` devueltas por el MCP (documentación de diseño indexada, no código).

**C4 en Blueprint (legacy):** `getContextForDeliverables` antepone (si hay respuesta) el markdown de `get_c4_model` antes de la evidencia semántica/Analyzer. Requiere que el **servidor MCP** tenga JWT válido hacia el API Nest (`ARIADNE_API_BEARER` / `ARIADNE_API_JWT`); si no, la herramienta falla y se continúa sin bloque C4. Desactivar: `LEGACY_C4_CONTEXT=0`. Recorte: `LEGACY_C4_MAX_CHARS` (default 5000). El prefacio TheForge en prompts usa `THEFORGE_CONTEXT_PREPEND_MAX_CHARS` (default 16000) para dar cabida a C4 + evidencia.

**Paridad grafo MCP vs explorador Ariadne (operación):** Las herramientas `get_component_graph`, `get_legacy_impact`, `get_c4_model` intentan primero el **API Nest** (`GET /api/graph/*`) cuando el **proceso** `mcp-ariadne` tiene `ARIADNE_API_URL` + JWT (`ARIADNE_API_BEARER` / `ARIADNE_API_JWT`). Eso es **independiente** del token cliente→`/mcp` (`MCP_AUTH_TOKEN` / `MCP_X_M2M_TOKEN` en The Forge). Sin JWT Nest en el contenedor MCP, el servidor hace **fallback Falkor** y el resultado puede diferir del explorador web — no es un bug del cliente Nest `THEFORGE_MCP_URL`.

**`ask_codebase` (Ariadne SPEC):** por defecto `TheForgeService.askCodebase` envía **`responseMode: raw_evidence`** + **`deterministicRetriever: true`** y convierte la respuesta JSON a **markdown** (`normalizeAskCodebaseRawEvidenceContent` → `formatRawEvidenceObjectToMarkdown` en `theforge-raw-evidence-markdown.ts`). Override: `evidence_first` (MDD 7 claves) o `default` (prosa). `getLegacyAskCodebaseOptions()` alinea legacy con ese default; `LEGACY_ASK_CODEBASE_EVIDENCE_FIRST=0` fuerza `default`. Doc. partida con body UI: **`askCodebaseOptionsForCodebaseDoc(responseMode)`** (mismo modo en ReAct `getStagedDiscoveryTheForgeTools(..., opts)` y en las 4 rondas clásicas).

**MDD con JSON crudo pegado por el LLM:** el descubrimiento escalonado a veces vuelca en el markdown un objeto `{ "mode": "raw_evidence", … }` aunque la herramienta ya devolviera texto normalizado. Antes de persistir `legacyFlowState.codebaseDoc`, `LegacyCoordinatorService.generateCodebaseDocCore` aplica **`normalizeRawEvidenceJsonBlocksInMarkdown`**: detecta esos objetos JSON, los parsea y los sustituye por el mismo markdown compacto (tablas de conteos/muestras, `collectedResults`, `cypher`), para que **generate-deliverables** y agentes posteriores no se ahoguen en un solo bloque escapado.

**Repo por defecto (fallback `start`):** Si `get_modification_plan` falla y el JSON viene solo con paths, `getDefaultRepoIdForStoredProject` devuelve un **`roots[].id`** cuando el catálogo lo permite, en lugar de usar el UUID del workspace como `repoId`.

**Descubrimiento escalonado (ReAct):** `getStagedDiscoveryTheForgeTools(theforge, pid, askCodebaseOpts?)` reenvía `askCodebaseOpts` a cada `ask_codebase`. Aplica suelo a `semantic_search.limit` (`LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR` o `LEGACY_SEMANTIC_SEARCH_LIMIT`) para que el LLM no pase límites tipo 20. Doc. partida modo clásico: `ask_codebase` en serie por defecto (`LEGACY_CODEBASE_DOC_PARALLEL_ASK`); ver `docs/integración theforge/ARIADNE-CONSULTA-DESDE-THEFORGE.md`.

**Contrato MCP (humo):** con `THEFORGE_MCP_URL` (y auth si aplica), `pnpm --filter @theforge/api test:mcp-alignment` llama `tools/list` y comprueba que cada `inputSchema.required` de las herramientas que usa el cliente esté cubierto por `THEFORGE_MCP_CLIENT_ARG_KEYS` (`theforge-mcp-client-contract.ts`). Sin URL, el test se omite.

**Alineación cliente HTTP con AriadneSpecs (Streamable HTTP):** `POST` + JSON-RPC `2.0`, `method: "tools/call"`, `params: { name, arguments }`, headers `Content-Type`, `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2025-03-26`, auth `Authorization: Bearer` o `X-M2M-Token`. Respuestas JSON o SSE (primera línea `data: {…}` parseada). No se usa `initialize` ni `Mcp-Session-Id` (servidor stateless). Argumentos MCP según `tools/list` del despliegue (p. ej. `get_definitions` / `get_references` → `symbolName`). Extensión Ariadne: `ask_codebase` con `evidence_first` devuelve JSON MDD; con **`raw_evidence`** (default en `askCodebase`) retrieve determinista + JSON evidencia, normalizado a markdown en la API.

**«Sin datos en índice» en MDD inicial:** el MCP filtra por el **id de repo** tras normalizar (o por `scope` en ask/plan). Si el UUID no coincide con lo indexado en Ariadne o el índice RAG está vacío, el Analyzer puede devolver ese texto. **La API ya no persiste** ese mensaje como `codebaseDoc`: se detecta con `legacyAnalyzerIndicatesEmptyIndex` y se reintenta el **modo clásico** (`ask_codebase` directo + bloques semánticos). Si tras el clásico sigue sin haber partes, el doc queda vacío: revisa sync del repo y que el id sea el mismo que en `list_known_projects`. Con `LEGACY_ANALYZER_REQUIRE_GRAPH_HITS=1` (default) también se omitía el Analyzer cuando no hay hits de grafo; la detección por frase cubre el caso `REQUIRE_GRAPH_HITS=0` o hits débiles que igual disparan la respuesta vacía de Ariadne.
