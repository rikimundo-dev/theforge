# TheForge — Documentación Estratégica (Valor Ejecutivo)

**Proyecto:** TheForge  
**Versión:** 1.0  
**Audiencia:** Inversionistas, C-level, compradores de software.

---

## 1. Tesis de Inversión (The Hook)

TheForge es la primera plataforma que convierte la especificación de software en **gobierno ejecutable**: una "Constitución" del producto (MDD) que orquesta entrevistas guiadas por IA, validación en tiempo real y estimación de costos en pesos desde el primer día. Las empresas dejan de improvisar alcances y presupuestos; pasan de ciclos de meses y desalineación crónica a **time-to-market predecible** y **TCO visible** antes de escribir una línea de código. El mercado de desarrollo de software está fragmentado entre herramientas de diseño, IA genérica y hojas de cálculo; TheForge unifica especificación, gobernanza y estimación en un solo flujo, con soporte nativo para proyectos nuevos y para **documentar y planificar cambios en sistemas legacy** sin reescribir todo. Quien controle la especificación y la trazabilidad costo-alcance controla la eficiencia del delivery: esa es la oportunidad.

---

## 2. Transformación del Modelo Operativo

**Hoy (sin TheForge):** El cliente opera como una **obra sin plano**: el producto se define en reuniones, correos y documentos sueltos. Los equipos interpretan distinto el alcance; los presupuestos se fijan por intuición o por "lo que salió el proyecto anterior". Los cambios en sistemas existentes se documentan a mano o no se documentan, y cada modificación es un riesgo de romper algo que nadie tiene mapeado. El resultado es retrabajo, desvíos de alcance y conversaciones difíciles con negocio o con el cliente final.

**Con TheForge:** El cliente opera como una **constructora con planos aprobados y presupuesto cerrado**. La plataforma guía una entrevista estructurada (con IA) hasta producir un documento maestro de diseño (MDD) que actúa como Constitución: todo lo que se construye o se modifica se valida contra ese documento. El estado del proyecto es visible en todo momento (semáforo: rojo / amarillo / verde) y el costo en horas y pesos se actualiza en vivo. Para sistemas ya existentes, TheForge se integra con el grafo del código (Relic): el equipo describe el cambio, obtiene la lista real de archivos afectados y preguntas de negocio, y genera un MDD de cambio que mantiene trazabilidad y mitigación de errores. La agilidad no es "ir más rápido a ciegas", sino **ir más rápido con control**: menos retrabajo, menos sorpresas, escalabilidad operativa real.

---

## 3. Mapa de Valor Estratégico (Traducción Técnica a Negocio)

| Capacidad Técnica | Beneficio de Negocio | Impacto Financiero |
|-------------------|----------------------|--------------------|
| **Constitución MDD + Semáforo en tiempo real** | Un solo documento maestro que gobierna alcance, arquitectura, datos, API, seguridad e infra; validación automática de completitud antes de construir. | Reducción de desvíos de alcance y retrabajo (estimable 20–35% en proyectos típicos); menos ciclos de "nos faltó esto". |
| **Motor de estimación en MXN (horas × tarifas por rol)** | Presupuesto y horas visibles desde la especificación, sin depender de hojas de cálculo externas ni de juicio aislado. | Mejor precisión en ofertas y planificación; reducción del TCO por menor incertidumbre y menos sobrecostos por alcance no acordado. |
| **Flujo Legacy con grafo de código (Relic)** | Documentar cambios en sistemas existentes con lista real de archivos afectados y preguntas de negocio; MDD de cambio alineado al código. | Aceleración del time-to-market en evolución de productos legacy; mitigación de errores por cambios no documentados o mal acotados. |
| **IA agnóstica (OpenAI / Gemini intercambiables)** | Libertad de elegir proveedor de IA sin reescribir la plataforma; resiliencia ante cambios de precios o políticas. | Reducción del riesgo de dependencia de un solo vendor; control del costo de IA a largo plazo. |
| **Orquestación multiagente (Clarificador, Arquitecto, Seguridad, Integración, Auditor)** | Generación guiada del MDD por especialistas virtuales con revisión y umbral de calidad (ej. 85%) antes de dar por cerrado. | Menor tiempo de redacción manual de especificaciones; mayor consistencia y menor tasa de errores en el documento base. |

---

## 4. Diferenciación y "Unfair Advantage"

- **Especificación como producto, no como adjunto:** TheForge no es un chat con IA ni un generador de código suelto; el MDD es el artefacto central y todo (entregables, estimación, semáforo) depende de él. Eso crea una **barrera de entrada**: competidores que solo añaden IA a un IDE no tienen el flujo de gobernanza ni la trazabilidad costo-alcance.
- **Legacy como ciudadano de primera clase:** La integración con el grafo de código (Relic) para proyectos existentes permite planificar y documentar cambios con precisión (archivos reales, preguntas de negocio). La competencia suele enfocarse solo en proyectos verdes; aquí el **time-to-value en sistemas ya desplegados** es un diferenciador claro.
- **Estimación y semáforo en vivo:** El costo en MXN y el estado (rojo/amarillo/verde) se actualizan durante la elaboración del MDD. El comprador ve el impacto de cada decisión de alcance de inmediato; no hay "sorpresa" al final del proceso. Eso mejora la confianza y reduce las negociaciones conflictivas.
- **Despliegue en un solo contenedor (Dokploy-ready):** Operación simplificada; el cliente puede tener la plataforma funcionando con mínima infraestructura, reduciendo TCO de adopción y tiempo de implementación.

---

## 5. Business Case (ROI y Eficiencia)

- **Reducción de TCO (Costo Total de Propiedad):** Menos retrabajo por alcance mal definido; menos reuniones de "re-alineación"; estimación y gobernanza unificadas en una sola herramienta en lugar de documentos, hojas de cálculo y chats dispersos.
- **Aceleración del Time-to-Market:** Especificación y validación más rápidas; para legacy, plan de cambio y MDD de modificación generados a partir del código real, reduciendo el tiempo desde "queremos cambiar X" hasta "tenemos el plan y el costo".
- **Previsibilidad:** Presupuesto y horas visibles desde la fase de especificación; menor variación entre lo vendido y lo entregado cuando el MDD actúa como contrato de alcance.

*(Las cifras concretas de % de ahorro o días reducidos deben calibrarse con datos del cliente o de pilots; la plataforma está preparada para soportar esos casos de uso.)*

---

## 6. Declaración de Factibilidad (Truth-Check)

Todo lo descrito anteriormente está soportado por la implementación actual de TheForge:

- El MDD de 7 secciones, el semáforo (rojo/amarillo/verde) y el motor de estimación en MXN existen y se calculan en tiempo real a partir del contenido del proyecto.
- El flujo legacy con integración Relic (plan de modificación, archivos a modificar, preguntas de afinación, generación de MDD de cambio) está implementado; la lista de archivos y preguntas proviene del grafo de código cuando el MCP correspondiente está disponible.
- La orquestación multiagente (Manager, Clarificador, Arquitecto, Seguridad, Integración, Auditor) y el umbral de calidad (ej. 85%) para ceder al usuario están implementados en el backend.
- La IA agnóstica (OpenAI / Gemini por configuración) está implementada vía adapters y variable de entorno; no hay lógica de negocio atada a un proveedor único.
- El despliegue en un solo contenedor (Dokploy) está documentado y soportado en el repositorio.

La postura es audaz en valor de negocio, pero **100% alineada con lo que el código hace hoy**: no se prometen funcionalidades inexistentes.
