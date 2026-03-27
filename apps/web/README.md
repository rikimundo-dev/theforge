# @theforge/web

Frontend React (Vite) + Tailwind de TheForge.

- Lista y creación de proyectos; semáforo (ROJO/AMARILLO/VERDE). El proyecto incluye `complexity` (`LOW` \| `MEDIUM` \| `HIGH`) desde API para adaptar entregables (la UI puede filtrar pestañas según este campo).
- Crear proyecto: **Nuevo**, **Proyecto existente (TheForge)** o **Repositorio existente (TheForge)**. Modal TheForge con pestañas Proyectos / Repositorios (repos derivados de los roots de los proyectos); mismo flujo legacy con `theforgeProjectId` (proyecto o repo).
- Landing con cards (Nuevo proyecto, Proyectos), empty state con icono y CTA "Crear primer proyecto", iconos lucide-react en header y botones.
- **Documentos en markdown (MDD, Blueprint, Contratos API, Flujos, Infra):** cada uno en su pestaña en el Workshop; previsualización por defecto, botón "Ver fuente" para editar el markdown, auto-guardado con debounce (1,5 s) y persistencia vía PATCH al proyecto; botón "Regenerar" para regenerar desde el MDD (Blueprint, Contratos API, Casos de Uso y Flujos, Infraestructura y Despliegue). Con **`complexity === LOW`** se ocultan pestañas MDD, Blueprint y API; **Generar entregables** llama a `POST /projects/:id/generate-deliverables` (cascada según complejidad).
- **Responsive:** lista de proyectos y modales usable en móvil (`100dvh`, `viewport-fit=cover`, targets táctiles). Workshop: en `lg+` sigue el grid de 3 columnas; debajo, barra inferior Chat / Docs / Estado.
- Proxy `/api` al backend en dev. En prod, Nginx hace proxy.

`pnpm dev` → http://localhost:5173
