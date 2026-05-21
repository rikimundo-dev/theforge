# Componentes (`apps/web/src/components`)

| Componente | Rol |
|------------|-----|
| **ProviderInstancesCard** | CRUD/listado de instancias de proveedor IA; marca la instancia **Activa** (runtime por defecto del grafo MDD y chat). |
| **AgentsConfigCard** | Ajustes → **Agentes** → **Auditor**: selector de instancia dedicada (`mddAuditorTenantInstanceId`). Sin selección, el Auditor usa el mismo runtime que la instancia activa. |
| **McpSecretCard** | Secret MCP rotable del usuario. |
| **AriadneConfigCard** | URL/token MCP de Ariadne (base de conocimientos). |
| **LegacyMcpDebugPanel/** | Panel colapsable (MDD Inicial, LEGACY): traza petición↔respuesta JSON-RPC con Ariadne cuando el API envía `mcpDebugTrace` (`LEGACY_CODEBASE_DOC_MCP_DEBUG_UI=1`); botón **Copiar traza**. En **WorkshopView**, **Copiar MDD** junto al título copia el markdown de partida. Ver README en la carpeta. |
