# Plan de cambios: MDD y patrón Planificador–Ejecutor

Revisión de la generación de MDD frente al patrón **Planner–Executor** descrito en el cuaderno NotebookLM _Architecting Agentic Systems: Frameworks, Patterns, and Advanced Workflows_. No se incluye código; solo diagnóstico y plan de cambios.

---

## 1. Resumen del patrón Planner–Executor (según el cuaderno)

- **Planner (estrategia):** Recibe el objetivo de alto nivel, lo descompone en un **plan estructurado** (lista, DAG o JSON con pasos). No ejecuta; no tiene herramientas. Suele usar un LLM potente.
- **Executor (táctica):** Recibe el plan y ejecuta **paso a paso**. Puede ser un modelo más pequeño o un runner de herramientas. Acceso **solo a las herramientas del paso actual** (least privilege).
- **Estado compartido:** Plan + resultados de pasos ejecutados.
- **Re-planning:** Si un paso falla, el Verificador detecta resultado inválido o aparece información nueva que invalida pasos siguientes → vuelta al Planner para un nuevo plan.
- **Buenas prácticas:** Salida del Planner en esquema estricto (JSON); herramientas acotadas por paso; bucle de re-planning; opcional Human-in-the-Loop (plan-validate-execute).

---

## 2. Cómo está hoy el flujo MDD

- **Manager:** Actúa como **supervisor/orquestador**. Decide `action` (reply / delegate) y `target` (clarifier_only | full_pipeline | sections) y opcionalmente `sectionsToRun`. No produce un “plan” explícito con pasos y herramientas por paso.
- **Grafo fijo:** Clarifier → Software Architect → Formatter → Security → Integration → Formatter → Diagram Injector → Auditor → Manager. La “secuencia” es el grafo; lo único dinámico es qué ramas se activan (`delegateTarget`, `sectionsToRun`).
- **Herramientas:** Por **nodo** (Software Architect: `format_section3_endpoints`; Auditor: `validate_mdd_structure`). No hay un “paso N” con “solo herramienta X”.
- **Re-planning:** Auditor → Manager cuando score < 95%. El Manager puede volver a Clarifier o delegar a `sections`. No hay re-planning explícito ante **fallo de ejecución** (tool error, timeout): el stream devuelve `error` y termina.
- **Salida estructurada:** El Manager usa Zod (`action`, `target`, `sections`). No existe un artefacto “plan” (lista/DAG de pasos con `task_description`, `required_tool`, etc.).

---

## 3. Diagnóstico: qué encaja y qué no

| Criterio (patrón P–E)                                | Estado actual | Comentario                                                                                                                                          |
| ---------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separación Planner vs Ejecutor                       | Parcial       | Manager orquesta pero no es un “Planner” que emite plan; especialistas ejecutan pero no hay un “Executor” único que reciba un plan y ejecute pasos. |
| Plan estructurado (JSON/DAG/lista) antes de ejecutar | No            | No hay un artefacto “plan” con pasos; solo routing (delegate + sections).                                                                           |
| Planner sin herramientas                             | Parcial       | Manager no tiene tools; pero su rol es “a quién delegar”, no “qué pasos ejecutar”.                                                                  |
| Least privilege por paso                             | Parcial       | Herramientas por nodo (bien), pero no “por paso del plan” porque no hay plan por pasos.                                                             |
| Re-planning ante fallo de ejecución                  | No            | Si un nodo/tool falla, el servicio emite `error`; no se vuelve al “Planner” para re-planificar.                                                     |
| Re-planning ante resultado inválido (score < 95%)    | Sí            | Auditor → Manager → Clarifier o sections.                                                                                                           |
| Salida del “Planner” machine-readable                | Parcial       | Manager devuelve JSON (action, target, sections); no es un plan con pasos.                                                                          |
| Human-in-the-loop (validar plan antes de ejecutar)   | Parcial       | Hay interrupt para preguntas del Clarifier; no hay “aprobar plan completo antes de ejecutar”.                                                       |

---

## 4. Plan de cambios (solo plan, sin implementar)

### 4.1 Introducir un “plan” como artefacto explícito (opcional pero alineado al patrón)

- **Objetivo:** Que exista un plan estructurado (ej. lista de pasos con `step_id`, `task_description`, `required_tool` o `node`, `depends_on`) antes de ejecutar el pipeline.
- **Opciones:**
  - **A)** Añadir un nodo “Planner” que, dado el estado (dbgaContent, lastUserMessage, auditorFeedback), genere solo ese plan (JSON) y lo guarde en estado (`mddPlan`). El Manager o un “Executor” consumiría ese plan para decidir qué nodos ejecutar y en qué orden.
  - **B)** Hacer que el Manager, además de `action/target/sections`, emita un campo `plan` (lista de pasos) cuando `action === "delegate"`. El grafo o un nodo Executor ejecutaría según ese plan.
- **Impacto:** Nuevo campo en estado (`mddPlan`), posible nuevo nodo o extensión del Manager, y flujo que “ejecuta según plan” en lugar de solo “siguiente nodo fijo”.

### 4.2 Re-planning ante fallo de ejecución

- **Objetivo:** Cuando un nodo o una tool falle (excepción, timeout), no limitarse a devolver error; volver al “Planner” (Manager o nodo Planner) para re-planificar (reintentar, saltar paso, o pedir aclaración).
- **Cambios:**
  - En el servicio que invoca el grafo, capturar fallos por nodo (o usar un wrapper de nodo que devuelva `{ success, error?, output }`).
  - Si `success === false`, inyectar en estado algo como `lastStepFailed: { node, error }` y enrutar a Manager (o Planner) en lugar de terminar con `error`.
  - Manager/Planner: en el prompt, considerar `lastStepFailed` y decidir re-delegar (mismos u otros sections), o devolver mensaje al usuario.
- **Impacto:** Cambios en `ai-analysis.service.ts` (manejo de excepciones del grafo), posible nuevo edge condicional “on node error → Manager”, y extensión del prompt del Manager.

### 4.3 Least privilege por “paso” (si se adopta plan por pasos)

- **Objetivo:** Si en el futuro el plan tiene pasos con `required_tool` o `node`, el Executor solo recibiría las herramientas de ese paso (no todas las del nodo).
- **Cambios:** Hoy cada nodo tiene un conjunto fijo de tools (tool-registry). Para “tool por paso” haría falta: (1) que el plan defina por paso qué tool(s) usar, y (2) que el nodo Executor (o el nodo actual) reciba en cada invocación solo ese subconjunto (ej. filtrar `getMddArchitectTools()` por paso). Opcional; depende de adoptar 4.1.

### 4.4 Human-in-the-loop: validar plan antes de ejecutar (opcional)

- **Objetivo:** Para flujos de alto impacto, que el usuario pueda ver y aprobar el plan (lista de pasos) antes de que se ejecute.
- **Cambios:** Si existe `mddPlan` en estado: tras generarlo, hacer `interrupt` con un payload tipo `{ plan: mddPlan, message: "¿Ejecutar este plan?" }`. El frontend mostraría el plan y enviaría “sí” o “no/modificar”. Al reanudar, el Manager solo ejecutaría si hay confirmación (o iría a Clarifier si el usuario pide cambios).
- **Impacto:** Nuevo tipo de evento `interrupt` (plan para aprobar), cambios en Workshop para mostrar y confirmar, y lógica de resume en backend.

### 4.5 Documentar la arquitectura actual como “Supervisor + especialistas”

- **Objetivo:** Dejar claro que el diseño actual es “Manager (supervisor) + nodos especialistas” y no “Planner + Executor” en sentido estricto, y en qué puntos se acerca o se desvía del patrón del cuaderno.
- **Cambios:** Actualizar `apps/api/src/modules/ai-analysis/README.md` (o `docs/notebooklm/ai-agents-dbga.md`) con una subsección “Patrón Planner–Executor” que enlace a este plan y resuma: qué tenemos (re-planning por score, herramientas por nodo, Manager sin tools), qué no tenemos (plan explícito, re-planning por fallo, least privilege por paso), y referencias a este plan para futuras mejoras.

### 4.6 Priorización sugerida

1. **Corto plazo (bajo esfuerzo):** 4.5 (documentar).
2. **Medio plazo (valor claro):** 4.2 (re-planning ante fallo).
3. **Opcional / largo plazo:** 4.1 (plan explícito), 4.3 (least privilege por paso), 4.4 (HITL plan).

---

## 5. Referencias

- Cuaderno NotebookLM: _Architecting Agentic Systems: Frameworks, Patterns, and Advanced Workflows_ (id `8fc8a574-198a-46ef-87dc-fb98a75785bb`).
- Código revisado: `apps/api/src/modules/ai-analysis/graph/mdd-graph.ts`, `apps/api/src/modules/ai-analysis/nodes/mdd-manager.node.ts`, `apps/api/src/modules/ai-analysis/tools/tool-registry.ts`, `apps/api/src/modules/ai-analysis/state/mdd-state.schema.ts`, `apps/api/src/modules/ai-analysis/ai-analysis.service.ts`, `apps/api/src/modules/ai-analysis/README.md`.
