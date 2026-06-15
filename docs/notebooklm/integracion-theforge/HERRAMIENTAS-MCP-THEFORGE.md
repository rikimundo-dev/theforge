# Catálogo de herramientas MCP AriadneSpecs (SPEC-MCP-001)

Referencia de herramientas del MCP **AriadneSpecs** alineada a **`mcp_server_specs.md`** / **`MCP_HTTPS.md`**. Columna **The Forge** indica uso en la API/web. El host del MCP es el configurado en `THEFORGE_MCP_URL` (ej. despliegue Ariadne), no el propio monorepo The Forge.

---

## Resolución de projectId

- **projectId** puede ser **ID de proyecto** (multi-root) o **ID de repo** (`roots[].id`). El MCP resuelve automáticamente (file: repositories → projects; chat: projects → repositories).
- **list_known_projects** devuelve `[{ id, name, roots: [{ id, name, branch? }] }]`.

---

## Herramientas

| Herramienta | Uso (MCP) | TheForge |
|-------------|-----------|----------|
| **list_known_projects** | Mapear IDs a nombres (proyectos + roots). | ✅ Listado al crear proyecto legacy. |
| **generate_legacy_documentation** | MDD de partida determinista (7 claves JSON → markdown). | ✅ **`POST …/legacy/generate-codebase-doc`** (MDD Inicial). Preferir sobre `ask_codebase` para doc. partida. |
| **get_modification_plan** | Plan: filesToModify (path + repoId) y questionsToRefine. | ✅ Inicio flujo **cambio** (etapas 2+); fallback con ask_codebase. |
| **ask_codebase** | Chat agéntico ingest; `responseMode: evidence_first` → JSON MDD (claves `summary`, `entities`, `evidence_paths`, … o `mddDocument`) vía LLM/orchestrator (`mdd-evidence`). | ✅ Misma herramienta; con `evidence_first`, `TheForgeService.askCodebase` **normaliza JSON → markdown** antes de devolver texto al legacy/orquestador. |
| **get_file_content** | Contenido de un archivo (Bitbucket/GitHub; INGEST_URL). | ✅ Contexto de los 2 primeros archivos a modificar al generar MDD. |
| **validate_before_edit** | **Obligatorio antes de editar:** impacto + contrato en un solo llamado. | ✅ Al generar MDD: validación de los 3 primeros archivos; fallback a get_legacy_impact si no disponible. |
| **get_legacy_impact** | Qué se rompe si se modifica un nodo. | ✅ Fallback cuando validate_before_edit no existe o devuelve vacío. |
| **get_contract_specs** | Props reales de un componente. | Disponible en TheForgeService; no usado en flujo automático. |
| **get_component_graph** | Árbol de dependencias de un componente. | Disponible en TheForgeService; no usado en flujo automático. |
| **get_functions_in_file** | Funciones y componentes que contiene un archivo. | ✅ TheForgeService; usado en generateMdd y agente ReAct. |
| **get_import_graph** | Grafo de imports de un archivo (qué importa/exporta). | No implementado; uso futuro. |
| **get_file_context** | Contenido + imports + exports (paso: search → get_file_context → validate). | No implementado; alternativa enriquecida a get_file_content. |
| **get_project_standards** | Prettier, ESLint, tsconfig. | No implementado; uso futuro para que código generado siga estándares. |
| **semantic_search** | Búsqueda por palabra clave en componentes, funciones, archivos. | ✅ TheForgeService; usado en generateMdd y agente ReAct. |
| **get_project_analysis** | Modos: `diagnostico`, `duplicados`, `reingenieria`, `codigo_muerto`, **`seguridad`** (SPEC-MCP-001 / `mcp_server_specs.md`). Requiere ingest + claves en servidor. | No implementado en The Forge; uso futuro. |
| **get_definitions** | Origen exacto (archivo, líneas) de clase/función. | ✅ TheForgeService; usado en generateMdd y agente ReAct. |
| **get_references** | Todos los usos de un símbolo. | ✅ TheForgeService; disponible para agente ReAct. |
| **get_implementation_details** | Firma, tipos, props, endpoints de un símbolo. | No implementado. |
| **trace_reachability** | Funciones/componentes nunca llamados desde puntos de entrada. | No implementado. |
| **check_export_usage** | Exports sin importaciones activas. | No implementado. |
| **get_affected_scopes** | Nodos y archivos afectados por una modificación. | No implementado. |
| **check_breaking_changes** | Alerta si se eliminan params usados en N sitios. | No implementado. |
| **find_similar_implementations** | Búsqueda semántica antes de escribir código nuevo. | No implementado. |
| **analyze_local_changes** | Pre-flight: git diff --cached vs grafo; tabla Tipo/Elemento/Impacto/Riesgo. Requiere workspaceRoot o stagedDiff. | No aplica desde API (sin acceso a workspace local); uso en Cursor en repo indexado. |
| **extract_design_tokens** | Busca archivos de tokens de diseño (Tailwind config, CSS custom props, theme/token JSONs) en FalkorDB, parsea valores directamente (sin LLM), retorna JSON estructurado. | ✅ TheForgeService.extractDesignTokens — usado en legacy UX/UI guide. |

|---

## Protocolo recomendado (AriadneSpecs)

1. **`list_known_projects`** al inicio (`MCP_AYUDA.md` §5).
2. Fijar **`projectId`:** en especificación Ariadne, archivo **`.ariadne-project`** en la raíz del repo indexado (`MCP_AYUDA.md` §4). En documentación histórica de The Forge a veces se citaba **`.theforge-project`** con el mismo JSON `{ "projectId": "uuid" }`.
3. **Antes de editar:** **`validate_before_edit`** con el nombre del nodo.
4. Usar props/contratos que devuelve el grafo; no inventar.

The Forge aplica (2) vía **`theforgeProjectId`** en BD; (3) al generar el MDD legacy para los archivos a modificar.

---

## Configuración MCP (Cursor, usuario final)

Ver **`MCP_AYUDA.md`** en Ariadne: `url` en `~/.cursor/mcp.json`, headers Bearer o `X-M2M-Token` si el servidor exige token.

- **Backend The Forge:** `THEFORGE_MCP_URL` (mismo endpoint `/mcp` que Cursor, si aplica), `MCP_AUTH_TOKEN` o `MCP_X_M2M_TOKEN`.
- **`.ariadne-project`** en la raíz del repo indexado (`MCP_AYUDA.md` §4) para fijar `projectId` en el IDE.

Referencias: [THEFORGE-COMO-INVOCA-THEFORGE-MCP.md](THEFORGE-COMO-INVOCA-THEFORGE-MCP.md), [Llamadas-HTTPS-MCP-AriadneSpecs.md](Llamadas-HTTPS-MCP-AriadneSpecs.md), SPEC-MCP-001-THEFORGE.md.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
