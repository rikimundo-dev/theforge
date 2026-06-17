# Componentes (`apps/web/src/components`)

| Componente | Rol |
|------------|-----|
| **Phase0ManualAudit** | Botón **Auditar Paso 0**: audita el **dbgaContent** visible en pestaña Fase 0 (DBGA libre o entrevista estructurada); no exige JSON de entrevista. `POST …/phase0/audit` → gaps/preguntas o `audit_complete`. |
| **MddManualAudit** | Botón **Auditar MDD**: audita el **mddContent** visible en pestaña MDD (`POST …/mdd/audit` / `…/mdd/audit/answer`). Reutiliza nodo Auditor MDD + preguntas por gaps. |
| **Phase0InterviewPanel** | Entrevistador interactivo Paso 0 (`start` → preguntas → `answer`). Incluye auditoría manual al completar. |
| **MddViewer** | Preview markdown (Fase 0, MDD, BRD, Blueprint): `repairDirectoryTreeBlocks` + detección `((Root))`/`— apps/` envuelve árboles en ` ```text `; párrafos colapsados → `<pre>` monoespaciado. Normaliza `mermaid`. |
| **DashboardSidebar** | En Workshop, «Panel de proyectos» queda `disabled` mientras `selectWorkshopAgentsBusy` (mismo criterio que el chat). |
| **ProjectMergeDialog** | Fusión de 2+ carpetas en Paso 0: config (destino, benchmark, suite, archivado), preview con conflictos, `POST /projects/merge`. |
| **RenameProjectDialog** | Renombrar proyecto (`PATCH /projects/:id` con `{ name }`). Lápiz en carpeta del dashboard, barra de selección (1 carpeta) y header del Workshop. |
| **Phase0ManualAudit** | Acepta `initialAudit` para reanudar auditoría tras fusión (`audit_started` / `audit_complete`). |
| **MddPatternsWizardDialog** | Selector SSOT con pestañas verticales (`initial \| edit`): títulos = categorías del wizard MDD (emoji + texto original). Antes de abrir: `POST …/mdd/suggest-governance-patterns` (DBGA, benchmark, BRD). Al confirmar: MDD solo con patrones `[X]` + `POST …/mdd/record-governance-pattern-adrs`. |
| **ProviderInstancesCard** | CRUD/listado de instancias de proveedor IA; marca la instancia **Activa** (runtime del grafo MDD y chat). En el modal, **Modelo de auditor** opcional (`auditorChatModel`) para el nodo Auditor MDD. |
| **AccountConfigCard** | Ajustes → Cuenta: secret MCP rotable y preferencias del taller. |
| **McpSecretCard** | Re-export de `AccountConfigCard` (compat). |
| **AriadneConfigCard** | URL/token MCP de Ariadne (base de conocimientos). |
| **LegacyMcpDebugPanel/** | Panel colapsable (MDD Inicial, LEGACY): traza petición↔respuesta JSON-RPC con Ariadne cuando el API envía `mcpDebugTrace` (`LEGACY_CODEBASE_DOC_MCP_DEBUG_UI=1`); botón **Copiar traza**. En **WorkshopView**, **Copiar MDD** junto al título copia el markdown de partida. Ver README en la carpeta. |
| **WorkshopHelpModal** | Modal **Ayuda — TheForge** (Workshop): manual, **Integración Legacy ↔ Nuevo**, SDD y referencia por documento. |
| **IntegrationPanel** | Pestaña **Integración**: enlace NEW↔LEGACY, handoff NEW-LEG, import en etapa 2+, matriz trazabilidad. |
