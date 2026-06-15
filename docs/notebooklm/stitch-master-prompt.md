# Prompt maestro — Google Stitch (The Forge)

**Ámbito:** el bloque **«PROMPT PARA STITCH»** de abajo sirve para diseñar **la interfaz de la aplicación The Forge** (Workshop, login, lista de proyectos, etc.). Para el **producto que el cliente está especificando** dentro de un proyecto **`projectType: NEW`**, el brief listo para Google Stitch se genera en la **Guía UX/UI** del Workshop, sección **`## Prompt para Google Stitch (producto)`** (inyecta MDD + Spec + Blueprint + demás SDD vía API).

Copia el bloque **«PROMPT PARA STITCH»** tal cual en un proyecto Stitch (o úsalo como brief si generas pantallas vía MCP). Ajusta solo colores de marca o nombre comercial si aplica.

---

## PROMPT PARA STITCH

Eres un diseñador de producto UI senior. Genera un **sistema de pantallas coherente** para una web app llamada **The Forge** (tagline: *Software Factory — Entrevista proactiva → MDD → Semáforo → Estimación*). La app está en **español (México)**. Stack de implementación objetivo: **React + Tailwind + componentes tipo shadcn/ui + Lucide**; el diseño debe ser **fácil de traducir a esos patrones** (cards, dialogs, tabs, badges, inputs con label, botones primary/secondary/outline/ghost).

### Dirección visual

- Estética **profesional B2B**, densa en información pero **respirada**; sensación de “herramienta de arquitecto de software”, no consumer social.
- Soporta **modo claro** principal; si propones oscuro, que sea **opción** consistente (tokens claros: background, foreground, muted, border, primary, destructive, warning, success).
- **Semáforo de precisión** es metáfora central: **ROJO / AMARILLO / VERDE** (no sustituir por otros colores semánticos).
- Iconografía discreta (llama/forja como marca, carpetas, ramas git, chevrons, logout, trash, refresh, loaders).
- **Accesibilidad:** contraste AA, foco visible, targets táctiles ≥44px en vistas móvil.

### Dominio funcional (para que el diseño tenga sentido)

- Los usuarios crean **proyectos** y entran al **Workshop**: entrevista guiada por IA que construye un **MDD** (documento maestro) y documentos derivados.
- **Semáforo** y **estimación en MXN** viven en un panel lateral (desktop) o inferior (móvil).
- **Complejidad del proyecto** (LOW / MEDIUM / HIGH) y tipo **NEW vs LEGACY** cambian qué **pestañas de documentos** se muestran; debes reflejar esas variantes como **notas en el lienzo** o **artboards separados**.

### Inventario de pantallas y variantes (generar todas)

1. **Login — OTP paso 1**  
   Card centrada: título con icono de marca, texto breve (“código al correo configurado”), CTA “Enviar código”, estado de carga.

2. **Login — OTP paso 2**  
   Input de código, CTA “Verificar”, enlace o botón secundario para reenviar/volver, mensaje de error inline.

3. **Home / Lista de proyectos (vacía)**  
   Header con título, subtítulo, botón Salir. Card “Nuevo proyecto” con input nombre + botones: Crear nuevo, Proyecto existente (TheForge), Repositorio existente (TheForge), Refrescar.  
   **Empty state** con ilustración ligera o icono grande, título “Aún no hay proyectos”, CTA “Crear primer proyecto”.

4. **Home / Lista de proyectos (con datos)**  
   Lista de **cards** clicables: nombre, **punto de color de semáforo** (R/A/V), “Precisión X%”, fecha, icono borrar (ghost), chevron en móvil.

5. **Modal — Base de conocimientos (TheForge)**  
   Dialog grande: título “Base de conocimientos (TheForge)”, descripción, pestañas **Proyectos** / **Repositorios**, lista de filas con nombre, badges (N repo(s), rama), path secundario; estados: loading, vacío (“no hay proyectos indexados”), error de configuración breve.

6. **Alert / Confirmar borrar proyecto**  
   Diálogo de confirmación: título “Borrar proyecto”, copy de advertencia, Cancelar / Borrar (destructive).

7. **Workshop — Desktop (≥1024px) — rejilla 3 columnas**  
   - **Columna A (Chat):** header con nombre de proyecto y volver; thread de mensajes; área de input; chip o texto “Sincronizado” / estado de persistencia; posible indicador de proveedor IA (OpenAI / Google) en header si quieres un chip pequeño.  
   - **Columna B (Documentos):** **barra de pestañas horizontales** (scroll si overflow) con estados activo/inactivo y **punto o borde** si el tab tiene contenido. Pestañas posibles (mostrar **subconjunto** según nota de variante): Modificación (legacy), MDD Inicial, Paso 0 / Benchmark, **Spec**, **MDD**, Arquitectura, Casos de uso, Historias de usuario, **Blueprint**, **Contratos API**, Flujos, **Infra**, **Guía UX/UI**, **Tasks**, **ADRs**. Contenido: vista de **markdown renderizado** con toolbar mínima (Ver fuente, Regenerar deshabilitado con tooltip, etc.).  
   - **Columna C (Estado):** **semáforo circular** o gauge con icono (candado / alerta / check según estado), texto de estado; bloque **desglose de costos MXN** (subpartidas + total); botón primario **“Generar entregables”** en estado **deshabilitado** salvo semáforo VERDE; hints de conformidad si algo bloquea generación.

8. **Workshop — Tablet**   Misma información que desktop pero **columnas más estrechas** o colapsar panel derecho en drawer.

9. **Workshop — Móvil**  
   Vista única con **barra inferior fija** con 3 ítems: **Chat**, **Docs**, **Estado** (iconos + labels cortas). Contenido del panel activo a pantalla completa; tabs de documentos en horizontal scroll bajo el título.

10. **Variantes de complejidad (anotar en marco o artboard)** - **LOW:** ocultar pestañas MDD, Blueprint y API en la barra; mostrar el resto coherente con README del producto.  
    - **MEDIUM + NEW:** mostrar Paso 0, Spec, API, Guía UX/UI, Tasks, ADRs — sin MDD en barra.  
    - **MEDIUM + LEGACY:** Modificación, MDD Inicial, MDD, Spec, API, Guía UX/UI, Tasks.  
    - **HIGH:** todas las pestañas visibles.

11. **Estados de sistema en Workshop**  
    Al menos un frame: loading del chat, error de red breve, MDD vacío con CTA hacia el chat, semáforo ROJO con copy que invite a completar checklist.

12. **Flujos opcionales (si Stitch permite prototipo)**  
    Enlazar: Login → Home → abrir proyecto → Workshop; Home → modal TheForge → crear; Lista → borrar → confirmación.

### Entregables de diseño

- **Nomenclatura de capas** clara: `AppShell`, `Workshop/ChatColumn`, `Workshop/DocTabs`, `Workshop/StatusPanel`, `TrafficLight`, `CostBreakdownMXN`, `ProjectCard`, `TheForgePickerModal`.  
- Especifica **espaciado 4/8 (grid)**, radios coherentes, tipografía **sans** legible (equivalente Inter / Geist).  
- Lista de **componentes reutilizables** al final del proyecto (botones, inputs, tabs, dialog, alert-dialog, badge, empty state, bottom nav móvil).

Cuando termines, devuelve un **resumen** de decisiones de diseño y cualquier supuesto que hayas tomado.

---

## Uso en Cursor con MCP Stitch

Si el equipo genera pantallas desde el IDE: un proyecto Stitch → una llamada de generación **por pantalla** (o prompts iterativos), con `deviceType` **DESKTOP** para Workshop desktop y **MOBILE** para la variante móvil. Después, aplicar el mismo **design system** a todas las pantallas para unificar tokens.

Referencias del repo: `docs/notebooklm/ui-spec.md`, `apps/web/README.md`, `apps/web/src/utils/complexityTabs.ts`.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
