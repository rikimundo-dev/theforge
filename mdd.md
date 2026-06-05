# MDD: TheForge — Software Factory Orchestrator

---

## [ARQUITECTURA - SECCIÓN INMUTABLE] CONFIGURACIÓN DE PATRONES DE DESARROLLO

> ### 🚨 NOTA DE SISTEMA PARA AGENTES DE IA (PROHIBIDO ELIMINAR O MODIFICAR)
> Esta sección contiene las decisiones de diseño arquitectónico globales del proyecto. 
> ANTES de generar cualquier documento posterior (Spec, Arq, API, Flujos, Tasks, Infra), DEBES leer obligatoriamente las opciones marcadas con [X] en este Wizard. Toda especificación, contrato, diagrama o tarea técnica generada debe alinearse estrictamente con los patrones activados.

### 🧙‍♂️ WIZARD DE SELECCIÓN DE PATRONES COMPLETO
*Instrucciones para el usuario: Marca con una [X] todos los patrones que aplicarán a este desarrollo.*

#### 🏛️ 1. PATRONES DE ARQUITECTURA GLOBAL Y DISTRIBUIDA
- [ ] **Arquitectura Hexagonal (Ports & Adapters):** Aísla la lógica de negocio central de agentes externos, bases de datos o frameworks mediante interfaces. *(Afecta a: Arq, MDD, Flujos, Tasks)*
- [ ] **Clean Architecture / Onion Architecture:** Estructura el software en capas concéntricas donde la dependencia va estrictamente hacia el centro (entidades de negocio). *(Afecta a: Arq, MDD, Tasks)*
- [ ] **Microservicios:** Divide el sistema en servicios autónomos, débilmente acoplados y desplegables de forma independiente. *(Afecta a: Arq, API, Infra, Tasks)*
- [ ] **Monolito Modular:** Mantiene una única unidad de despliegue pero con una separación estricta y lógica de módulos de negocio independientes. *(Afecta a: Arq, MDD)*
- [ ] **CQRS (Command Query Responsibility Segregation):** Separa los modelos y caminos de ejecución para operaciones de lectura y de escritura. *(Afecta a: Arq, API, Flujos, Tasks)*
- [ ] **Event-Driven Architecture (EDA):** Arquitectura basada en la producción, detección y consumo de eventos asíncronos. *(Afecta a: Arq, Flujos, Infra)*
- [ ] **SOA (Service-Oriented Architecture):** Estructura orientada a servicios que se comunican mediante un protocolo de enlace común (como ESB). *(Afecta a: Arq, API)*
- [ ] **Serverless Architecture:** Aplicaciones que dependen de servicios de terceros (BaaS) o contenedores efímeros (FaaS) gestionados por la nube. *(Afecta a: Arq, Infra, Tasks)*

#### 🏗️ 2. PATRONES DE DISEÑO: CREACIONALES (Gof)
- [ ] **Abstract Factory:** Proporciona una interfaz para crear familias de objetos relacionados o dependientes sin especificar sus clases concretas. *(Afecta a: MDD, Tasks)*
- [ ] **Builder:** Separa la construcción de un objeto complejo de su representación, permitiendo crear diferentes representaciones. *(Afecta a: MDD, Tasks)*
- [ ] **Factory Method:** Define una interfaz para crear un objeto, pero deja que las subclases decidan qué clase instanciar. *(Afecta a: MDD, Tasks)*
- [ ] **Prototype:** Permite copiar objetos existentes sin que el código dependa de sus clases concretas. *(Afecta a: MDD, Tasks)*
- [ ] **Singleton:** Garantiza que una clase tenga una única instancia en toda la aplicación y proporciona un acceso global a ella. *(Afecta a: MDD, Tasks)*

#### 🔌 3. PATRONES DE DISEÑO: ESTRUCTURALES (GoF)
- [ ] **Adapter:** Permite que interfaces incompatibles trabajen juntas, traduciendo las peticiones de un cliente a un formato comprensible. *(Afecta a: API, Flujos, Tasks)*
- [ ] **Bridge:** Desacopla una abstracción de su implementación, de modo que ambas puedan variar de forma independiente. *(Afecta a: MDD, Tasks)*
- [ ] **Composite:** Permite componer objetos en estructuras de árbol para representar jerarquías de parte-todo. *(Afecta a: MDD, Design System, Tasks)*
- [ ] **Decorator:** Añade responsabilidades a un objeto dinámicamente de forma transparente sin modificar su estructura base. *(Afecta a: MDD, Tasks)*
- [ ] **Facade (Fachada):** Proporciona una interfaz unificada y simplificada para un conjunto de interfaces en un subsistema complejo. *(Afecta a: API, MDD, Tasks)*
- [ ] **Flyweight (Peso Ligero):** Minimiza el uso de memoria compartiendo la mayor cantidad posible de datos con objetos similares. *(Afecta a: MDD, Tasks)*
- [ ] **Proxy:** Proporciona un sustituto o marcador de posición para otro objeto para controlar el acceso, interceptar llamadas o diferir costos. *(Afecta a: MDD, Tasks)*

#### 🧠 4. PATRONES DE DISEÑO: COMPORTAMIENTO (GoF)
- [ ] **Chain of Responsibility:** Permite pasar peticiones a lo largo de una cadena de manejadores; cada uno decide si procesa la petición o la pasa al siguiente. *(Afecta a: Flujos, Tasks)*
- [ ] **Command:** Encapsula una petición como un objeto, permitiendo parametrizar a los clientes con diferentes peticiones, hacer colas y operaciones reversibles. *(Afecta a: MDD, Flujos, Tasks)*
- [ ] **Interpreter:** Dada un lenguaje, define una representación para su gramática junto con un intérprete que la utiliza. *(Afecta a: Spec, MDD)*
- [ ] **Iterator:** Permite recorrer secuencialmente los elementos de una colección sin exponer su representación subyacente. *(Afecta a: MDD, Tasks)*
- [ ] **Mediator:** Define un objeto que encapsula cómo interactúa un conjunto de objetos, promoviendo un acoplamiento débil. *(Afecta a: MDD, Flujos, Tasks)*
- [ ] **Memento:** Permite capturar y externalizar el estado interno de un objeto para poder restaurarlo más tarde sin violar la encapsulación. *(Afecta a: Flujos, Tasks)*
- [ ] **Observer / Pub-Sub:** Establece una relación de dependencia de uno a muchos para que los cambios en un objeto notifiquen automáticamente a los demás. *(Afecta a: Flujos, Tasks)*
- [ ] **State:** Permite que un objeto modifique su comportamiento cada vez que cambia su estado interno, pareciendo cambiar de clase. *(Afecta a: Spec, Casos, Flujos, Tasks)*
- [ ] **Strategy:** Define una familia de algoritmos, encapsula cada uno y los hace intercambiables dinámicamente en tiempo de ejecución. *(Afecta a: Spec, MDD, Tasks)*
- [ ] **Template Method:** Define el esqueleto de un algoritmo en una operación, delegando algunos pasos a las subclases sin cambiar la estructura general. *(Afecta a: MDD, Tasks)*
- [ ] **Visitor:** Permite definir una nueva operación sobre una estructura de objetos sin cambiar las clases de los elementos sobre los que opera. *(Afecta a: MDD, Tasks)*

#### 💾 5. PATRONES DE PERSISTENCIA Y MANEJO DE DATOS
- [ ] **Repository:** Media entre el dominio y las capas de mapeo de datos mediante una interfaz de estilo colección abstracta. *(Afecta a: MDD, Tasks)*
- [ ] **Data Mapper:** Capa de mapeo que aísla los objetos de dominio de la base de datos, manteniendo la independencia del modelo. *(Afecta a: MDD, Tasks)*
- [ ] **Active Record:** Objeto que envuelve una fila de una tabla de base de datos, encapsula el acceso a los datos e incluye lógica de negocio asociada. *(Afecta a: MDD, Tasks)*
- [ ] **Unit of Work:** Mantiene una lista de objetos afectados por una transacción de negocio y coordina la escritura de los cambios. *(Afecta a: MDD, Flujos)*

#### 🛡️ 6. PATRONES DE INTEGRACIÓN, GESTIÓN DE APIs Y RESILIENCIA
- [ ] **API Gateway:** Único punto de entrada para todas las solicitudes de clientes, encargado de enrutar, agregar y autenticar. *(Afecta a: API, Arq, Infra)*
- [ ] **BFF (Backend For Frontend):** Crea variantes de backend específicas para optimizar el rendimiento y datos de interfaces web, móviles o IoT diferenciadas. *(Afecta a: Blueprint, Arq, API)*
- [ ] **Saga (Transacciones Distribuidas):** Gestiona la consistencia de datos entre microservicios mediante una secuencia de transacciones locales y acciones de compensación. *(Afecta a: Flujos, Tasks)*
- [ ] **Circuit Breaker:** Monitorea fallos en servicios externos y bloquea peticiones de forma temporal para evitar caídas en cascada. *(Afecta a: Arq, Tasks, Infra)*
- [ ] **Outbox Pattern:** Garantiza la publicación confiable de eventos asíncronos guardándolos primero en la base de datos local antes de enviarlos al Message Broker. *(Afecta a: Flujos, Tasks)*
- [ ] **Event Sourcing:** Almacena el estado de una entidad como una secuencia cronológica de eventos inmutables en lugar del estado actual puro. *(Afecta a: Arq, Flujos, Infra)*
- [ ] **Strangler Fig (Estrangulamiento):** Migra incrementalmente un sistema legado reemplazando características antiguas de forma gradual con nuevos servicios. *(Afecta a: Arq, Tasks)*

---

**Versión:** 2.0 (2026-05-02)  
**Arquitectura:** Monorepo (Turborepo)  
**Estado del Semáforo:** 🟢 Operativo en producción  
**Stack:** NestJS + React (Vite) + PostgreSQL + FalkorDB + LangGraph + OpenRouter

---

## 1. Resumen Ejecutivo y Alcance

**TheForge** es una plataforma de **Software Factory Orchestrator** que transforma una idea de producto o cambio en sistemas existentes en un paquete completo de especificación técnica gobernada por un **MDD (Model-Driven Design Document)**.

### Pilares
- **Especificación como producto:** El MDD es la Constitución del proyecto (SDD) — todo se valida contra él.
- **Proyectos nuevos y legacy:** Desde cero (greenfield) o con código existente (Ariadne MCP).
- **Estimación predecible:** Costo en MXN (nómina interna y valor mercado) desde la especificación.
- **Calidad gobernada:** Semáforo ROJO/AMARILLO/VERDE que bloquea generación de entregables si el diseño es incompleto.
- **Mutietapa:** Un proyecto puede tener múltiples `Stage` (versiones del MDD), cada una con su propio semáforo, estimación, BRD/To-Be/As-Is y documentación.

### Alcance
- **In-scope:** Entrevista proactiva con IA → MDD → Semáforo → Estimación → Entregables (Spec, Blueprint, API, Flujos, Infra, Tasks). Soporte para cambios en sistemas legacy con integración Ariadne MCP. Flujo BRD → To-Be → MDD con gates opcionales.
- **Out-of-scope:** Generación de código ejecutable (solo especificaciones y documentos). Despliegue multi-tenant SaaS (actualmente single-tenant con JWT).

---

## 2. Arquitectura de Software

### 2.1 Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend | NestJS | ^10.4.x |
| Frontend | React + Vite + Tailwind | ^18.3 / ^6 / ^3.4 |
| Base de Datos | PostgreSQL 15 + Prisma ORM | ^5.22 |
| Grafo Documental | FalkorDB | ^6.6 |
| Colas | BullMQ + Redis | ^5.71 |
| IA | OpenRouter (adapter) + LangGraph | ^0.2.x |
| MCP Propio | `@theforge/mcp-server` (stdio/HTTP) | - |
| MCP Externo | AriadneSpecs (HTTP JSON-RPC) | - |
| Infraestructura | Docker / Dokploy | - |

### 2.2 Estructura del Monorepo

```
/theforge/
├── apps/
│   ├── api/          # NestJS — orquestador, IA, proyectos, legacy
│   └── web/          # React — Workshop, Login, Lista proyectos
├── packages/
│   ├── database/     # Prisma schema + client
│   ├── shared-types/ # DTOs e interfaces (Zod)
│   ├── business-rules/ # Reglas puras (estimación, constantes)
│   ├── config/       # TS, ESLint, Tailwind base
│   └── mcp-server/   # Servidor MCP propio
├── docs/             # Documentación + corpus NotebookLM
├── docker-compose.yml
└── turbo.json
```

### 2.3 Módulos principales (apps/api)

| Módulo | Responsabilidad |
|---|---|
| **auth** | JWT + OTP (email), guard global |
| **projects** | CRUD, etapas (`Stage`), entregables, gate BRD/To-Be |
| **sessions** | Sesiones por proyecto, `chatLog`, persistencia |
| **ai** | LLM provider (OpenRouter adapter), generación de respuestas |
| **engine** | Semáforo + estimación (lógica pura, sin IA) |
| **ai-analysis** | LangGraph multiagente MDD, DBGA (Fase 0) |
| **ai-orchestrator** | Orquestador del chat Workshop → AgentSupervisor |
| **agent-supervisor** | Supervisor agéntico, ingest a Falkor, herramientas SDD |
| **theforge** | Cliente HTTP al MCP AriadneSpecs |
| **legacy-flow** | Flujo legacy: start → answer → MDD de cambio → entregables |
| **scraper** | Scraping de URLs (Cheerio) para Fase 0 |
| **graph-memory** | FalkorDB SDD: entidades, endpoints, salud del grafo |

### 2.4 Flujo de datos principal

```
[Workshop UI] → HTTP → [AiOrchestrator] → [AgentSupervisor] → [LangGraph]
                                                                    │
                             ┌──────────────────────────────────────┤
                             ▼                                      ▼
                    [AiService/OpenRouter]                    [FalkorDB SDD]
                             │                                      │
                             ▼                                      ▼
                    [LlM vía OpenRouter]                    [GraphMemoryService]
```

---

## 3. Modelo de Datos

### 3.1 Modelo relacional (Prisma)

**User** — usuarios del sistema (auth JWT/OTP)

**Project** — proyectos de software (NEW o LEGACY):
- `id`, `name`, `projectType`, `userId`
- `theforgeProjectId` — ID en Ariadne MCP (legacy)
- `requireBrdTobeGate` — si exige BRD/To-Be antes de MDD técnico
- Etapa activa (primera con `workflowStatus = ACTIVE`)
- Entregables globales: `blueprintContent`, `specContent`, `apiContractsContent`, `infraContent`, `uxUiGuideContent`, `tasksContent`, `useCasesContent`, `userStoriesContent`, `logicFlowsContent`, `phase0SummaryContent`, `dbgaContent`

**Stage** — ciclo SDD por versión del proyecto:
- `mddContent` — Constitución MDD (7 secciones)
- `brdContent`, `toBeManualContent`, `asIsManualContent` — precursores
- `status` (ROJO/AMARILLO/VERDE), `precisionScore`
- `workflowStatus` (DRAFT/ACTIVE/COMPLETED)
- `estimation` (1:1) — horas, MXN, teamStructure

**Session** — sesiones de chat por proyecto: `chatLog`, `contextStep`

**Estimation** — métricas de costo por etapa:
- `totalHours`, `totalMxn` (nómina), `totalMxnMarket` (mercado)
- `teamStructure` (horas por rol), `teamRoles` (labels)

**ArchitecturalPreference** — preferencias aprendidas del usuario

### 3.2 Modelo en grafo (FalkorDB)

Nodos: `Project`, `Stage`, `LegacyStage`, `MDD_Section`, `DB_Entity`, `API_Endpoint`
Relaciones: `HAS_STAGE`, `IMPLEMENTS`, `OWNS_ENTITY`, `CONSUMES`, `DERIVED_FROM` (etapas legacy)

---

## 4. Integración de IA

### 4.1 Proveedor: OpenRouter (Strategy Pattern)

- **Interfaz:** `LLMProvider` (abstract)
- **Adapter:** `OpenRouterAdapter` (SDK `openai`)
- **Factory:** `createLLMProvider()` → Nest DI
- **Embeddings:** `OPENROUTER_EMBEDDING_MODEL` o desactivado con `LLM_EMBEDDINGS_PROVIDER=none`

### 4.2 Pipeline MDD (Multiagente LangGraph)

1. **Manager** recibe mensaje del usuario → decide flujo
2. **Clarifier** → Sección 1 (Contexto y Alcance)
3. **Software Architect** → Secciones 2, 3, 4, 5
4. **Architect Critic** → verifica §3/§4, loop si hay gaps
5. **Security** → Sección 6
6. **Integration** → Sección 7
7. **Diagram Injector** → Mermaid ER desde SQL
8. **Auditor** → score, feedback, decisión (clarifier | done)

### 4.3 Fase 0 (DBGA)

1. **Scout** — investigación de mercado (Tavily + web)
2. **Tech Auditor** — stack de competidores
3. **Critic** — validación y re-investigación
4. **Synthesis** — documento DBGA final

### 4.4 MCP externo (AriadneSpecs)

Para proyectos legacy: `TheForgeService` invoca herramientas MCP vía HTTP JSON-RPC:
- `list_known_projects`, `get_modification_plan`, `ask_codebase`
- `get_file_content`, `get_legacy_impact`, `semantic_search`
- `validate_before_edit`

---

## 5. Lógica de Negocio

### 5.1 Semáforo de Calidad

| Estado | Rango | Condición |
|---|---|---|
| ROJO | <85% | Sin entidades, sin business_core, o gaps críticos |
| AMARILLO | 85-94% | Faltan edge_cases, field_types, o puertas de constitución |
| VERDE | ≥95% | Checklist completo O grafo SDD coherente que alivia gaps |

### 5.2 BRD/To-Be Gate

Proyectos con `requireBrdTobeGate=true`:
- Exigen BRD y To-Be aprobados (con timestamps en Stage)
- Sin aprobación, el stream MDD emite evento `blocked`
- Legado: `LEGACY` default `false` (MDD inicial sin obligación)

### 5.3 Etapas como cambios legacy

Cada etapa de cambio en un proyecto legacy es un `Stage` independiente:
- `Stage 1`: MDD inicial, BRD "sistema actual", To-Be "sistema actual"
- `Stage 2+`: DERIVED_FROM etapa anterior; prompt incremental
- FalkorDB sincroniza relaciones entre etapas

### 5.4 Flujo Chat Legacy

El chat en modo legacy:
- Inyecta instrucción: "Si el usuario menciona un cambio o hay ambigüedad, preguntar si es consulta o cambio"
- Desambiguación antes de activar flujo de cambio

---

## 6. Seguridad

### 6.1 Autenticación
- **OTP por email** (`EMAIL_OTP` + SMTP config) — solo correos pre-registrados
- **JWT** (`JWT_SECRET`, `JWT_EXPIRES_IN` default 7d)
- **Guard global** `JwtAuthGuard` — toda la API protegida

### 6.2 MCP
- `MCP_AUTH_TOKEN` (Bearer) o `MCP_X_M2M_TOKEN` para Ariadne MCP
- `MCP_M2M_SECRET` para auth del MCP server propio (login JWT compartido)

### 6.3 Otras medidas
- CORS restringido por `CORS_ORIGINS` en producción
- Validación Zod en todos los controllers
- Scraper con `ip-range-check` (SSRF guard), timeout y límite de body
- Sin SQL crudo (Prisma parametrizado)

---

## 7. Infraestructura

### 7.1 Despliegue (Dokploy / Docker)

6 servicios en `docker-compose.yml`:

| Servicio | Puerto interno | Expuesto | Persistencia |
|---|---|---|---|
| `theforge-db` (Postgres) | 5432 | No | Volumen `theforge_db_data` |
| `theforge-redis-queue` | 6379 | No | Volumen `theforge_redis_queue_data` |
| `theforge-falkor-sdd` | 6379 | 6380 | Volumen `theforge_falkor_data` |
| `theforge-api` | 3000 | Sí (vía Traefik) | - |
| `theforge-web` (Nginx) | 80 | Sí (público) | - |
| `theforge-mcp` | 3100 | No | - |

### 7.2 Routing (Traefik en Dokploy)

- `/` → `theforge-web:80`
- `/api` (strip path) → `theforge-api:3000`

### 7.3 Variables de entorno clave

Ver `README.md` y `.env.example` para la lista completa (>50 variables categorizadas: core, IA, MCP, caché, legacy, entregables, frontend, operacionales).

### 7.4 Consideraciones de red

- Comunicación interna por nombres Docker (ej. `theforge-api:3000`)
- `localhost` en Docker = propio contenedor — NO usar para cross-service
- Red única `theforge-app-network` para evitar agotar pools de Docker

---

*Documento generado desde el código del monorepo `theforge`. Última revisión: 2026-05-02.*
