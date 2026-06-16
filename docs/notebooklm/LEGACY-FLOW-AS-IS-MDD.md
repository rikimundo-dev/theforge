# Flujo legacy — Etapa 1 AS-IS y MDD de cambio

**Propósito:** Documentación operativa del flujo **LEGACY** en The Forge (Workshop + `legacy-flow`), alineada al código en `apps/api/src/modules/legacy-flow/` y `apps/web/src/views/WorkshopView.tsx` (junio 2026).

**Fuente de verdad en código:** `apps/api/src/modules/legacy-flow/README.md`.

---

## 1. Dos documentos distintos (no confundir)

| Artefacto | Pestaña Workshop | Campo persistido | API | Origen |
|-----------|------------------|------------------|-----|--------|
| **MDD Inicial (doc. partida)** | **MDD Inicial** | `legacyFlowState.codebaseDoc` | `POST …/legacy/generate-codebase-doc` | MCP **`generate_legacy_documentation`** (Ariadne, determinista desde Falkor) |
| **MDD canónico (7 secciones)** | **MDD** | `Stage.mddContent` | `POST …/legacy/generate-mdd` | LLM + revisor + **inyección determinista** de tablas desde `codebaseDoc` (etapa 1) |

**Regla UI (PR #318):** En pestaña **MDD**, **Regenerar** llama siempre `generate-mdd`. **No** vuelve a llamar Ariadne. Para re-indexar el codebase → pestaña **MDD Inicial**.

---

## 2. Etapa 1 (`ordinal === 1`) — documentación AS-IS

### 2.1 Orden recomendado

1. **MDD Inicial** — generar doc. partida (multi-repo: cabecera `## Repositorio:` por root).
2. **MDD** — sintetizar MDD canónico desde esa doc. (requiere `codebaseDoc` ≥ ~300 caracteres).
3. **BRD** (opcional) — `suggest-brd-from-codebase-doc` desde el inventario Ariadne. **Etapa 1:** doc de partida **completo** en prompt (sin truncado head/tail 120k); inventario previo + apéndice anti-resumen; ver `LEGACY_BASELINE_BRD_*`.
4. **Entregables** — cascada bulk o regeneración individual (misma pipeline desde junio 2026).

### 2.2 Qué hace `generate-mdd` en etapa 1

- **`isLegacyBaselineStage(stage)`** (`ordinal === 1`): fuerza modo **AS-IS** aunque exista `description` en `legacyChangeState`.
- **Sin** preámbulo BRD ni consultas de cambio (`ask_codebase` de impacto de modificación).
- **§1 Contexto:** sistema **tal como existe hoy** — prohibido lenguaje de MVP pendiente o «modificar el sistema» (PR #317).
- Tras borrador LLM + **LegacyReviewerService** (`asIsBaseline: true`):
  - **`injectComponentDiagramIntoMddSection2`** — diagrama Mermaid en §2 desde entidades/API del `codebaseDoc`.
  - **`injectAsIsCodebaseEvidenceIntoMdd`** — sustituye **§3, §4 y §5** por tablas del `codebaseDoc` (PR #319, #320).

### 2.3 Inyección determinista (anti-resumen LLM)

El LLM tendía a resumir con:

- «Otras entidades significativas (60+ adicionales)»
- «(Además, servicios para cada Content Type restante: …)»

**Solución:** post-proceso en `legacy-as-is-mdd-inject.util.ts`:

| Sección MDD | Subsección en `codebaseDoc` | Formato |
|-------------|----------------------------|---------|
| §3 Modelo de Datos | `### Entidades y modelo de datos` | `\| Entidad \| Origen \| Atributos (muestra) \|` |
| §4 Contratos de API | `### Contratos API` | `\| Ruta \| Métodos \| Fuente \|` |
| §5 Lógica y Edge Cases | `### Lógica de negocio` | `\| Servicio \| Dependencias (paths) \|` |

Multi-root: bloques repetidos bajo `### {nombre repo}`.

**Desactivar:** `LEGACY_AS_IS_MDD_EVIDENCE_INJECT=0`.

**Límites doc. partida (Ariadne → markdown):** `LEGACY_MDD_TABLE_ROW_SAMPLE` (default **250** filas por tabla). Si aparece «_N entidad(es) más no mostradas_» en MDD Inicial, regenerar doc. partida tras subir el límite o completar índice Ariadne.

---

## 3. Etapas 2+ — MDD de cambio

- Preámbulo **BRD** (si existe en la etapa).
- **Línea base:** MDD de la etapa anterior (`ordinal - 1`).
- Contexto TheForge: `validate_before_edit`, `get_file_content`, `ask_codebase` acotados a la **descripción del cambio**.
- **No** aplica inyección AS-IS de §3–§5 (solo etapa 1).
- Gate opcional **`requireBrdTobeGate`:** BRD + To-Be aprobados antes de `generate-mdd` / entregables (legacy: default **off** en etapa 1).

---

## 4. Entregables legacy (cascada)

`POST …/legacy/generate-deliverables`:

| Condición | Pipeline por entregable |
|-----------|-------------------------|
| Hay `mddContent` | `ProjectsService.generateDocument` (paridad con botón individual) |
| Solo `codebaseDoc` | `generate-from-codebase` |
| Fallback | `legacy_run_step_fallback` (solo `ux_ui_guide`, `agent_governance` en reverse-engineering) |

**Etapa 1 (`ordinal === 1`) — detalle completo (junio 2026):** cuando `isLegacyBaselineStage`, la cascada activa **`legacyBaselineStage`** en cada generador:

- MDD **íntegro** en prompts (sin presupuesto 50k ni `slice` 8k–12k por entregable).
- **Sin section merge** (`attemptSectionMerge: false`; razón `legacy_baseline_stage_full_detail`).
- Apéndice de prompt **anti-resumen** («N adicionales», «véase MDD», etc.).
- Reverse-engineering (`solo codebaseDoc`): tope ampliado vía `LEGACY_BASELINE_REVERSE_ENGINEERING_MAX_CHARS` (default sin truncar).

Desactivar: `LEGACY_BASELINE_FULL_DETAIL=0` (vuelve al comportamiento compacto histórico).

**Spec etapa 1:** no usa section merge; prompt AS-IS con §1 + dominios §3 + reglas §5 (sin volcar tabla §4 API). Regenerar Spec individual tras desplegar.

**Casos de uso etapa 1:** mismo criterio que Spec — monolítico, extracto AS-IS (§1/§3/§5), flujos en lenguaje de negocio (sin POST/GET como pasos principales), checklist de actores/capacidades y matriz de trazabilidad única. Regenerar tras desplegar.

**Historias de usuario etapa 1:** monolítico; backlog AS-IS desde §1/§3/§5 + Spec/CU; AC de negocio (rutas solo en Notas técnicas); matriz por capacidad/actor/CU, no por endpoint. Regenerar en cascada **después** de Spec y CU AS-IS.

**Blueprint etapa 1:** monolítico con MDD completo §1–§7; **una** sección §2 persistencia y **una** §6 riesgos; árbol `erp`=Strapi / `oohbp2`=frontend React; secciones 1–8 + Cumplimiento MDD. Regenerar **antes** de Spec/CU/HU si usas cascada completa.

**Flujos de lógica etapa 1:** monolítico o **por lotes §5** cuando hay más servicios que `LEGACY_AS_IS_LOGIC_FLOWS_BATCH_SIZE` (default 18); un flujo por servicio §5; rutas HTTP literales de §4; pasos inferidos marcados; Mermaid con cierre ```; **re-pase automático** de servicios faltantes si cobertura < objetivo (`LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_TARGET`, default 90%). Telemetría en `lastDeliverablesDebug.logicFlowsSection5Coverage`. Regenerar tras MDD/Blueprint AS-IS.

Telemetría: `legacyFlowState.lastDeliverablesDebug.pipelineMode`, `legacyBaselineStage`, `strategyDecisions`.

---

## 5. Gate índice Ariadne ↔ grafo SDD (Falkor)

Antes de doc. partida / MDD / entregables: **`assertLegacyIndexSddGate`**.

- Índice vacío + SDD rico → **409** `LEGACY_INDEX_SDD_MISMATCH`.
- Bajo solapamiento entidades/rutas → **409**.
- Resolución: `POST …/legacy/resolve-index-sdd-conflict`.

Desactivar: `LEGACY_SDD_INDEX_GATE=0`.

---

## 6. Variables de entorno (legacy)

| Variable | Default | Efecto |
|----------|---------|--------|
| `LEGACY_AS_IS_MDD_EVIDENCE_INJECT` | on | Inyección §3–§5 AS-IS |
| `LEGACY_MDD_COMPONENT_DIAGRAM` | on | Diagrama componentes en doc. partida y §2 MDD |
| `LEGACY_MDD_TABLE_ROW_SAMPLE` | 250 | Filas máx. en tablas MDD Inicial |
| `LEGACY_EVIDENCE_FIRST_CONTEXT` | on | Descubrimiento escalonado en `generate-mdd` |
| `LEGACY_SDD_INDEX_GATE` | on | Cruce índice/SDD |
| `LEGACY_DELIVERABLES_SECTION_MERGE` | all | Ventanas por § en entregables (etapas 2+; etapa 1 fuerza monolítico) |
| `LEGACY_BASELINE_FULL_DETAIL` | on | Etapa 1: MDD completo + sin section merge |
| `LEGACY_BASELINE_MDD_DELIVERABLE_BUDGET` | full | Tope MDD en entregables etapa 1 (`0`/`full` = sin truncar) |
| `LEGACY_BASELINE_REVERSE_ENGINEERING_MAX_CHARS` | full | Tope `codebaseDoc` en cascada sin MDD |
| `LEGACY_BASELINE_BRD_CODEBASE_DOC_MAX_CHARS` | full | Tope doc en `suggest-brd-from-codebase-doc` etapa 1 |
| `LEGACY_BASELINE_BRD_INVENTORY_REF_MAX_CHARS` | full | Doc de partida tras pasada inventario BRD |
| `LEGACY_BASELINE_BRD_EVIDENCE_PATHS` | full | Filas máx. en `### Rutas de evidencia` al compactar BRD |
| `LEGACY_AS_IS_LOGIC_FLOWS_BATCH` | on | Lotes §5 en flujos de lógica etapa 1 (`0` = un solo pase) |
| `LEGACY_AS_IS_LOGIC_FLOWS_BATCH_SIZE` | 18 | Servicios §5 por lote LLM |
| `LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_TARGET` | 90 | % objetivo cobertura §5 (heurística por mención en doc) |
| `LEGACY_AS_IS_LOGIC_FLOWS_GAP_PASS` | on | Re-pase LLM para servicios §5 sin mención tras ensamblado |
| `LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_GATE` | on | Banner Workshop cuando cobertura §5 < objetivo (solo legacy etapa 1) |

**Regeneración individual (pestaña):** en proyectos `LEGACY` etapa 1, `POST /projects/:id/generate-{blueprint|api-contracts|logic-flows|infra}` pasa `legacyBaselineStage` + TheForge igual que la cascada `POST …/legacy/generate-deliverables`. Tras regen de flujos, telemetría en `legacyFlowState.lastDeliverablesDebug.logicFlowsSection5Coverage`.

---

## 7. Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Regenerar MDD llama Ariadne / «Regenerando MDD Inicial» | UI antigua | Desplegar ≥ PR #318; usar pestaña MDD |
| §3 con lista por comas de entidades | MDD generado antes de #319 o inject off | Regenerar MDD; verificar `LEGACY_AS_IS_MDD_EVIDENCE_INJECT` |
| §5 «Además, servicios…» | MDD antes de #320 | Regenerar MDD tras deploy #320 |
| Faltan entidades/servicios en tablas | `codebaseDoc` truncado o grafo Ariadne incompleto | Regenerar **MDD Inicial**; re-sync/reindex repo en Ariadne |
| §1 habla de «incorporar MVP» en etapa 1 | MDD persistido antes de #317 | Regenerar MDD en etapa 1 |

---

## 8. Referencias

- [LEGACY-EVIDENCE-CONTEXT.md](LEGACY-EVIDENCE-CONTEXT.md) — contexto evidencia-first / semantic_search.
- [integracion-theforge/SPEC-MCP-001-THEFORGE.md](integracion-theforge/SPEC-MCP-001-THEFORGE.md) — contrato MCP.
- [integracion-theforge/HERRAMIENTAS-MCP-THEFORGE.md](integracion-theforge/HERRAMIENTAS-MCP-THEFORGE.md) — catálogo tools.
- [PLAN-BRD-TOBE-MANUAL-PROCESOS-THEFORGE.md](PLAN-BRD-TOBE-MANUAL-PROCESOS-THEFORGE.md) — gates BRD/To-Be (plan + estado).

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
