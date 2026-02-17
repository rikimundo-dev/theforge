# Plan de Implementación: Evolución Agentica de The Forge

Este plan detalla los pasos técnicos para elevar el sistema de la Fase 3 (Agentic Engineering) hacia un modelo de **Ingeniería Autónoma de Alta Fidelidad**, basándose en los principios de Architecting Agentic Systems y SDD.

## 1. Memoria Semántica y Grafo de ADRs (FalkorDB + GraphRAG)

**Objetivo:** Evolucionar de una memoria plana a un **Grafo de Decisiones Arquitectónicas (ADRs)**. FalkorDB permitirá cruzar búsquedas vectoriales (semántica) con travesía de grafos (relaciones de dependencia entre decisiones).

### Pasos:
- [ ] **Esquema de ADR en Grafo:**
    - **Nodos:** `Decision` (El registro), `Context` (El porqué), `Consequence` (Impacto positivo/negativo), `Status` (Accepted/Superseeded).
    - **Relaciones:** `REPLACES`, `REQUIRES`, `CONTRADICTS`.
- [ ] **ADR Logger Tool:** Un nuevo servicio que post-procesa el MDD finalizado para extraer las decisiones "invariantes" (ej. "Siempre usar UUID v7 para PKs") y las guarda como ADRs persistentes en FalkorDB.
- [ ] **Contextual Awareness:** Cuando el `Software Architect` trabaje en un nuevo MDD, la herramienta `query_intent_graph` le inyectará los ADRs vigentes: "Decisión previa aceptada: No usar borrados físicos en CRM".

## 2. Orquestación Blackboard (Panel de Debate para Conflictos)

**Objetivo:** Resolver contradicciones técnicas entre especialistas (ej. Seguridad vs. Integración) mediante un panel de resolución de conflictos.

### Pasos:
- [ ] **Contradiction Detector:** El nodo `Auditor` ahora buscará etiquetas de conflicto (ej: "[CONFLICTO: Security vs Integration]").
- [ ] **Blackboard Node (The Judge):** Un nuevo nodo que se dispara solo cuando el Auditor detecta un conflicto. Este nodo:
    1.  Recopila los argumentos de ambos agentes.
    2.  Realiza un "debate" interno (Chain-of-Thought) comparando con el MDD (Constitución).
    3.  Emite una **Resolución Ejecutiva** que se inyecta en el estado como `acceptedProposalDirective`.
- [ ] **Visualización de Debate:** (Opcional) Mostrar en la UI una sección de "Debate Técnico" donde el usuario pueda ver cómo los agentes llegaron a un consenso.

## 3. Auto-Corrección basada en Herramientas (Tool-Assisted Verification)

**Objetivo:** Reducir la alucinación técnica permitiendo que los agentes validen sus salidas contra herramientas deterministas.

### Pasos:
- [x] **SQL Linter Tool:** Implementar una herramienta que use un parser de SQL (ej. `node-sql-parser`) para validar que el contenido de la Sección 3 del MDD sea válido y no tenga errores de sintaxis.
- [x] **Zod/JSON Validator:** Crear una herramienta para validar los payloads de la Sección 4 (Contratos API) asegurando que sigan el estándar OpenAPI/JSON-Schema.
- [x] **Integración en el Loop de Auditoría:** El nodo `Auditor` ejecutará estas herramientas automáticamente. Si una falla, el estado registrará el error específico y el flujo regresará al `Software Architect` con el log del linter como input.

---

## Roadmap Sugerido

| Fase | Tarea | Prioridad | Impacto |
| :--- | :--- | :--- | :--- |
| **Fase 1** | Memoria de ADRs (FalkorDB) | Alta | Reutilización de lógica y consistencia histórica. |
| **Fase 2** | Panel de Debate (Blackboard) | Media | Resolución automática de conflictos técnicos. |
| **Fase 3** | Auto-Corrección (Linters) | Alta | Eliminación de errores de sintaxis en entregables. |
