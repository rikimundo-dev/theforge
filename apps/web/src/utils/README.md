# Utilidades web

- **`apiClient.ts`** — `API_BASE`, token en `localStorage` (`getAccessToken` / `setAccessToken` / `clearAccessToken`), y **`apiFetch`**: añade `Authorization: Bearer` y ante 401 limpia sesión y dispara `theforge:auth-expired`.
- **`costCalculator.ts`** — estimación MXN desde MDD.
- **`downloadDocumentsZip.ts`** — ZIP de entregables.
- **`complexityTabs.ts`** — `isTabVisibleForComplexity(tab, complexity, { projectType })`: **LOW** oculta MDD/Blueprint/API; **MEDIUM** alinea la barra con `DELIVERABLES_BY_COMPLEXITY` (NEW: Paso 0, Spec, API, Guía UX/UI, Tasks, ADRs — sin MDD en barra; LEGACY: Modificación, MDD, Spec, API, Guía UX/UI, Tasks); **HIGH** muestra todo. Los documentos no mostrados pueden seguir en BD; la constitución para generadores sigue usando `constitutionMarkdown` en API (DBGA/Spec si no hay MDD).
