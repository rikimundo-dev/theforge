# Contexto legacy: evidencia primero

The Forge reduce la dependencia de respuestas **solo** sintetizadas por `ask_codebase` al armar documentación y MDD.

**Flujo completo etapa 1 (MDD Inicial → MDD → entregables):** [LEGACY-FLOW-AS-IS-MDD.md](LEGACY-FLOW-AS-IS-MDD.md).

---

## Doc. partida (`generate-codebase-doc`)

- MCP **`generate_legacy_documentation`** (Ariadne): JSON MDD determinista → markdown con secciones `Entidades`, `Contratos API`, `Lógica de negocio`, etc.
- TheForge normaliza envelopes `legacy_mdd_v1` y añade **Diagrama de Componentes** (`LEGACY_MDD_COMPONENT_DIAGRAM`, default on).
- Tablas limitadas por `LEGACY_MDD_TABLE_ROW_SAMPLE` (default **250** filas).

## Síntesis MDD etapa 1 (`generate-mdd`)

- LLM + revisor AS-IS; luego **inyección** de §3–§5 desde el `codebaseDoc` ya guardado (`LEGACY_AS_IS_MDD_EVIDENCE_INJECT`, default on).
- Evita resúmenes LLM («N adicionales», «Además, servicios…»). Ver `legacy-as-is-mdd-inject.util.ts`.

## Contexto evidencia-first (descubrimiento)

1. Varios `semantic_search` contra el grafo Ariadne (límite `LEGACY_SEMANTIC_SEARCH_LIMIT`, default 80).
2. Heurística de rutas en el texto devuelto (`extractCandidatePathsFromMcpText`).
3. `get_functions_in_file` por hasta `LEGACY_EVIDENCE_FUNCTIONS_PATHS` rutas.
4. `get_file_content` para hasta `LEGACY_EVIDENCE_FULL_FILE_PATHS` rutas prioritarias.
5. Resumen ejecutivo opcional: un `ask_codebase` con `twoPhase: true`.

## Activación

- Por defecto **activo**. Desactivar descubrimiento escalonado: `LEGACY_EVIDENCE_FIRST_CONTEXT=0` (o `false` / `off` / `no`).

## Lado Ariadne

Precisión adicional requiere índice completo (parsers/ingest) y, en el servicio ingest, telemetría `CHAT_TELEMETRY_LOG=1`. El chat acepta **`responseMode: 'evidence_first'`** para JSON MDD vía LLM; la doc. partida **canónica** usa **`generate_legacy_documentation`** (sin prosa LLM). Ver README ingest en repo Ariadne.

**Cobertura de archivos:** el ingest indexa `.mjs` y `.cjs`; hace falta **resync** del repo para que entren al grafo.

## Cruce con Falkor SDD (legacy)

El flujo legacy compara señales del índice (`gatherLegacyIndexSignals`) con `DB_Entity` / `API_Endpoint` de la etapa en **FalkorDB local** (`FALKORDB_SDD_URL`). Discrepancia grave → **409** `LEGACY_INDEX_SDD_MISMATCH` → `POST …/legacy/resolve-index-sdd-conflict`. Detalle: `apps/api/src/modules/legacy-flow/README.md`.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
