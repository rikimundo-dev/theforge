# Catálogo de herramientas MCP AriadneSpecs (SPEC-MCP-001)

Referencia de todas las herramientas del MCP según la guía actual (theforge.obp.mx). Columna **TheForge** indica uso actual o previsto.

---

## Resolución de projectId

- **projectId** puede ser **ID de proyecto** (multi-root) o **ID de repo** (`roots[].id`). El MCP resuelve automáticamente (file: repositories → projects; chat: projects → repositories).
- **list_known_projects** devuelve `[{ id, name, roots: [{ id, name, branch? }] }]`.

---

## Herramientas

| Herramienta | Uso (MCP) | TheForge |
|-------------|-----------|----------|
| **list_known_projects** | Mapear IDs a nombres (proyectos + roots). | ✅ Listado al crear proyecto legacy (proyectos y repos); `theforgeProjectId` = proyecto o repo. |
| **get_modification_plan** | Plan: filesToModify (path + repoId) y questionsToRefine. | ✅ Inicio flujo legacy (primario); fallback con ask_codebase. |
| **ask_codebase** | Preguntas en lenguaje natural (projects/chat o repositories/chat). | ✅ Fallback plan, sugerencias, generación MDD, chat Workshop. |
| **get_file_content** | Contenido de un archivo (Bitbucket/GitHub; INGEST_URL). | ✅ Contexto de los 2 primeros archivos a modificar al generar MDD. |
| **validate_before_edit** | **Obligatorio antes de editar:** impacto + contrato en un solo llamado. | ✅ Al generar MDD: validación de los 3 primeros archivos; fallback a get_legacy_impact si no disponible. |
| **get_legacy_impact** | Qué se rompe si se modifica un nodo. | ✅ Fallback cuando validate_before_edit no existe o devuelve vacío. |
| **get_contract_specs** | Props reales de un componente. | Disponible en TheForgeService; no usado en flujo automático. |
| **get_component_graph** | Árbol de dependencias de un componente. | Disponible en TheForgeService; no usado en flujo automático. |
| **get_functions_in_file** | Funciones y componentes que contiene un archivo. | ✅ TheForgeService; usado en generateMdd y agente ReAct. |
| **get_import_graph** | Grafo de imports de un archivo (qué importa/exporta). | No implementado; uso futuro. |
| **get_file_context** | Contenido + imports + exports (paso: search → get_file_context → validate). | No implementado; alternativa enriquecida a get_file_content. |
| **get_project_standards** | Prettier, ESLint, tsconfig. | No implementado; uso futuro para que código generado siga estándares. |
| **semantic_search** | Búsqueda por palabra clave en componentes, funciones, archivos. | ✅ TheForgeService; usado en generateCodebaseDoc, getContextForDeliverables, generateMdd y agente ReAct. |
| **get_project_analysis** | Diagnóstico (`diagnostico`), duplicados (`duplicados`), reingeniería (`reingenieria`), opcional `codigo_muerto`. | No implementado; uso futuro para deuda técnica o refinamiento del plan. |
| **get_definitions** | Origen exacto (archivo, líneas) de clase/función. | ✅ TheForgeService; usado en generateMdd y agente ReAct. |
| **get_references** | Todos los usos de un símbolo. | ✅ TheForgeService; disponible para agente ReAct. |
| **get_implementation_details** | Firma, tipos, props, endpoints de un símbolo. | No implementado. |
| **trace_reachability** | Funciones/componentes nunca llamados desde puntos de entrada. | No implementado. |
| **check_export_usage** | Exports sin importaciones activas. | No implementado. |
| **get_affected_scopes** | Nodos y archivos afectados por una modificación. | No implementado. |
| **check_breaking_changes** | Alerta si se eliminan params usados en N sitios. | No implementado. |
| **find_similar_implementations** | Búsqueda semántica antes de escribir código nuevo. | No implementado. |
| **analyze_local_changes** | Pre-flight: git diff --cached vs grafo; tabla Tipo/Elemento/Impacto/Riesgo. Requiere workspaceRoot o stagedDiff. | No aplica desde API (sin acceso a workspace local); uso en Cursor en repo indexado. |

---

## Protocolo recomendado (AriadneSpecs)

1. **list_known_projects** al inicio.
2. Si existe **.theforge-project** en el repo indexado (no en TheForge), usar su `projectId` en todas las llamadas.
3. **Antes de editar:** `validate_before_edit` con el nombre del nodo.
4. Usar props/contratos que devuelve el grafo; no inventar.

TheForge aplica (2) usando el `theforgeProjectId` guardado en el proyecto; (3) en la generación del MDD de cambio para los archivos a modificar.

---

## Configuración MCP (Cursor, usuario final)

- **URL:** `https://theforge.obp.mx/mcp` (o `THEFORGE_MCP_URL` en backend).
- **Auth:** Opcional `Authorization: Bearer m2m_xxx` o `X-M2M-Token` en headers.
- **.theforge-project:** En la raíz del **repo indexado** (no en el repo de TheForge), con `{ "projectId": "uuid" }` para fijar el proyecto en Cursor.

Referencias: SPEC-MCP-001-THEFORGE.md, THEFORGE-COMO-INVOCA-THEFORGE-MCP.md.
