# prompts

Prompts del módulo AI. Están estructurados según marcos de ingeniería de prompts (COSTAR, RISEN, TIDD-EC) según el objetivo de cada uno: documentos completos con contexto/objetivo/audiencia (COSTAR), flujos con rol/pasos/restricciones (RISEN), salida acotada o JSON (TIDD-EC).

| Archivo                               | Uso                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **master-prompt.md**                  | Prompt maestro del Workshop. **Coherencia §1→§3/§4** (sin plantillas ajenas; ejemplos geo/fuentes DENUE, INEGI, DatsWhy, OOH) y **§5 ~70%** (Gherkin, mutaciones §4). `AiService` refuerza constitución en entregables. |
| **master-prompt.ts**                  | Carga el contenido de `master-prompt.md` desde esta misma carpeta y lo exporta como `MASTER_PROMPT`. Se inyecta como system message en cada llamada a la IA desde el Workshop.                                                                                                            |
| **discovery-benchmark-prompt.md**     | Prompt para Domain Benchmark & Gap Analysis (Paso 0). Usado por `DiscoveryService.generateBenchmark`.                                                                                                                                                                                     |
| **brd-generation-prompt.md**          | System + plantilla BRD **100 % negocio** (sin HTTP/BD/APIs): contexto comercial, capacidades, UAT, entidades de negocio, decision log. `buildBrdUserPrompt()` en `suggest-brd-from-dbga` y `legacy/suggest-brd-from-codebase-doc`. |
| **phase0-deep-research-prompt.md**    | Prompt para Deep Research (Paso 0). Usado por `DiscoveryService.generatePhase0DeepResearch`; salida en `Project.phase0SummaryContent`.                                                                                                                                                    |
| **phase0-benchmark-refine-prompt.md** | Prompt para refinar el Benchmark desde el chat (Paso 0). Cuando el usuario envía mensajes en el tab benchmark con DBGA existente, la IA devuelve el documento actualizado y termina con `---FIN_DBGA---`. Usado por `AiService.generateResponse` con `activeTab === "benchmark"`.         |
| **ux-ui-guide-prompt.md**             | Guía UX/UI (tab Guía UX/UI). Prioridad de reglas (UI/UX Pro Max); **NEW:** `## Prompt para Google Stitch (producto)`; **LEGACY:** sin Stitch. Pie **Proyecto legacy** si hay contexto MCP. Salida `---FIN_UX_UI---`. Ver `ux-guide-llm-context.ts` + `AiService.appendUxGuideStitchPolicy`. |
| **blueprint-prompt.md**               | Blueprint desde MDD (`AiService.generateBlueprint`): anti-redundancia con §3; **mapa §4→módulos**; transversales (ingesta SHP/ogr2ogr, PostGIS–Falkor, fuentes §1 como DENUE/INEGI/DatsWhy); trazabilidad §5; SSO/Bearer vs §6; fases ejemplo. Rol senior + ciberseguridad. **Legacy:** "Contexto del codebase (TheForge)". |
| **user-stories-prompt.md**            | Historias de usuario y backlog: tres tipos de ítem (**Epic**, **Historia de usuario**, **Tarea técnica**) con plantilla fija. Alineado al MDD como constitución.                                                                                                                                 |
| **architecture-prompt.md** | Entregable **Arquitectura del sistema**: **producto** del MDD (módulos, datos, APIs, Mermaid); no titular como TheForge; sin “agentes” inventados. Pie **Proyecto legacy** si hay contexto TheForge. |
| **infra-prompt.md** | Infra / Docker / env / volúmenes al MDD; pie **Proyecto legacy** (stack real del índice). |
| **logic-flows-prompt.md** | Flujos y secuencias Mermaid al MDD; pie **Proyecto legacy** (archivos/servicios citables). |
| **tasks-prompt.md** | Breakdown Backend / Front / Infra / QA; clasificación capas (Strapi schema vs lifecycles, rutas SPA vs API); pie **Proyecto legacy** con rutas del índice. |
| **spec-prompt.md** | Spec what/why desde DBGA/alcance; pie **Proyecto legacy** (superficies reales del índice). |
| **use-cases-prompt.md** | Casos de uso desde MDD+Spec; reglas anti-alucinación; pie **Proyecto legacy**. |
| **api-contracts-prompt.md** | Contratos API al MDD; pie **Proyecto legacy** (handlers/rutas del MCP). |
| **with-document-changelog-instructions.ts** | Helper `withDocumentChangelogInstructions()` — inyecta la sección obligatoria «Registro de cambios del documento» en todos los `*-prompt.ts` de generación. `cleanDocumentContent` en API añade fila 1.0 si falta al persistir. |
| **complexity-inference-prompt.ts** | JSON `complexity` + `planSummary` + `reason` (HITL); MEDIUM incluye Historias de Usuario en el ejemplo de entregables. |

El build copia `*.md` a `dist/modules/ai/prompts/` para que la API lea el archivo en runtime. El `AiService` usa `MASTER_PROMPT` por defecto al llamar a `generateResponse`.

**Legacy (TheForge MCP):** Los documentos generados con `LegacyGenerateOptions.theforgeContext` reciben en el **mensaje de usuario** un prefacio (`prependTheForgePrompt`, límite ~12k caracteres). Varios `*-prompt.md` pueden asumir ese bloque cuando el proyecto es existente.

**MDD agentic (ai-analysis):** Prompts del pipeline MDD (Clarifier, Arquitecto, Manager, etc.) y **esqueleto constitución** en `../ai-analysis/prompts/mdd/` (`mdd-constitution-skeleton.md`, `load-prompts.ts`).
