# Prompts legacy (descubrimiento escalonado)

- **`staged-discovery-mdd-prompt.md`** — System prompt Plan-and-Execute para MDD inicial / evidencia de cambio. Placeholders:
  - `{{theforgeProjectId}}` — UUID que debe repetir el modelo en cada tool (Supervisor + proyecto).
  - `{{ariadneRepositoriesCatalog}}` — tabla/listado desde `list_known_projects` (ver `staged-discovery-catalog.util.ts` + `hydrateStagedDiscoveryMddPrompt`).
  El flujo obliga **Fase 0** (repos y roles) antes de búsquedas masivas.
