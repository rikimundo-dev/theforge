# ui-spec

> ⚠️ **Nota:** Este documento es una especificación inicial del diseño de UI. La implementación actual del Workshop (WorkshopView.tsx) puede diferir en detalles. Ver `docs/notebooklm/THEFORGE-INDEX.md` y el código fuente para la versión vigente.

## 1. La Pantalla de "TheForge" (The Workshop)

Esta es la vista principal donde sucede la magia. Debe ser una interfaz de **tres columnas** (o una principal con dos sidebars) para evitar que pierdas el contexto.

### Columna A: El Asistente de Arquitectura (Panel de Chat)

- **Funcionalidad:** Interfaz de chat tipo "thread".
- **Estado de Persistencia:** Debe mostrar un indicador de "Sincronizado" (en la DB de PostgreSQL) para que sepas que puedes cerrar y volver luego.
- **Componente `InterviewStream`:** Renderiza el flujo de preguntas de la IA. Si la IA detecta que falta algo para el "Verde", debe resaltar la pregunta con un borde sutil.

### Columna B: Visualizador del MDD en Tiempo Real

- **Funcionalidad:** Un panel que muestra el documento Markdown que se va construyendo.
- **Secciones Dinámicas:** A medida que respondes, se van llenando las secciones: _Arquitectura, Entidades, Seguridad_.
- **Editor Preview:** Permite al usuario editar manualmente fragmentos del MDD si la IA entendió algo mal.

### Columna C: Panel de Control y Salida

- **Widget del Semáforo:** Un medidor circular que cambia de color (Rojo, Amarillo, Verde) basado en el `precisionScore`.

```
- **Input:** `precisionScore` (0-100).
- **Lógica Visual:**
  - 0-40: Rojo (Icono de bloqueo 🔒).
  - 41-90: Amarillo (Icono de advertencia ⚠️).
  - 91-100: Verde (Icono de check ✅).
```

- **Motor de Estimación:** Un desglose de costos en **MXN** que se actualiza mediante un `useEffect` cada vez que el MDD cambia.
- **Botón de Acción:** Solo se activa el botón "Generar Entregables" cuando el semáforo está en **Verde**.

---

## 2. Flujo de Usuario de la Entrevista (Stepper Lógico)

La interfaz debe reflejar en qué etapa de la entrevista estamos (aunque sea una charla libre, el sistema rastrea estos hitos):

1. **Configuración Inicial:** Pregunta por el stack, nombre y si hay equipo UX.
2. **Modelado de Datos:** La IA empuja preguntas para definir las tablas y relaciones.
3. **Lógica y Seguridad:** Preguntas sobre roles, procesos de negocio y errores.
4. **Revisión y Estimación:** La IA presenta el resumen final y el costo estimado para aprobación.

---

## 3. Elementos Faltantes según MDD/Blueprint

Asegúrate de que Cursor implemente estos elementos específicos en la GUI:

- **Selector de provider (legacy spec):** El backend fija el LLM a **OpenRouter**; no hay toggle OpenAI/Gemini en el cliente. Cualquier cambio de modelo o clave es por **variables de entorno** (`OPENROUTER_*` / `docker-compose` / Dokploy).
- **Módulo de Carga de UX:** Si al inicio marcaste "Tengo equipo de UX", debe aparecer un área de **Drag & Drop** para subir el JSON de mapeo de Figma.
- **Exportador de Formatos:** Una sección de "Descargas" donde se listan los entregables (Blueprint.md, Prisma Schema, OpenAPI YAML) una vez finalizada la entrevista.

---

## 4. Guía de Estilo y Librerías

- **Base:** Tailwind CSS + [Shadcn/UI](https://ui.shadcn.com/) (para consistencia rápida).
- **Iconografía:** Lucide React.
- **Gráficos:** Recharts (para mostrar la distribución de costos/tiempo).

---

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
