# Componentes (`apps/web/src/components`)

| Componente | Rol |
|------------|-----|
| **ProviderInstancesCard** | CRUD/listado de instancias de proveedor IA; marca la instancia **Activa** (runtime del grafo MDD y chat). En el modal, **Modelo de auditor** opcional (`auditorChatModel`) para el nodo Auditor MDD. |
| **AccountConfigCard** | Ajustes → Cuenta: secret MCP rotable y preferencias del taller. |
| **McpSecretCard** | Re-export de `AccountConfigCard` (compat). |
| **AriadneConfigCard** | URL/token MCP de Ariadne (base de conocimientos). |
| **LegacyMcpDebugPanel/** | Panel colapsable (MDD Inicial, LEGACY): traza petición↔respuesta JSON-RPC con Ariadne cuando el API envía `mcpDebugTrace` (`LEGACY_CODEBASE_DOC_MCP_DEBUG_UI=1`); botón **Copiar traza**. En **WorkshopView**, **Copiar MDD** junto al título copia el markdown de partida. Ver README en la carpeta. |
