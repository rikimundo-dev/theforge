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
3. **BRD** (opcional) — `suggest-brd-from-codebase-doc` desde el inventario Ariadne.
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

Telemetría: `legacyFlowState.lastDeliverablesDebug.pipelineMode`.

Section merge: `LEGACY_DELIVERABLES_SECTION_MERGE` (`all` \| `auto` \| `blueprint` \| `0`).

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
| `LEGACY_DELIVERABLES_SECTION_MERGE` | all | Ventanas por § en entregables |

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
