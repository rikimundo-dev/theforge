# @theforge/business-rules

Reglas de negocio puras compartidas entre **API** (`apps/api`) y **web** (`apps/web`).

## Contenido

- **Estimación de costos (MXN):** constantes (`HOURS_PER_ENTITY`, `RATE_MXN_PER_HOUR`, multiplicadores de `TechnicalMetadata`, tarifas por rol de referencia), `computeCostEstimation`, `getDefaultTeamStructure`.
- **Infra:** `parseInfraFixedHours` para sumar horas fijas desde markdown de infraestructura.

## Uso

Importar desde `@theforge/business-rules`. El servicio Nest `CostCalculatorService` delega aquí para una única fuente de verdad.

## Cambios

Cualquier cambio en fórmula o tarifas debe hacerse **solo** en este paquete y reflejarse en `docs/notebooklm/THEFORGE-INDEX.md` §5.
