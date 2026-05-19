# Changelog

Todas las notas relevantes de este repositorio se documentan aquí. El formato sigue una variante orientada a release técnico (Added / Changed / Fixed / Architecture).

## [0.1.0] — 2026-03-27

### Added

- **`@theforge/business-rules`**: paquete compartido con estimación de costo (MXN), parsing de horas fijas de infra, estructura de equipo por defecto y constantes alineadas con negocio. Fuente única de verdad para API y Workshop web.
- **Grafo SDD (FalkorDB) — lectura y salud** (`GraphMemoryService`):
  - `getSddStageSnapshot`: entidades y endpoints ingeridos por `projectId` + `stageId`.
  - `evaluateSddDependencyHealth`: coherencia `API_Endpoint -[:CONSUMES]-> DB_Entity` (conteo de huérfanos y bandera `isCoherent`).
- **Pipeline MDD** (`MddUpdatePipelineService`): con `graphScope` en complejidad **HIGH**, re-ingiere MDD al grafo y pasa `sddDomainGraphOk` al semáforo para **relajar** el camino documental estricto (edge_cases / field_types) cuando el grafo es coherente.
- **Legacy — puerta índice vs SDD**: `assertLegacyIndexSddGate` cruza índice Ariadne (MCP) con snapshot Falkor; discrepancia grave → `409` con código `LEGACY_INDEX_SDD_MISMATCH` y payload `gate`; resolución explícita en `legacyFlowState.legacyIndexSddResolution` (`trust_index` | `trust_sdd` | `proceed_with_warnings`). Feature flag `LEGACY_SDD_INDEX_GATE` (default activo).
- **Util `legacy-index-sdd-alignment.util.ts`**: heurísticas de solapamiento y umbrales tunables vía env (`LEGACY_SDD_*`).
- **Puertos de orquestación**: `PROJECTS_ORCHESTRATOR_PORT`, `THEFORGE_ORCHESTRATOR_PORT` con implementación `useExisting` sobre servicios concretos; tests de DI (`ai-orchestrator.di.spec.ts`, `semaphore.service.spec.ts`, specs de alineación legacy).
- **`gatherLegacyIndexSignals`** y **`legacyIndexHasUsableGraphEvidence`** en `theforge-evidence-context.util.ts` para reutilizar recolección MCP sin duplicar lógica.
- **Módulo** `graph-memory.module.ts` y documentación README en submódulos (ai-analysis graph-memory, ai-orchestrator, business-rules).

### Changed

- **`CostCalculatorService`** y **`apps/web/src/utils/costCalculator.ts`**: delegan en `@theforge/business-rules` (sin duplicar multiplicadores, buffer ni tarifas).
- **`SemaphoreService` (HIGH)**: nuevo input opcional `sddDomainGraphOk`; si el MDD tiene lagunas documentales pero el grafo SDD es sano, puede alcanzar **VERDE** con `precisionScore` ajustado (92 vs 95).
- **`MddUpdatePipelineService.process`**: ahora **async** e inyecta `GraphMemoryService`; `EngineModule` importa `GraphMemoryModule`.
- **`LegacyCoordinatorService`**: inyección de `GraphMemoryService`; manejo de `ConflictException` para el gate índice/SDD.
- **`AiOrchestratorService`**: depende de puertos `IOrchestratorProjectsPort` / `IOrchestratorTheForgePort` en lugar de clases concretas.
- **`ProjectsModule` / `TheForgeModule`**: exportan tokens de puerto para consumo del orquestador.
- **Documentación**: actualizaciones en `docs/notebooklm/THEFORGE-INDEX.md`, `docs/notebooklm/LEGACY-EVIDENCE-CONTEXT.md`, skill The Forge; ajustes en `docker-compose.yml`, `vite.config.ts` y paths TS del web según el paquete compartido.

### Fixed

- **Consistencia estimación**: elimina el riesgo de drift entre front (Workshop) y API al centralizar reglas en `business-rules`.
- **Semáforo HIGH**: reduce falsos AMARILLO cuando el modelo de dominio en grafo está enlazado aunque el texto MDD aún no cubra todos los apartados §3–§5.
- **Legacy**: evita avanzar con síntesis LLM cuando el índice MCP y el SDD ingerido divergen de forma grave, salvo resolución explícita del usuario.

### Impacto arquitectónico (grafo de dependencias)

- **Nuevo nodo de paquete**: `api` y `web` → `@theforge/business-rules` ← `@theforge/shared-types`.
- **`EngineModule` → `GraphMemoryModule`**: el motor de validación MDD/semáforo queda acoplado al subsistema de grafo (Falkor) en el camino HIGH con scope de proyecto/etapa.
- **`LegacyFlowModule` → `AiAnalysisModule`**: el coordinador legacy depende explícitamente de `GraphMemoryService` para gates de alineación.
- **Inversión de dependencias en orquestador**: `AiOrchestratorService` solo conoce interfaces (puertos); los módulos `projects` y `theforge` mantienen las implementaciones Nest y exportan los tokens.

### Nota sobre "Google Antigravity"

En este repositorio **no existe una dependencia llamada Google Antigravity**; la pila agéntica documentada es **LangChain / LangGraph**, LLM **vía OpenRouter** (adapter) y MCP. Cualquier referencia externa a "Antigravity" debe interpretarse como **agentes IDE / flujo Workshop**, no como módulo interno.

---

## [0.4.0] — 2026-05-16

### Changed

- **BRD (greenfield y legacy):** El prompt de generación ahora exige que el BRD comience con la sección **«Pain Points & Problem Statement»**, incluyendo mapa de dolores (tabla), validación de demanda, perfil del cliente objetivo y consecuencias de no actuar. Los datos se extraen del DBGA o codebase doc; si falta evidencia se indica como «Por validar».
  - `apps/api/src/modules/projects/projects.service.ts` — prompt `DBGA_BRD_TOBE_SUGGEST_SYSTEM` + `brdPrompt` para greenfield
  - `apps/api/src/modules/legacy-flow/legacy-coordinator.service.ts` — prompts de BRD inicial y BRD de cambio para legacy

### Added

- **Sección Pain Points & Problem Statement en BRD:** Estructura estandarizada de 4 sub-secciones que obliga al LLM a documentar el problema de negocio antes de pasar a requisitos.
- **Botón «Reparar» en guía UX/UI:** Nuevo botón con icono Wrench en la toolbar del panel UX/UI Guide que toma el markdown existente (de IAs externas o copiado manualmente) y genera el YAML frontmatter estructurado para el preview visual de DesignMdPreview. Usa las funciones existentes `replaceYamlFrontMatter`, `extractDesignMdFrontMatter`, `fillDesignMdDefaults` y `tokensToYamlFrontMatter`.

---

## [0.3.0] — 2026-05-02

### Added

- **AEM (Análisis y Estrategia de Mercado)**: nueva pestaña en el Workshop con editor preview/source, auto-save al perder foco, y soporte en ZIP de descarga. Campo `aemContent` en Prisma + DTO + MCP tool `set_aem_content`.
- **Design token extraction**: reemplazado extractor LLM-based por tool MCP dedicado `extract_design_tokens` en AriadneSpecs (sin LLM, más rápido). Añadido método `extractDesignTokens()` en TheForgeService. Eliminado `design-token-extractor.ts`.

### Changed

- **Docs**: actualizados MCP server docs, CHANGELOG, README.

---

## [0.2.0] — 2026-05-02

### Added

- **BRD/To-Be/As-Is por Stage:** Campos `brdContent`, `toBeManualContent`, `asIsManualContent`, `brdApprovedAt`, `toBeApprovedAt` en Prisma `Stage`. Flujo greenfield: BRD → To-Be (gate opcional) → MDD. Flujo legacy: As-Is desde codebaseDoc → BRD/To-Be → MDD de cambio.
- **Gates BRD/To-Be:** `requireBrdTobeGate` por proyecto. Streams MDD emiten `blocked` si faltan aprobaciones. Preámbulo `composeBrdToBeAsIsPreamble` en síntesis MDD.
- **Etapas como cambios legacy:** Cada etapa de cambio es un `Stage` independiente con FalkorDB (`LegacyStage` nodos + `DERIVED_FROM` por ordinal). Dual-write legacy → stage para migración gradual.
- **Prompts incrementales en etapas legacy:** MDD de etapa base (hasta 30k chars) inyectado como contexto con instrucción "describe SOLO las modificaciones respecto a esta línea base".
- **BRD/To-Be legacy como reflejo del MDD inicial:** En Stage 1 se titulan "BRD (sistema actual)" y "Manual To-Be (sistema actual)".
- **Desambiguación en chat legacy:** Instrucción en prompt: "Si el usuario menciona un cambio o hay ambigüedad, preguntar si es consulta o cambio."
- **Botón "+ Nueva etapa de cambio":** En WorkshopView, modal con selección de etapa fuente para crear nuevas etapas legacy.
- **FalkorDB `syncLegacyStage` / `clearLegacyStage`:** Sincronización de nodos `:LegacyStage` con relaciones `DERIVED_FROM` y `HAS_LEGACY_STAGE`.
- **Schema `copyLegacyChangeFromStageId`:** En `createStageBodySchema` para copiar estado legacy entre etapas.
- **Variables de entorno:** Documentación completa de todas las variables `LEGACY_*`, `THEFORGE_CONTEXT_*`, `MCP_*`, `FALKORDB_*`, `PRISMA_*` y operacionales en `README.md` y `.env.example`.

### Changed

- **`LegacyCoordinatorService`:** Migración completa de métodos → `getLegacyChangeState()` + `persistLegacyChangeState()` con dual-write y fallback a `project.legacyFlowState`.
- **`createStage` en `proyectos.service.ts`:** Búsqueda de `parentStageId` por ordinal para FalkorDB `DERIVED_FROM`.
- **`WorkshopView.tsx` y `workshopStore.ts`:** ~30 referencias migradas de `project.legacyFlowState` → `activeLegacyState`.
- **Controller legacy:** Endpoints aceptan `stageId` opcional para operaciones multi-etapa.
- **Documentación:** `blueprint.md`, `mdd.md`, `PROJECT_BRAIN_DUMP.md` actualizados a v2.0 reflejando el estado actual del proyecto.

### Fixed

- **Error de build en Dokploy:** `@theforge/web#build` fallaba por `brdGateBlocked` declarada pero no usada en `WorkshopView.tsx`. Eliminadas IIFEs muertas. Commit `0a8c600`.
- **Legacy:** BRD/To-Be en Stage 1 ahora reflejan el MDD inicial como sistema actual, no como documento de cambio.

### Impacto arquitectónico

- **Nuevo eje en Pipeline MDD:** BRD/To-Be como precursores opcionales antes del MDD técnico. Gates que bloquean pasos LLM y emiten eventos `blocked`.
- **Grafo de etapas:** FalkorDB ahora modela relaciones `DERIVED_FROM` entre etapas legacy por ordinal, permitiendo trazabilidad completa de cambios.
- **Dual-write:** `legacyFlowState` en `legacyCoordinator` se escribe tanto en `project.legacyFlowState` como en `stage.legacyChangeState` durante migración.

---

Este documento representa el estado incremental del proyecto a fecha de **2 de mayo de 2026**.

---

## [0.6.0] — 2026-05-21

### Added

- **`@theforge/shared-types/markdown-table`**: Nueva función experta en tablas markdown como único punto de verdad. `generateTable(columns, rows, caption?)` genera tablas normalizadas desde datos estructurados. `normalizeTable(table)` corrige tablas existentes (quita línea en blanco tras separador, padding uniforme, alineación detectada). `normalizeAllTables(doc)` corrige todas las tablas en un documento. 4 nuevas MCP tools: `generate_markdown_table`, `normalize_markdown_table`, `generate_mermaid`, `normalize_mermaid`.
  - `packages/shared-types/src/markdown-table.ts` — implementación
  - `packages/shared-types/src/mermaid.ts` — implementación
  - `packages/mcp-server/src/index.ts` — tools + handlers

- **`@theforge/shared-types/mermaid`**: Nueva función experta en diagramas Mermaid. `generateMermaid({type, options})` genera sintaxis válida para flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, stateDiagram, pie, gitGraph. `normalizeMermaid(raw)` corrige errores comunes (IDs con espacios → underscore, bloques sin cerrar, quotes). `validateMermaid(raw)` reporta errores sin modificar.

### Changed

- **`packages/mcp-server`**: 4 nuevas tools de utilidad (`generate_markdown_table`, `normalize_markdown_table`, `generate_mermaid`, `normalize_mermaid`) que importan y delegan en `@theforge/shared-types`, manteniendo las funciones como single source of truth para que el pipeline de generación de documentos también pueda importarlas directamente sin pasar por MCP.

---

## [0.7.0] — 2026-05-19

### Added

- **Cascada de documentos en paralelo:** `generateDeliverablesCascade` reemplaza `for...of await` con `Promise.allSettled()`. Los 11 documentos (Blueprint, Spec, Arquitectura, etc.) se generan simultáneamente. HIGH: de ~5-22min a ~30s-2min. Cada documento es una llamada LLM independiente sin estado compartido — riesgo cero de `INVALID_CONCURRENT_GRAPH_UPDATE`.
- **Progreso visible en el chat:** `agentProgress` ahora acumula (append) cada documento completado con icono ✅. El botón muestra "Generando documentos (N)" con el conteo en vivo.

### Changed

- **`projects.service.ts`**: `completedCount` atómico en vez de array index para progreso real con paralelismo. Labels legibles para la UI (Blueprint, Spec, Arquitectura, etc.).
- **`workshopStore.ts`**: `generateDeliverablesCascade` usa `set((s) => ({ agentProgress: [...s.agentProgress, { agent, message }] }))` en vez de reemplazar.
- **`WorkshopView.tsx`**: Botón muestra "Generando documentos (N)" en vez de "Generando step (N/11)".

### Fixed

- **INVALID_CONCURRENT_GRAPH_UPDATE revertido (PR #175):** Security e Integration escriben ambos a `mddStructured` (canal `LastValue`). Revertidos a secuencial. CrossConsistency+DiagramInjector permanecen en paralelo porque escriben a canales distintos.
- **Docker build mcp-server (PR #171, #173, #174):** Contexto cambiado de subdirectorio a repo root para resolver workspaces npm. Agregados `@theforge/shared-types` y `@theforge/config` como dependencias. Producción copia `node_modules` raíz (npm hoist).

---

## [0.6.0] — 2026-05-19

### Added

- **NodeCacheService**: Cache en memoria por nodo LLM con TTL de 1 hora. Cada nodo del pipeline MDD (Clarifier, Software Architect, Security, Integration, LLM Formatter, Cross-Consistency) calcula un hash SHA-256 de sus campos de entrada y reusa el resultado si el input no cambió. En re-runs tras fallo, el ahorro es de ~70-85% del tiempo total del pipeline.
- **Paralelismo Security + Integration** (ambos grafos): Security (§6) e Integration (§7) corren en paralelo en el grafo `createMddGraph` (one-shot) y `createMddGraphWithManager` (Manager). Escriben keys distintas del estado (`mddStructured.seguridad` vs `mddStructured.integracion`). Ahorro ~15s.
- **Paralelismo Cross-Consistency + DiagramInjector** (grafo one-shot): CrossConsistency (read-only, produce `internalDirectives`) y DiagramInjector (code-only, inyecta diagramas) corren en paralelo tras LLMFormatter. Auditor espera a ambos mediante fan-in. Sin riesgo de precisión porque el Auditor usa shortcut code-only (99% casos) que no evalúa diagramas.

### Changed

- **`mdd-graph.ts`**: Los nodos LLM se envuelven con `wrapCache()` que checkea cache antes de ejecutar. Se añadió `routeAfterSecurity` → `format_after_redactor` (en vez de `integration`) para el caso default.
- **`ai-analysis.service.ts`**: Inyecta `NodeCacheService` y lo pasa a `createMddGraph` y `createMddGraphWithManager` via `MddGraphCompileOptions.nodeCache`.

---

## [0.5.0] — 2026-05-19

### Added

- **Cross-project table import (`get_project_tables` tool):** El Software Architect ahora puede importar tablas SQL de otro proyecto de TheForge durante la generación del MDD. Se invoca con `get_project_tables(projectId, tableNames?)`. Útil cuando un proyecto necesita tablas compartidas de un proyecto existente. Ver README sección "Cross-Project Table References".
- **MCP tool `get_project_tables`:** Nueva herramienta en el MCP server que expone la misma funcionalidad para acceso externo.
- **Detección de lenguaje natural para regenerar secciones:** El chat del MDD ahora reconoce frases como "regenera sección 2" sin necesidad del comando `/`.

### Fixed

- **Secciones §6-§7 preservadas al regenerar §2:** Doble capa: prompt + post-processing code para que el SA no reemplace Seguridad e Infraestructura con placeholders.
- **Líneas en blanco en tablas markdown:** Regla explícita en prompts para evitar renderizado roto.
- **Anti-Swagger/OpenAPI en §4:** Prohibición explícita con ejemplo concreto para evitar que el SA genere OpenAPI specs en vez de markdown plano.

### Changed

- **`tool-registry.ts`:** `getMddArchitectTools()` ahora retorna `[createGetProjectTablesTool()]` (antes array vacío).

---
