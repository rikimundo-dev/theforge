# Technical Specification: AI Agentic Module for DBGA

**Status:** Ready for Implementation
**Target Framework:** NestJS, LangChain.js (LangGraph)
**Module Name:** `AiAnalysisModule`

## 1. Objective

Implement a multi-agent system to automate the **Domain Benchmark & Gap Analysis (DBGA)**. The system must orchestrate specialized agents to research, scrape, and synthesize market data based on a raw user idea.

## 2. Architecture & Patterns

- **Isolation:** The entire logic must reside in `src/modules/ai-analysis/`.
- **State Management:** Use **LangGraph.js** to manage the agent workflow state.
- **Asynchronicity:** Since analysis is long-running, use a **Job Queue (BullMQ)** or an **Event-Driven** approach.
- **Streaming:** Implement a `Subject` or `EventEmitter` to stream partial agent thoughts to the frontend via WebSockets/SSE.

## 3. Data Schema (The "State")

The shared state between agents must be strictly typed:

```tsx
interface DBGAState {
  rawIdea: string;
  competitors: CompetitorData[]; // From Research Agent
  techStackInsights: string[]; // From Tech Agent
  userPainPoints: string[]; // From Voice Agent
  gapAnalysis: string; // From Synthesis Agent
  status: "idle" | "researching" | "analyzing" | "finalizing";
}
```

## 4. Agent Definitions (Strict Roles)

### A. Market Scout (Researcher)

- **Tooling:** TavilySearch, scrape URL (Cheerio + fetch).
- **Behavior:** Focus on Top 5 direct competitors. Extract: UVP (Unique Value Proposition), pricing, and market share.
- **Constraint:** Do not hallucinate URLs; every competitor must have a verified link.

### B. Tech Auditor (Technical)

- **Tooling:** Web Scraping (Headers/Metadata).
- **Behavior:** Identify technologies used (e.g., "Built with Next.js", "Uses Stripe").
- **Constraint:** Infer architecture from public data only.

### C. Critic Agent (Validation)

- **Behavior:** Reviews the output of Scout and Auditor. If the info is generic, it triggers a "re-research" loop with a more specific query.

## 5. Implementation Roadmap for Cursor AI

### Step 1: Module Boilerplate

- Create `AiAnalysisModule`, `AiAnalysisService`, and `AiAnalysisController`.
- Install dependencies: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `zod`.

### Step 2: LangGraph Definition

- Define the `StateGraph`.
- Implement nodes for each agent.
- Define edges: `Scout -> Auditor -> Critic -> Synthesis`.

### Step 3: Tool Integration

- Setup a `ToolRegistry` to inject search and scraping capabilities into the agents.

### Step 4: NestJS Integration

- The `AiAnalysisService` must expose a method `startAnalysis(idea: string)`.
- Use **Environment Variables** for API Keys (AI_API_KEY / OPENAI_API_KEY, TAVILY_API_KEY).

## 6. Persistent Memory (Implemented)

- **Checkpointer:** PostgresSaver (`@langchain/langgraph-checkpoint-postgres`). Tabla `AgentStateCheckpoint` en Prisma (threadId por proyecto). Cada proyecto tiene un `thread_id` único; Fase 0 puede retomarse invocando `POST /ai-analysis/start` con `{ idea, projectId }`.
- **Memoria semántica:** Al aprobar un MDD, el frontend llama `POST /ai/preferences/learn-from-mdd` con `{ projectId, mddContent }`. Se extraen preferencias arquitectónicas y se guardan en `ArchitecturalPreference`. Al iniciar Fase 0 (DBGA) o el chat del Workshop, se inyectan en el contexto (Scout y Master Prompt).
- **Master Prompt:** Sección HISTORIAL_DE_APRENDIZAJE: la IA no repite preguntas ya definidas en otros proyectos, sugiere mejoras basadas en lo que funcionó (ej. SSO) y mantiene la consistencia del rigor técnico.

## 7. Anti-Patterns to Avoid (Strict)

1. **NO** logic inside controllers. Everything must be in the Service or Graph.
2. **NO** hardcoded prompts. Use a separate `prompts/` directory or constants.
3. **NO** blocking calls. Always return a `JobId` or use a Stream.
4. **NO** generic `any` types. Use Zod schemas for agent outputs.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-05-22 (pnpm). Rutas relativas al monorepo `theforge`.*
