# LangChain tools (AiAnalysis)

- **`tool-registry.ts`** – Compone toolsets por flujo (Scout, Auditor, SDD, legacy TheForge).
- **`agent-theforge-tools.ts`** – Herramientas MCP Ariadne fijadas a `theforgeProjectId`:
  - **`getLegacyTheForgeAgentTools`** – Coordinador legacy / ReAct: incluye `get_c4_model` (sin argumentos; proyecto ya ligado), `ask_codebase`, `get_modification_plan`, lectura de archivos, impacto, defs/refs, etc.
  - **`getMddArchitectTheForgeTools`** – Nodo arquitecto MDD en legacy: `get_c4_model`, `get_contract_specs`, `get_legacy_impact` para alinear §2–§4 con el índice.

`get_c4_model` requiere que el despliegue **mcp-ariadne** tenga JWT al API Nest (`ARIADNE_API_*`); si no, devuelve texto vacío y el agente recibe un mensaje explicativo.
