# Web components — spec-kit alignment

| Component | Role |
|-----------|------|
| `LlevarAlRepoWizardDialog.tsx` | Post-VERDE wizard: download repo handoff ZIP (spec-kit + agent governance) |
| `AnalyzeDashboard.tsx` | Cross-artifact SDD analyze (`GET /projects/:id/analyze`) |
| `ClarifySpecPanel.tsx` | Pre-MDD clarify on Spec tab (`POST /projects/:id/clarify-spec`). Visible on Spec tab: banner CTA, toolbar (mobile + desktop lg), and bubble menu (desktop). **Guard:** API rechaza persistir Spec vacío o changelog-only; vista previa deshabilita «Aplicar» si detecta shell inválido. |
| `WorkshopExportSddButton.tsx` | Quick spec-kit-only export |
