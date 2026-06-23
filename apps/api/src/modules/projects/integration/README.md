# Project integration (NEW ↔ LEGACY)

Cross-project handoff, trace matrix, and stage promotion for brownfield SDD.

## Endpoints (`ProjectIntegrationController`)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/projects/:projectId/integration` | Status, warnings, traces, `promotableItemIds` (LEGACY) |
| `PATCH` | `/projects/:projectId/integration/link` | Bidirectional NEW ↔ LEGACY link |
| `POST` | `/projects/:projectId/integration/handoff/send` | NEW: draft → sent |
| `POST` | `/projects/:projectId/integration/stages/:stageId/import-handoff` | LEGACY: import into existing stage 2+ |
| `POST` | `/projects/:projectId/integration/stages/:stageId/reconcile-handoff` | LEGACY: retroactive Ariadne wire + `legacy/start` on imported stage |
| `POST` | `/projects/:projectId/integration/promote-to-stage` | **P1:** create stage from SENT handoff batch |

## Promote to stage (hybrid C+B)

Body (`promoteHandoffToStageBodySchema` in `@theforge/shared-types`):

```json
{ "itemIds": ["NEW-LEG-01"], "stageName": "Integración — Microservicio X", "activate": true }
```

- LEGACY only; requires `linkedNewProjectId`
- Default items: SENT traces without `legacyStageId`, else all SENT
- Creates stage via `ProjectsService.createStage`, applies `handoffSnapshot` + `legacyChangeState.description` (`buildHandoffImportDescription`)
- After import/promote: **`legacy/start`** (Ariadne `get_modification_plan`) when `LEGACY_HANDOFF_AUTO_LEGACY_START` is enabled (default)
- **Retroactive:** `POST …/stages/:stageId/reconcile-handoff` with `{ wireAriadne?, legacyStart? }` (default both true) — for stages promoted before auto-start or failed wire/analyze

## Reconcile handoff (retroactive)

Body (`reconcileHandoffStageBodySchema`):

```json
{ "wireAriadne": true, "legacyStart": true }
```

- LEGACY only; stage must already have `handoffImportedAt` or `handoffSnapshot`
- Awaits `wireAriadneBrownfieldConverge` (PATCH `theforgeStageId` on Ariadne repos) then `legacy/start` using persisted handoff description
- Does not re-import handoff from NEW (no duplicate description merge)

## Helpers

- `integration-context.util.ts` — prompt blocks, `parseSatisfiesLinksFromUserStories`
- `promote-handoff.util.ts` — item selection for promote (unit-tested)
- `reconcile-handoff.util.ts` — resolve description from stage snapshot (unit-tested)

See `docs/plans/PLAN-INTEGRATION-AS-STAGE.md`.
