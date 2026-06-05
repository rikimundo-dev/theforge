# Contexto #

El **MDD es la Constitución del proyecto (SDD)**. La infraestructura debe cumplir lo definido en la sección Infraestructura del MDD y los **patrones [X]** del Wizard (user prompt) cuando afecten despliegue o integración. Insumos: sección "Infraestructura" (o equivalente) del MDD y la estructura de carpetas del Blueprint (si está disponible). Adapta todo al dominio y stack del MDD (NestJS, React, Postgres, Redis, etc.). No uses las palabras "grado militar" ni "militar". Incluye al final una sección breve **Cumplimiento con el MDD** (servicios, env y volúmenes alineados con el MDD).

# Objetivo #

Generar el **documento de Infraestructura y Despliegue** (DevOps / Docker Spec) en markdown que asegure que el proyecto funcione igual en desarrollo local que en el servidor (p. ej. Dokploy). Sin una spec clara, cada entorno diverge y aparecen fallos "solo en producción".

**Contenido obligatorio del documento:**

1. **Dockerfile multietapa:** Descripción (o ejemplo) de un Dockerfile optimizado (build stage + runtime stage, usuario no root, imagen base mínima cuando sea posible).
2. **docker-compose.yml:** Servicios necesarios según el MDD (Postgres, Redis si aplica, API, Frontend, etc.) con:
   - **Puertos:** Solo exponer puertos estrictamente necesarios para acceso externo (API gateway, Frontend). Los servicios internos (Postgres, Redis, colas, workers) NO deben tener `ports:` en el compose — se comunican por nombre de contenedor (DNS interno de Docker).
   - **Nombres de contenedor:** Usar `container_name:` para cada servicio y referenciar siempre por nombre (ej. `postgres://postgres:5432` en vez de `localhost:5432`).
   - **Dependencias:** `depends_on` entre servicios cuando corresponda.
3. **Variables de entorno:** Archivo `.env.example` con todas las variables necesarias para que el sistema arranque (DATABASE_URL, API keys, feature flags, etc.), sin valores sensibles.
4. **Volúmenes y persistencia:** Configuración de volúmenes para datos persistentes (BD, archivos subidos, etc.) para que no se pierdan al reiniciar contenedores.

# Estilo #

Técnico y operativo. Especificaciones listas para implementar en entornos reales.

# Tono #

Neutro. Documento de referencia para DevOps y despliegue.

# Audiencia #

Desarrolladores y equipos de DevOps que configurarán entornos locales y de producción.

# Respuesta #

- **Solo markdown.** Sin introducciones ni bloques de código que envuelvan todo el documento.
- El **primer carácter** de tu respuesta debe ser `#`.
- Puedes incluir fragmentos de Dockerfile o docker-compose en bloques de código dentro del markdown.
- Documento completo con las secciones indicadas en Objetivo y la sección final "Cumplimiento con el MDD".

# Proyecto legacy (mensaje con contexto TheForge) #

Si el mensaje incluye **Contexto del codebase (TheForge)**, Docker, servicios y variables deben coincidir con el **stack y repos reales** del bloque (runtime, BD, workers). No propongas contenedores o carpetas que contradigan el inventario salvo que el MDD imponga un cambio explícito de infra.
