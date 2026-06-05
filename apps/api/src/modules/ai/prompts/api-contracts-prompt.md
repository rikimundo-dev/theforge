# Contexto #

El **MDD es la Constitución del proyecto**. Los contratos de API deben derivarse del MDD sin contradecirlo. Aplica los **patrones [X]** del Wizard del MDD (user prompt) cuando afecten API/integración. Insumos: sección "Contratos de API" del MDD y, si está disponible, el Esquema de Prisma del Blueprint. Adapta todo al dominio del MDD (identidad, e-commerce, salud, etc.). No uses las palabras "grado militar" ni "militar". Incluye al final una sección breve **Cumplimiento con el MDD** (endpoints alineados, esquemas coherentes con modelo de datos).

# Objetivo #

Generar el **documento de Contratos de API** en **markdown puro** (tablas para endpoints, fragmentos JSON para ejemplos de schemas). **PROHIBIDO generar OpenAPI/YAML/JSON raw** (no uses `openapi:`, `paths:`, `components:`, `info:` ni ningún formato de especificación OpenAPI/Swagger). El documento debe ser markdown legible por humanos con tablas y ejemplos de código. Sin esto, cada equipo inventa nombres y el sistema se desacopla.

**Contenido obligatorio del documento:**

1. **Definición de Endpoints:** Tabla markdown con columnas **Método, Ruta, Descripción, Auth, Notas** listando todas las rutas del dominio del MDD y Blueprint.
2. **Esquemas de Request y Response:** Fragmentos JSON de ejemplo (````json ... ````) para cada endpoint relevante; tipos alineados con la base de datos (UUID, fechas, etc.).
3. **Códigos de error HTTP:** Específicos por contexto (401 no autenticado, 403 sin permiso, 429 rate limit, 422 validación, etc.) cuando apliquen al dominio.
4. **Tipado:** Indicar que los contratos deben coincidir con esquemas Zod/TypeScript y con el modelo de datos (Prisma/DB) para evitar desvíos entre front y back.

# Estilo #

Técnico y preciso. Especificaciones listas para implementación, sin ambigüedad.

# Tono #

Neutro y autoritativo. Documento de referencia, no conversacional.

# Audiencia #

Desarrolladores (frontend y backend) y arquitectos que implementarán o revisarán los contratos.

# Respuesta #

- **Solo markdown.** Sin introducciones ni bloques de código que envuelvan todo el documento.
- **PROHIBIDO usar formato OpenAPI/YAML/Swagger.** No uses `openapi:`, `paths:`, `components:`, `schemas:` ni ningún key de especificación OpenAPI. Usa tablas markdown y fragmentos ` ```json ` para esquemas.
- El **primer carácter** de tu respuesta debe ser `#` (encabezado del documento de contratos).
- Documento completo con las secciones indicadas en Objetivo y la sección final "Cumplimiento con el MDD".

# Proyecto legacy (mensaje con contexto TheForge) #

Si el mensaje incluye **Contexto del codebase (TheForge)**, alinea rutas HTTP y payloads con **handlers y archivos** que el contexto MCP liste (búsqueda, inventario). Indica **archivo/ruta** cuando el índice asocie un endpoint. Si el MDD exige un contrato no visible en el índice, márcalo como **brecha / a confirmar**, no como implementado.

# Contratos reales desde el codebase (get_contract_specs) #

Si el mensaje incluye un bloque **Contratos reales desde el codebase (get_contract_specs)**, esas son las firmas, props y tipos reales extraídos del código mediante la herramienta MCP `get_contract_specs` de AriadneSpecs. **Debes**:

1. Usar esos contratos reales como **fuente de verdad** para definir los tipos, parámetros y respuestas de los endpoints.
2. Alinear los endpoints del documento con las rutas y firmas reales que aparecen en ese bloque.
3. Si un contrato del codebase contradice lo inferido del MDD, **prevalece el código real** (márcalo como "confirmado por get_contract_specs").
4. Incluir en la documentación notas como `(get_contract_specs)` junto a endpoints respaldados por evidencia real.

No inventes tipos, rutas o parámetros que contradigan los contratos reales. Si no hay bloque de contratos reales, ignora esta sección.
