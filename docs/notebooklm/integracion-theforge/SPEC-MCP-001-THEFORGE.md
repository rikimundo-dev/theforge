# SPEC-MCP-001 — Uso desde The Forge

Resumen del contrato entre la **API The Forge** (flujo legacy) y el **MCP AriadneSpecs**. La definición normativa del servidor está en el monorepo **Ariadne**: **`docs/mcp_server_specs.md`** (SPEC-MCP-001), **`docs/MCP_HTTPS.md`**, **`docs/MCP_AYUDA.md`**. Este archivo describe solo el **uso cliente** The Forge.

**Flujo legacy completo (Workshop):** [../LEGACY-FLOW-AS-IS-MDD.md](../LEGACY-FLOW-AS-IS-MDD.md).

## Proyecto vs repo

- **projectId** en las herramientas puede ser **ID de proyecto** (multi-root) o **ID de repo** (`roots[].id`). El MCP resuelve automáticamente (repositories vs projects según endpoint).
- **list_known_projects** devuelve `[{ id, name, roots: [{ id, name?, branch? }] }]`. Cada `roots[].id` es válido como `projectId` en el resto de herramientas.

## Flujo legacy: plan de modificación

Para `POST /projects/:projectId/legacy/start` con `{ description }`:

1. **Llamada principal:** `get_modification_plan(userDescription, projectId)`  
   - **Argumentos:** `userDescription` (descripción de la modificación), `projectId` (theforgeProjectId: puede ser ID de proyecto o de repo).  
   - **Respuesta:** `{ filesToModify: Array<{ path: string, repoId: string }>, questionsToRefine: string[] }`. Cada archivo incluye `repoId` (root); si hay varios repoId distintos, el cambio afecta a más de un repo (multi-root).

2. **Garantías del MCP:**
   - **filesToModify:** Solo rutas que existen en el grafo (path + repoId). No se inventan nombres ni extensiones.
   - **questionsToRefine:** Solo preguntas de negocio/funcionalidad.

3. **Fallback:** Si el MCP no expone `get_modification_plan` o devuelve error, TheForge usa `ask_codebase` pidiendo el mismo JSON; convierte paths a `{ path, repoId: projectId }`.

4. **Sugerencias:** Tras obtener `questionsToRefine`, TheForge llama `ask_codebase` para rellenar respuestas sugeridas.

5. **Generación de MDD (etapas 2+):** TheForge enriquece el contexto con **`validate_before_edit`** para los 3 primeros archivos a modificar; fallback `get_legacy_impact`; `get_file_content` y `ask_codebase` acotados al cambio.

## Doc. partida y MDD AS-IS (etapa 1)

| Paso | Endpoint The Forge | Herramienta MCP |
|------|-------------------|-----------------|
| MDD Inicial | `POST …/legacy/generate-codebase-doc` | **`generate_legacy_documentation`** (determinista; no `ask_codebase` prosa) |
| MDD canónico | `POST …/legacy/generate-mdd` (`ordinal === 1`) | Usa `codebaseDoc` ya persistido; post-inyección §3–§5 en API |

En Workshop: pestaña **MDD Inicial** = primera fila; pestaña **MDD → Regenerar** = segunda fila (no regenerar Ariadne desde MDD).

## Regla para toda la documentación legacy

**No inventar.** Toda la documentación generada para proyectos legacy (Spec, MDD, Blueprint, Arquitectura, Casos de uso, Historias, API, Flujos, Infra, Tasks, Guía UX/UI) debe **apegarse al MDD y al conocimiento obtenido vía MCP AriadneSpecs**. Si algo no está en el MDD ni en el contexto del codebase, no se incluye. Esta regla se inyecta en todos los prompts cuando se pasa `relicContext` (AiService: `prependRelicPrompt` + instrucción explícita en Blueprint y Guía UX/UI).

## ask_codebase y `responseMode: evidence_first`

El servidor Ariadne puede devolver con **`evidence_first`** un **JSON estructurado** (MDD parcial / evidencia) en lugar de solo prosa; puede anidarse en **`mddDocument`**. La API The Forge (`TheForgeService.askCodebase`) convierte ese JSON a **markdown** antes de usarlo en Legacy Analyzer y documentación de partida, para no romper prompts que esperan texto.

## Protocolo recomendado (MCP)

1. `list_known_projects` al inicio.
2. Fijar `projectId`: en The Forge se guarda como `theforgeProjectId` en el proyecto; en Cursor, especificación Ariadne: **`.ariadne-project`** en la raíz del repo indexado (`MCP_AYUDA.md` §4). Documentación antigua: `.theforge-project` con el mismo JSON.
3. **Antes de editar:** `validate_before_edit` con el nombre del nodo (TheForge lo aplica al generar el MDD).
4. Usar props/contratos del grafo; no inventar.

## Herramientas MCP usadas por TheForge

| Uso | Herramienta |
|-----|-------------|
| **Doc. partida legacy (MDD Inicial)** | **`generate_legacy_documentation`** — JSON MDD 7 claves desde Falkor; TheForge normaliza a markdown multi-repo |
| Listar proyectos (multi-root) al crear proyecto legacy | `list_known_projects` → `{ id, name, roots: [{ id, name?, branch? }] }` |
| Inicio del flujo **cambio** (archivos + preguntas) | `get_modification_plan` (primario), `ask_codebase` (fallback/sugerencias) |
| Contexto MDD **etapa 2+** | `ask_codebase`, **`validate_before_edit`**, `get_file_content`, `semantic_search` |
| Refactor seguro (disponibles en TheForgeService) | `get_contract_specs`, `get_component_graph` (aún no usados en flujo automático). Catálogo completo: **HERRAMIENTAS-MCP-THEFORGE.md**. |

## Transporte

- **Corporativo:** HTTP (Streamable) a `THEFORGE_MCP_URL` (p. ej. `https://theforge.obp.mx/mcp`), auth Bearer con `MCP_AUTH_TOKEN`.
- **Local/IDE:** Stdio según configuración de Cursor.

## Referencia

- **Catálogo completo de herramientas:** [HERRAMIENTAS-MCP-THEFORGE.md](./HERRAMIENTAS-MCP-THEFORGE.md) (todas las herramientas MCP y uso en TheForge).
- Especificación completa del MCP: guía “Ayuda — MCP AriadneSpecs” (theforge.obp.mx).
- Configuración en TheForge: [THEFORGE-MCP.md](../THEFORGE-MCP.md), `apps/api/src/modules/theforge/theforge.service.ts`.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
