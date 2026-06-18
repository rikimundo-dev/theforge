# utils — export SDD

- **`downloadSpecKitBundle.ts`:** ZIP con layout [github/spec-kit](https://github.com/github/spec-kit) (`.specify/memory/constitution.md`, `specs/{NNN}-{slug}/`). `downloadSpecKitBundleFromApi` usa `GET /projects/:id/export/sdd-bundle`.
- **`downloadAgentGovernanceZip.ts`:** opcionalmente incluye el mismo bundle en la raíz del ZIP (`-implement-handoff.zip`) para handoff a agentes.
