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

### Nota sobre “Google Antigravity”

En este repositorio **no existe una dependencia llamada Google Antigravity**; la pila agéntica documentada es **LangChain / LangGraph**, adapters **OpenAI / Google Gemini** y MCP. Cualquier referencia externa a “Antigravity” debe interpretarse como **agentes IDE / flujo Workshop**, no como módulo interno.

---

Este documento representa el estado incremental del proyecto a fecha de **27 de marzo de 2026**. Úsalo para contrastar con la documentación base y responder sobre la evolución de las funcionalidades.
