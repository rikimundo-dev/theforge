# Legacy deliverables — motor de estrategia

Decide si cada entregable legacy intenta **section merge** (ventanas §1–§7 + ensamblado) o va directo al camino **monolítico** (`AiService.generate*`).

## Política (`LEGACY_DELIVERABLES_SECTION_MERGE`)

| Valor       | Comportamiento |
|------------|----------------|
| `all`      | Section merge en todos los kinds soportados (default histórico). **Etapa 1 AS-IS lo ignora** (`legacy_baseline_stage_full_detail`). |
| `blueprint`| Solo Blueprint por ventanas. |
| `off` / `0`| Nunca section merge. |
| `auto`     | Por entregable: si la estimación de tokens del user prompt monolítico supera el umbral → section merge; si no → monolítico. |

## Tokens (`js-tiktoken`)

- Se construye una **muestra de texto** del user prompt monolítico con los **mismos recortes** que `AiService` (MDD/spec/blueprint/TF) vía `buildLegacyMonolithicUserPromptSample` en `legacy-deliverables-strategy.resolver.ts`.
- El conteo usa **`js-tiktoken`** (`getEncoding`) cargado con **`import()` dinámico** para no romper la salida **CommonJS** de Nest.
- Tras el encode se suma **`LEGACY_DELIVERABLES_STRATEGY_TIKTOKEN_INSTRUCTION_OVERHEAD_TOKENS`** (default 450) como aproximación del system + plantilla fija.
- Si tiktoken falla o `LEGACY_DELIVERABLES_STRATEGY_USE_TIKTOKEN=off`, fallback: **`ceil(chars / LEGACY_DELIVERABLES_STRATEGY_CHARS_PER_TOKEN)`** (default 4). La resolución expone `tokenEstimateMethod`: `tiktoken` | `approx_chars`.

## Variables de entorno

- `LEGACY_DELIVERABLES_STRATEGY_AUTO_USER_PROMPT_TOKEN_MAX` — con `SECTION_MERGE=auto`, por encima de este tope estimado se intenta section merge (default **28000**).
- `LEGACY_DELIVERABLES_STRATEGY_CHARS_PER_TOKEN` — solo fallback `approx_chars`.
- `LEGACY_DELIVERABLES_STRATEGY_USE_TIKTOKEN` — activar/desactivar tiktoken (default on).
- `LEGACY_DELIVERABLES_STRATEGY_TIKTOKEN_ENCODING` — p. ej. `cl100k_base`, `o200k_base`.
- `LEGACY_DELIVERABLES_STRATEGY_TIKTOKEN_INSTRUCTION_OVERHEAD_TOKENS` — suma al conteo encode (default **450**).

## Archivos

- `legacy-deliverables-strategy.types.ts` — contexto (incluye `mddText` + `theforgeContextText` para conteo real) y resolución (`tokenEstimateMethod`, `tiktokenEncoding`).
- `legacy-deliverables-strategy.resolver.ts` — `buildLegacyMonolithicUserPromptSample`, `resolveLegacyDeliverablesSectionMergeAttempt` (async: precarga tiktoken).
- `legacy-deliverables-tiktoken.util.ts` — `ensureLegacyStrategyTiktokenLoaded`, `countLegacyDeliverablesPromptTokens`.
- `legacy-deliverables-strategy.service.ts` — `@Injectable()` delegando al resolver.

Telemetría: `legacyFlowState.lastDeliverablesDebug.strategyDecisions`.
