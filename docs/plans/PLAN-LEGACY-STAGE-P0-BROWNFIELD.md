# Plan: Legacy stage P0 brownfield alignment

> **Branch:** `feat/brownfield-p0-integration-stage`  
> **Estado:** P0 cerrado (junio 2026)

## Objetivo

Alinear etapas legacy brownfield con snapshots de entregables, gate de cambio en etapa 2+, grafo `DERIVED_FROM` N→N-1, escritura única de `legacyChangeState`, e integración NEW↔LEGACY como etapas.

## P0 checklist

| ID | Entregable | Estado |
|----|------------|--------|
| **P0.1** | Campo `Stage.deliverableSnapshot` (Prisma + migración SQL) | ✅ |
| **P0.1b** | `GET /projects/:id/stages/:stageId/deliverables` + `resolveStageDeliverables` | ✅ |
| **P0.1c** | `useStageDeliverableView` (Workshop read-only en etapas históricas) | ✅ |
| **P0.1d** | `persistStageDeliverableSnapshotFromProject` tras cascada (`source: cascade`) | ✅ |
| **P0.2** | Falkor `DERIVED_FROM` etapa N → ordinal N-1 (`createStage`, `syncCurrentLegacyStageToGraph`) | ✅ |
| **P0.3** | Escritura única `Stage.legacyChangeState` (lectura con fallback `project.legacyFlowState`) | ✅ |
| **P0.4** | Gate etapa 2+: `assertLegacyChangeGate` + banner/disabled MDD en Workshop | ✅ |
| **P0.5** | `analyze` / `converge` con `stageId` opcional | ✅ (preexistente) |

## Archivos clave

- `packages/shared-types/src/stage-deliverable-snapshot.ts`
- `packages/shared-types/src/legacy-change-gate.ts`
- `apps/api/src/modules/projects/stage-deliverable-snapshot.util.ts`
- `apps/api/src/modules/projects/stage-deliverables.util.ts`
- `apps/api/src/modules/legacy-flow/legacy-change-gate.util.ts`
- `apps/api/src/modules/legacy-flow/legacy-coordinator.service.ts`
- `apps/api/src/modules/projects/projects.service.ts` (`createStage`, `generateDeliverablesCascade`)
- `apps/web/src/hooks/useStageDeliverableView.ts`
- `apps/web/src/views/WorkshopView.tsx`

## Tests

- `stage-deliverable-snapshot.util.spec.ts`
- `legacy-change-gate.util.spec.ts`
- `promote-handoff.util.spec.ts` (gate handoff)

## Diferido / fuera de P0

- Eliminar columna `Project.legacyFlowState` (migración de datos masiva).
- ~~Snapshot en promote-to-stage manual (fuente `manual`) — usar API dedicada si se requiere.~~ → **P1** ✅
- ~~Falkor `INTEGRATES_WITH` enriquecido post-promote (P2 integración).~~ → **P2** ✅

Ver checklist completo P1–P3: `docs/plans/PLAN-BROWNFIELD-P1-P2-P3.md`.

## Referencias

- `docs/plans/PLAN-INTEGRATION-AS-STAGE.md`
- `docs/plans/PLAN-LEGACY-NEW-INTEGRATION.md`
- `docs/notebooklm/LEGACY-NEW-INTEGRATION-GUIDE.md`
