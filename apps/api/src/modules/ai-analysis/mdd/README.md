# Auditoría manual MDD

Patrón espejo de `phase0/` → `Phase0ManualAudit`.

## Flujo

1. `POST /ai-analysis/mdd/audit` — corre el nodo **Auditor MDD** sobre el `mddContent` visible (body opcional) o el de la etapa.
2. Si score ≥ 85, sin secciones faltantes y sin `critical_gaps` → `audit_complete`.
3. Si hay gaps → `audit_started` + preguntas (máx. 5) derivadas de validación estructural + `critical_gaps`.
4. `POST /ai-analysis/mdd/audit/answer` — integra respuesta en el MDD (`mdd-audit-update-prompt.md`), re-audita y continúa o `done`.

## Persistencia

- Estado de entrevista: `Stage.shortTermContext.mddAuditInterview`
- Snapshot semáforo: `Stage.shortTermContext.mddAuditSnapshot` vía `EstimationService`
- MDD actualizado: `Stage.mddContent` al finalizar

## UI

`apps/web/src/components/MddManualAudit.tsx` en pestaña MDD del Workshop.
