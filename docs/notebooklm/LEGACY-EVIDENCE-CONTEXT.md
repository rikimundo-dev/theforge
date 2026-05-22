# Contexto legacy: evidencia primero

The Forge reduce la dependencia de respuestas **solo** sintetizadas por `ask_codebase` al armar documentación y MDD de cambio.

## Flujo

1. Varios `semantic_search` contra el grafo Ariadne (límite `LEGACY_SEMANTIC_SEARCH_LIMIT`, default 80; el MCP admite órdenes mayores — ajusta si saturás contexto). El texto concatenado multi-repo para la **§ doc. partida** usa un recorte aparte: `LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS` (default 48k), distinto del recorte genérico `LEGACY_SEMANTIC_SECTION_MAX_CHARS` (16k) que aplica en otros flujos.
2. Heurística de rutas en el texto devuelto (`extractCandidatePathsFromMcpText`).
3. `get_functions_in_file` por hasta `LEGACY_EVIDENCE_FUNCTIONS_PATHS` rutas.
4. `get_file_content` para hasta `LEGACY_EVIDENCE_FULL_FILE_PATHS` rutas prioritarias (p. ej. Prisma, `package.json`).
5. Resumen ejecutivo opcional: un `ask_codebase` que solo debe re-afirmar el bloque anterior, con `twoPhase: true` en el cliente MCP.

## Activación

- Por defecto **activo**. Desactivar: `LEGACY_EVIDENCE_FIRST_CONTEXT=0` (o `false` / `off` / `no`).

## Lado Ariadne

Precisión adicional requiere índice completo (parsers/ingest) y, en el servicio ingest, telemetría `CHAT_TELEMETRY_LOG=1` y revisión de `CHAT_TWO_PHASE`. El chat acepta **`responseMode: 'evidence_first'`** (también vía MCP `ask_codebase`) para forzar salida con `## Evidencia` primero y más contexto al sintetizador (`CHAT_EVIDENCE_FIRST_MAX_CHARS`). Ver README del servicio ingest en el repo Ariadne.

**Cobertura de archivos:** el ingest indexa además `.mjs` y `.cjs` (mismo parser JS que `.js`); hace falta **resync** del repo para que entren al grafo.

## Cruce con Falkor SDD (legacy)

El flujo legacy compara señales del índice (`gatherLegacyIndexSignals`) con `DB_Entity` / `API_Endpoint` de la etapa en **FalkorDB local** (`FALKORDB_SDD_URL`). Si hay discrepancia grave o índice vacío frente a SDD poblado, la API responde **409** con `code: LEGACY_INDEX_SDD_MISMATCH` hasta que el cliente llame `POST .../legacy/resolve-index-sdd-conflict`. Detalle: `apps/api/src/modules/legacy-flow/README.md`.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-05-22 (pnpm). Rutas relativas al monorepo `theforge`.*
