# Módulo TheForge (cliente MCP)

Integración HTTP JSON-RPC con el MCP AriadneSpecs (`THEFORGE_MCP_URL`): proyectos, `get_modification_plan`, `ask_codebase`, búsqueda semántica, contenido de archivo y herramientas SDD (`validate_before_edit`, etc.).

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
