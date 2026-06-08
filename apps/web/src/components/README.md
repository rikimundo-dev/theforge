# Componentes (`apps/web/src/components`)

| Componente | Rol |
|------------|-----|
| **Phase0ManualAudit** | Botón **Auditar Paso 0**: audita el **dbgaContent** visible en pestaña Fase 0 (DBGA libre o entrevista estructurada); no exige JSON de entrevista. `POST …/phase0/audit` → gaps/preguntas o `audit_complete`. |
| **Phase0InterviewPanel** | Entrevistador interactivo Paso 0 (`start` → preguntas → `answer`). Incluye auditoría manual al completar. |
| **MddViewer** | Preview markdown (Fase 0, MDD, BRD): normaliza bloques `mermaid` al pintar (`normalizeMermaidInDocument`, incl. fusión de `sequenceDiagram` partidos con `###`/`viñetas` fuera del fence), render sin `<pre>` envolviendo el SVG, y `prepareMermaidForRender` separa viñetas pegadas dentro del fence. |
| **DashboardSidebar** | En Workshop, «Panel de proyectos» queda `disabled` mientras `selectWorkshopAgentsBusy` (mismo criterio que el chat). |
| **MddPatternsWizardDialog** | Selector SSOT con pestañas verticales (`initial \| edit`): títulos = categorías del wizard MDD (emoji + texto original). Antes de abrir: `POST …/mdd/suggest-governance-patterns` (DBGA, benchmark, BRD). Al confirmar: MDD solo con patrones `[X]` + `POST …/mdd/record-governance-pattern-adrs`. |
| **ProviderInstancesCard** | CRUD/listado de instancias de proveedor IA; marca la instancia **Activa** (runtime del grafo MDD y chat). En el modal, **Modelo de auditor** opcional (`auditorChatModel`) para el nodo Auditor MDD. |
| **AccountConfigCard** | Ajustes → Cuenta: secret MCP rotable y preferencias del taller. |
| **McpSecretCard** | Re-export de `AccountConfigCard` (compat). |
| **AriadneConfigCard** | URL/token MCP de Ariadne (base de conocimientos). |
| **LegacyMcpDebugPanel/** | Panel colapsable (MDD Inicial, LEGACY): traza petición↔respuesta JSON-RPC con Ariadne cuando el API envía `mcpDebugTrace` (`LEGACY_CODEBASE_DOC_MCP_DEBUG_UI=1`); botón **Copiar traza**. En **WorkshopView**, **Copiar MDD** junto al título copia el markdown de partida. Ver README en la carpeta. |
