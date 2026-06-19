# Plan: Brownfield P1–P3 alignment

> **Branch:** `feat/brownfield-p1-p2-p3`  
> **Base:** `master` @ `38af795`  
> **Estado:** implementado (junio 2026)

## P1 — Integridad modelo brownfield

| ID | Entregable | Estado |
|----|------------|--------|
| P1.1 | Snapshot `source: manual` en promote/import handoff | ✅ |
| P1.2 | Snapshot al archivar/completar/superseded + activar etapa | ✅ |
| P1.3 | Escritura única `Stage.legacyChangeState`; lectura fallback project | ✅ |
| P1.4 | Schema `changeSpecContent` + migración SQL | ✅ |
| P1.5 | `docs/notebooklm/STAGE-SDD.md` actualizado | ✅ |
| P1.6 | Gate handoff UI (banner + toggle strict) | ✅ |

## P2 — Continuidad y trazabilidad

| ID | Entregable | Estado |
|----|------------|--------|
| P2.1 | Falkor post-promote: `syncHandoffItemsToStage` | ✅ |
| P2.2 | `Stage.changeSpecContent` + export / deliverables API | ✅ |
| P2.3 | Snapshot etapa anterior al activar N | ✅ |
| P2.4 | BRD F2 health en `analyze` (`brdHealth`) | ✅ |
| P2.5 | `POST /projects/:id/converge/trigger` + `CONVERGE_WEBHOOK_URL` | ✅ |
| P2.6 | Reflection loop post-blueprint (ConformanceService + changelog) | ✅ |

## P3 — OpenSpec parity

| ID | Entregable | Estado |
|----|------------|--------|
| P3.1 | `buildOpenSpecChangeExport` en repo-handoff | ✅ |
| P3.2 | Micro-spec por NEW-LEG-xx en ZIP | ✅ |
| P3.3 | `quickstart.md` desde spec + change spec | ✅ |
| P3.4 | Branch policy en IMPLEMENT.md + `openspec/BRANCH-POLICY.md` | ✅ |

## Post-P1–P3 (deferred → done)

| ID | Entregable | Estado |
|----|------------|--------|
| D1 | Eliminar columna `Project.legacyFlowState` (`004_drop_project_legacy_flow_state.sql`) | ✅ |
| D2 | Entregables live por `stageId` (`005_add_stage_deliverable_columns.sql`, `resolveLiveStageDeliverables`) | ✅ |
| D3 | Webhook converge por proyecto (`convergeWebhookUrl` / optional secret) | ✅ |

## Tests

- `packages/shared-types/src/brownfield-p1-p2-p3.spec.ts`
- `packages/shared-types/src/stage-deliverables-resolve.spec.ts`
- `packages/shared-types/src/legacy-change-state.util.spec.ts` (via stage-deliverables-resolve + legacy gate)
- `apps/api/src/modules/projects/stage-deliverable-snapshot.util.spec.ts`
- `apps/api/src/modules/projects/stage-deliverables.util.spec.ts`

## Referencias

- `docs/plans/PLAN-LEGACY-STAGE-P0-BROWNFIELD.md`
- `docs/notebooklm/STAGE-SDD.md`
