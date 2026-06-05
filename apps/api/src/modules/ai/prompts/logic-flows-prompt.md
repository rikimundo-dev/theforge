# Contexto #

El **MDD es la Constitución del proyecto (SDD)**. Los flujos deben derivarse del MDD sin contradecirlo. Respeta los **patrones [X]** del Wizard del MDD (user prompt) en orquestación, eventos y resiliencia. Insumos: sección "Lógica de Negocio" y "Seguridad" del MDD (y del Blueprint si aplica). Adapta todo al dominio del MDD. No uses las palabras "grado militar" ni "militar". Incluye al final una sección breve **Cumplimiento con el MDD** (flujos alineados con lógica y seguridad del MDD).

# Objetivo #

Generar el **documento de Casos de Uso y Flujos de Lógica** (Logic & Flows) en markdown. El MDD dice _qué_ hace el sistema; este documento dice _cómo_ lo hace paso a paso. Es vital para procesos complejos (autenticación, pagos, aprobaciones, etc.) y para evitar errores de flujo.

**Contenido obligatorio del documento:**

1. **Diagramas de Secuencia (Mermaid):** Al menos un flujo crítico completo (p. ej. desde que el usuario inicia una acción hasta que recibe la respuesta o token). Adapta al dominio (login, checkout, reserva, etc.).
2. **Flujos de error y reintentos:** Pasos exactos cuando falla una validación, un código MFA/TOTP, un pago, etc., según lo que describa el MDD.
3. **Reglas de Validación:** Longitud de contraseñas, dominios de correo permitidos, formatos de campos, límites numéricos, etc., cuando apliquen al dominio.
4. **Casos de borde:** Qué hacer en timeouts, datos duplicados, estado inconsistente, según el MDD.

# Estilo #

Técnico y secuencial. Diagramas y pasos claros para implementación y QA.

# Tono #

Neutro. Documento de referencia para desarrollo y pruebas.

# Audiencia #

Desarrolladores y QA que implementarán o validarán la lógica y los flujos.

# Respuesta #

- **Solo markdown.** Sin introducciones ni bloques de código que envuelvan todo el documento.
- El **primer carácter** de tu respuesta debe ser `#`.
- Usa **diagramas Mermaid** cuando ayuden (secuencia, flujo).
- Documento completo con las secciones indicadas en Objetivo y la sección final "Cumplimiento con el MDD".

# Proyecto legacy (mensaje con contexto TheForge) #

Si el mensaje incluye **Contexto del codebase (TheForge)**, los pasos y validaciones deben referir **archivos, servicios o puntos de extensión** que TheForge mencione (lifecycles, policies, middleware). Los diagramas deben reflejar el flujo real inferible del índice + MDD, no uno genérico.
