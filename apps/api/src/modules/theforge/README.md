# Módulo TheForge (cliente MCP)

Integración HTTP JSON-RPC con el MCP AriadneSpecs (`THEFORGE_MCP_URL`): proyectos, `get_modification_plan`, `ask_codebase`, búsqueda semántica, contenido de archivo y herramientas SDD (`validate_before_edit`, etc.).

**Despliegue Docker:** en `docker-compose.yml`, `THEFORGE_MCP_URL` / tokens MCP no deben quedar fijados a `""` vía `${VAR:-}`; ver comentarios en el compose y `README` raíz (Dokploy → servicio `theforge-api`).

## Contexto evidencia-primero (legacy / entregables)

`theforge-evidence-context.util.ts` arma Markdown de contexto para **SDD legacy**:

1. Varios `semantic_search` (límite configurable).
2. Extracción heurística de rutas desde el texto MCP (`extractCandidatePathsFromMcpText`).
3. `get_functions_in_file` por rutas candidatas (tope configurable).
4. Con **`LEGACY_ANALYZER_COMPACT=1` (default):** no se vuelcan extractos completos de archivo; un paso **Legacy Analyzer** (`runLegacyAnalyzerPass`) devuelve secciones fijas (impacto, API, datos, riesgos) vía `ask_codebase` solo sobre la evidencia recortada. Con `LEGACY_ANALYZER_COMPACT=0` se restaura el flujo anterior (extractos de archivo + síntesis larga).
5. Anexo de evidencia bruta: `LEGACY_ANALYZER_ATTACH_RAW=1` (solo debug).

**Caché:** `TheForgeContextCacheService` (memoria) deduplica `getContextForDeliverables` por `projectId` + huella del primer índice semántico + `THEFORGE_CONTEXT_REVISION` opcional. Desactivar: `THEFORGE_CONTEXT_CACHE=0`.

La API Nest `TheForgeService.getContextForDeliverables` y `LegacyCoordinatorService.generateCodebaseDoc` / `generateMdd` usan este pipeline cuando `LEGACY_EVIDENCE_FIRST_CONTEXT` está activo (default).

Variables relevantes: ver `.env.example` en la raíz del monorepo (prefijo `LEGACY_*`, `THEFORGE_CONTEXT_*`).

**Alineación cliente HTTP con AriadneSpecs (Streamable HTTP):** `POST` + JSON-RPC `2.0`, `method: "tools/call"`, `params: { name, arguments }`, headers `Content-Type`, `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2025-03-26`, auth `Authorization: Bearer` o `X-M2M-Token`. Respuestas JSON o SSE (primera línea `data: {…}` parseada). No se usa `initialize` ni `Mcp-Session-Id` (servidor stateless). Argumentos MCP según `tools/list` del despliegue (p. ej. `get_definitions` / `get_references` → `symbolName`). Extensión Ariadne: `ask_codebase` puede enviar `responseMode: "evidence_first"`.

**«Sin datos en índice» en MDD inicial pero el repo “sí está indexado” en Ariadne:** el MCP que usa la API filtra por `theforgeProjectId` (UUID del proyecto o de un `roots[].id` en multi-repo). Si en The Forge enlazaste el id del **contenedor** equivocado, o una instancia MCP distinta a la del IDE, `semantic_search` devuelve vacío y el Analyzer repetía el mensaje de Ariadne. Con `LEGACY_ANALYZER_REQUIRE_GRAPH_HITS=1` (default) se **omite** el Analyzer sin hits y se hace fallback a `ask_codebase` clásico (sin `evidence_first`). Revisa en UI de creación de proyecto que el id coincida con `list_known_projects` / el repo realmente sincronizado.
