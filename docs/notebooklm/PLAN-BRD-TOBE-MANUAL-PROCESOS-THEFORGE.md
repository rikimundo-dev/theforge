# Plan de implementación: BRD, Manual To-Be y As-Is en The Forge

Documento de trabajo para integrar **fases previas al MDD** (BRD + Manual To-Be en greenfield; As-Is + BRD/To-Be antes del MDD de cambio en legacy), alineado con el stack actual (NestJS, Prisma, FalkorDB, `AgentSupervisorService`, `AiOrchestratorService`, `LegacyCoordinatorService`, MCP Ariadne/TheForge).

**Estado:** en curso — G0/G1/L1/L2 parcialmente implementados en código; F1/F2 pendientes.

---

## 0. Objetivo y principios

| Objetivo             | Descripción                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Greenfield**       | Tras la entrevista proactiva, el sistema recoge **BRD** (problema, KPIs, alcance de negocio) y **Manual To-Be** (lógica deseada, diagramas de negocio) **antes** de autorizar redacción técnica del MDD §1–§7.           |
| **Legacy**           | Nutrir **As-Is** desde evidencia MCP (`ask_codebase`, `semantic_search`, grafo); definir **BRD de cambio** + **To-Be**; luego sintetizar **MDD de cambio** cruzando evidencia + reglas.                                  |
| **Anti-alucinación** | Reutilizar el patrón “**no LLM sin insumo mínimo**” (ej. casos de uso sin MDD en `AiService.generateUseCases`): **gates** explícitos antes de Manager MDD / pipeline LangGraph y antes de cascada legacy de entregables. |

**Principio YAGNI:** versionar BRD/To-Be como markdown + estado de aprobación antes de modelar grafos ricos; ampliar Falkor cuando el flujo HITL esté estable.

---

## 1. Modelo de datos (PostgreSQL + Prisma)

**Archivo base:** `packages/database/schema.prisma` (`Stage`, `Project`; `legacyFlowState` Json solo para flujo MCP legacy, **no** para BRD/To-Be).

### 1.1 Campos en `Stage` (fuente única)

- `brdContent String? @db.Text` — BRD (markdown).
- `toBeManualContent String? @db.Text` — Manual To-Be (markdown).
- `asIsManualContent String? @db.Text` — mapa As-Is (legacy / proceso actual).
- `brdApprovedAt DateTime?`, `toBeApprovedAt DateTime?` — validación cliente (HITL).
- Opcional futuro: `brdStatus` / `toBeStatus` enum si no bastan timestamps.

**Ventaja:** la constitución SDD ya es por etapa (`Stage.mddContent`); BRD/To-Be/As-Is son **precursores** de la misma etapa (o etapa `isLegacy` / orden `ordinal`).

---

## 2. Flujo Greenfield (proyectos nuevos)

### 2.1 Orquestación de chat

**Piezas actuales:** `AgentSupervisorService` (ruta por proyecto/etapa), `AiOrchestratorService.welcome`, streaming Manager en `AiAnalysisController` (`POST ai-analysis/mdd/stream/manager`), pipeline `AiAnalysisService.streamMddAnalysis` / grafo LangGraph.

**Cambios conceptuales:**

1. **UI / `activeTab`:** pasos Workshop **BRD → To-Be → MDD** con edición y aprobación en etapa activa.
2. **System prompts / grafo Manager:** el Manager sigue la entrevista; el **gate** corta antes de nodos técnicos del grafo si falta aprobación.
3. **Guardarraíl por proyecto (`Project.requireBrdTobeGate`, elegible en el Workshop):** antes de nodos que redactan **§3 modelo / §4 API** (y equivalentes en el grafo con Manager), si el flag está activo, comprobar en la `Stage` resuelta:
   - `brdContent` y `toBeManualContent` con longitud mínima (`BRD_TOBE_MIN_BODY_CHARS`).
   - `brdApprovedAt` y `toBeApprovedAt` no null.
   - Si falla → evento NDJSON `blocked` (streams) sin llamada LLM de síntesis técnica en ese paso.

**Referencias de patrón:** aplicado en **Manager stream**, **resume**, **`streamMddAnalysis`**, **`streamMddRegenerateSection`** (§2–7) y preámbulo `composeBrdToBeAsIsPreamble` en `dbgaContent`.

### 2.2 Transición al MDD

- Tras aprobación: **prepend** al benchmark/MDD base (`dbgaContent`) con BRD + To-Be + As-Is aprobados cuando existan (`composeBrdToBeAsIsPreamble`).

### 2.3 UI (web)

- Panel BRD / To-Be / As-Is en Workshop (etapa activa): edición + PATCH + botones aprobar BRD / To-Be.
- Mensaje alineado con evento `blocked` del stream MDD.

---

## 3. Flujo Legacy

### 3.1 As-Is automatizado

- **Entrada:** evidencia en `legacyFlowState.codebaseDoc` (tras `generate-codebase-doc`).
- **Producto:** persistir **solo** en `Stage.asIsManualContent` vía `POST …/legacy/generate-as-is-manual` (LLM con insumo mínimo de caracteres).
- **Edición humana:** PATCH etapa `asIsManualContent`.

### 3.2 BRD + To-Be antes del MDD de cambio

- **`generate-mdd` y `generate-deliverables`:** si `requireBrdTobeGate` está activo en el proyecto, exigen la misma `Stage` (etapa `isLegacy` si existe, si no la primaria) con BRD/To-Be aprobados. **LEGACY** por defecto `requireBrdTobeGate=false` (MDD inicial sin obligación). **`suggest-brd-tobe-from-codebase-doc`:** borradores desde `codebaseDoc`.
- **Guardarraíl índice/SDD:** `assertLegacyIndexSddGate` sigue **antes** del MDD; orden: índice/SDD resuelto → BRD/To-Be → MDD técnico.

### 3.3 MDD de cambio

- Prompt `generateMdd`: preámbulo `composeBrdToBeAsIsPreamble` + evidencia TheForge.
- Objetivo: trazabilidad To-Be → §3/§4.

---

## 4. FalkorDB y semáforo SDD

**Servicio actual:** `GraphMemoryService.evaluateSddDependencyHealth` (usado p. ej. desde `mdd-update-pipeline.service.ts`).

### 4.1 Fase 1 (valor rápido)

- Al aprobar BRD: ingesta sincronizada de objetivos (`ingestBrdObjectivesFromMarkdown`).

### 4.2 Fase 2 (semáforo)

- Extender cadena BRD → MDD en salud SDD (pendiente de diseño fino).

**Riesgo:** duplicar fuente de verdad entre markdown y grafo; mitigar con ingesta idempotente desde markdown aprobado.

---

## 5. Orden de implementación sugerido (incremental)

| Fase   | Entrega                                                                      | Criterio de “hecho”                           |
| ------ | ---------------------------------------------------------------------------- | --------------------------------------------- |
| **G0** | Prisma: campos BRD/To-Be/(As-Is) + migración; PATCH API por `stageId`        | Datos persisten y se leen en Workshop         |
| **G1** | Gates en streams MDD + `blocked` sin LLM técnico si faltan aprobaciones      | `blocked` / flujo visible en Workshop         |
| **G2** | Preámbulo BRD+To-Be+As-Is en síntesis MDD                                    | MDD referencia contexto aprobado             |
| **L1** | `Stage` legacy: gate + UI/panel BRD-To-Be                                    | Sin MDD legacy / entregables sin gate cumplido |
| **L2** | `POST …/legacy/generate-as-is-manual`                                        | `asIsManualContent` poblado desde codebase   |
| **F1** | Ingesta Falkor desde BRD aprobado                                            | Nodos consultables por Cypher                 |
| **F2** | `evaluateSddDependencyHealth` extendido                                      | ROJO si falta enlace BRD→MDD                  |

---

## 6. Riesgos y decisiones

- **Duplicidad BRD vs DBGA:** conviven; DBGA sigue siendo benchmark de mercado; BRD ancla negocio interno.
- **Legacy vs Stage:** BRD/To-Be/As-Is viven en **`Stage`**; `legacyFlowState` solo para MCP/descubrimiento (codebaseDoc, respuestas, debug).
- **Coste LLM:** As-Is + BRD + To-Be añaden pasos; reutilizar throttles existentes en entregables.
- **Privacidad:** mismas políticas que `mddContent`.

---

## 7. Referencias rápidas en repo

- Manager MDD: `apps/api/src/modules/ai-analysis/ai-analysis.controller.ts`, `ai-analysis.service.ts`.
- Gate util: `apps/api/src/modules/ai-analysis/utils/brd-tobe-gate.util.ts`.
- Legacy: `legacy-coordinator.service.ts` (`enforceLegacyBrdTobeGate`, `generateAsIsManual`), `legacy-flow.controller.ts`.
- Grafo: `graph-memory.service.ts` (`evaluateSddDependencyHealth`, `ingestBrdObjectivesFromMarkdown`).
- Esquema: `packages/database/schema.prisma` (`Stage`).

---

_Última actualización: alineado a fuente única `Stage`; priorizar L1/L2 antes de F2 si hace falta._
