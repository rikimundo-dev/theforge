/**
 * @fileoverview **Catálogo JSDoc** de las herramientas MCP de **@theforge/mcp-server** (`index.ts`).
 * Paridad: mismos `name` que el array `TOOLS` y las claves del mapa `handlers`. Cada tool delega en la
 * **API Nest The Forge** (`THEFORGE_API_URL`, default `http://theforge-api:3000` en Docker; `http://localhost:3000` en dev local) con JWT obtenido via
 * **MCP_M2M_SECRET** (`/auth/mcp-login` o flujo equivalente documentado en el servidor).
 *
 * @packageDocumentation
 * @module mcp-tools.doc
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 *
 * ## Autenticación
 *
 * - Sin `MCP_M2M_SECRET` el servidor arranca en modo dev sin auth (solo local).
 * - Con secret: login al bootstrap y refresh ante `401` en `apiFetch`.
 *
 * ## Herramientas por dominio (nombre MCP → endpoint / rol)
 *
 * ### Projects
 *
 * - **`list_projects`**: `GET /projects`
 * - **`get_project`**: `GET /projects/:projectId`
 * - **`create_project`**: `POST /projects` (body: name, projectType NEW|LEGACY, hasUxTeam, theforgeProjectId si LEGACY)
 * - **`delete_project`**: `DELETE /projects/:projectId`
 * - **`get_project_stages`**: `GET /projects/:projectId/stages`
 * - **`get_project_deliverables`**: `GET /projects/:projectId` (resumen cascada + `agentGovernanceContent`)
 * - **`get_conformance`**: `GET /projects/:projectId/conformance?useLlm=`
 * - **`patch_project`**: `PATCH /projects/:projectId` (body parcial MDD/blueprint/spec/…)
 * - **`generate_benchmark`**: `POST /projects/:projectId/generate-benchmark`
 * - **`phase0_deep_research`**: `POST /projects/:projectId/phase0-deep-research`
 * - **`suggest_brd_tobe_from_dbga`**: `POST /projects/:projectId/suggest-brd-tobe-from-dbga`
 *
 * ### Deliverables / generación
 *
 * - **`generate_deliverables`**: `POST /projects/:projectId/generate-deliverables` (cascada completa)
 * - **`generate_spec`**: `POST /projects/:projectId/generate-spec`
 * - **`generate_blueprint`**: `POST /projects/:projectId/generate-blueprint` (preview, gapsFeedback)
 * - **`generate_architecture`**: `POST /projects/:projectId/generate-architecture`
 * - **`generate_api_contracts`**: `POST /projects/:projectId/generate-api-contracts`
 * - **`generate_use_cases`**: `POST /projects/:projectId/generate-use-cases`
 * - **`generate_user_stories`**: `POST /projects/:projectId/generate-user-stories`
 * - **`generate_logic_flows`**: `POST /projects/:projectId/generate-logic-flows`
 * - **`generate_infra`**: `POST /projects/:projectId/generate-infra`
 * - **`generate_agent_governance`**: `POST /projects/:projectId/generate-agent-governance` (preview, queue)
 * - **`get_agent_governance_export`**: `GET /projects/:projectId/agent-governance-export`
 * - **`confirm_complexity`**: `POST /projects/:projectId/confirm-complexity`
 * - **`reassess_complexity`**: `POST /projects/:projectId/reassess-complexity`
 *
 * ### AI Analysis (DBGA / MDD / estimación)
 *
 * - **`start_analysis`**: `POST /ai-analysis/start` (idea, projectId opcional)
 * - **`get_estimation`**: `GET /ai-analysis/estimation` (semáforo, horas, MXN)
 * - **`get_mdd_thread`**: `GET /ai-analysis/mdd/thread`
 * - **`get_adrs`**: `GET /ai-analysis/mdd/adrs`
 * - **`review_mdd`**: `POST /ai-analysis/mdd/review`
 *
 * ### AI Orchestrator
 *
 * - **`orchestrator_chat`**: `POST /ai-orchestrator/chat` (mensaje + contexto pestañas/MDD/DBGA/BRD)
 * - **`orchestrator_welcome`**: `POST /ai-orchestrator/welcome`
 * - **`orchestrator_clear_chat`**: `POST /ai-orchestrator/clear-chat`
 *
 * ### Sessions
 *
 * - **`create_session`**: `POST /sessions`
 * - **`get_project_sessions`**: `GET /sessions/project/:projectId`
 * - **`get_session`**: `GET /sessions/:sessionId`
 * - **`chat_in_session`**: `POST /sessions/:sessionId/chat`
 *
 * ### Legacy flow (AriadneSpecs / MaxPrime)
 *
 * - **`legacy_start`**: `POST /projects/:id/legacy/start`
 * - **`legacy_answer`**: `POST /projects/:id/legacy/answer`
 * - **`legacy_generate_mdd`**: `POST /projects/:id/legacy/generate-mdd` (stageId, `?includeContent=true` opcional)
 * - **`legacy_generate_codebase_doc`**: `POST /projects/:id/legacy/generate-codebase-doc`
 * - **`legacy_generate_deliverables`**: `POST /projects/:id/legacy/generate-deliverables`
 * - **`legacy_update_codebase_doc`**: `PATCH /projects/:id/legacy/codebase-doc`
 * - **`legacy_generate_as_is_manual`**: `POST /projects/:id/legacy/generate-as-is-manual`
 * - **`legacy_suggest_brd_tobe`**: `POST /projects/:id/legacy/suggest-brd-tobe-from-codebase-doc`
 * - **`legacy_resolve_index_sdd_conflict`**: `POST /projects/:id/legacy/resolve-index-sdd-conflict`
 *
 * ### Integración The Forge / Ariadne
 *
 * - **`list_theforge_projects`**: `GET /theforge/projects` (índice multi-root en Ariadne)
 *
 * @see {@link ./index.ts} constantes `TOOLS` y `handlers`
 */

/**
 * Revisión del catálogo; incrementar si cambia el conjunto de tools.
 * @constant
 */
export const MCP_THEFORGE_TOOLS_DOC_REVISION = 3;
