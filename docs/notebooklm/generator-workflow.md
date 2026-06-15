> ⚠️ **Nota histórica:** Este documento describe un flujo especulativo de generación vía Cursor/Antigravity. La implementación real del pipeline MDD multiagente está en `apps/api/src/modules/ai-analysis/` (LangGraph). Ver `THEFORGE-INDEX.md` y `MDD-PATRONES-FLUJO.md` para la versión actual.

# TheForge: Spec-Driven Generator Workflow

This document outlines the standard operating procedure for generating high-precision software specifications using the "Constitution" pattern.

## Core Philosophy
1.  **Specification First:** No code is written until the MDD (Constitution) is ratified.
2.  **Ambiguity is a Bug:** The system must pause and ask questions rather than guess.
3.  **Strict Governance:** The Auditor has veto power over the Architect's designs.

## The Interactive Loop

### Phase 1: Intent Capture & Clarification
**Actors:** User, `Clarifier Agent`

1.  **User Input:** The user provides a high-level request (e.g., "I need a CRM for dentists").
2.  **CoVe Analysis (Internal):** The Clarifier analyzes the request:
    -   *Functional:* Patient management, appointments.
    -   *Technical Constraints:* HIPAA compliance? Data residency?
    -   *Ambigüenza:* "Do you need billing?" "Is it SaaS or on-prem?"
3.  **Socratic Response:** The Clarifier returns a set of questions to the user.
    -   *System Action:* **PAUSE**. Wait for user input.
4.  **Drafting:** Once clarity is achieved, the Clarifier produces `MDD Section 1 (Context)`.

### Phase 2: Constitutional Design
**Actors:** `Software Architect`, `Security Architect`

1.  **Meta-Prompting:** The Architect reads Section 1 and lists all required entities *before* drafting SQL.
2.  **Drafting:**
    -   `Section 2 (Stack)`: Defined based on project constraints.
    -   `Section 3 (Data Model)`: SQL + Mermaid ERD.
    -   `Section 4 (API)`: OpenAPI contracts derived *strictly* from the Data Model.
3.  **Security Overlay:** The Security Architect injects policies (RBAC, Encryption) that modify Sections 3 & 4.

### Phase 3: The Audit (Veto Power)
**Actors:** `Auditor Agent`

1.  **Compliance Check:**
    -   Does every API endpoint have a backing table?
    -   Are all "MUST" requirements from Section 1 present?
2.  **Decision:**
    -   **Pass (>85/100):** The MDD is marked as `APPROVED`.
    -   **Fail (<85/100):** The Auditor returns a list of `critical_gaps` to the Manager.
    -   *System Action:* The Manager triggers a **Correction Loop** (back to Architect) automatically.

## Usage for Developers

To initiate this workflow in Cursor/Antigravity:

```bash
# Desde apps/api (tras pnpm install en la raíz)
cd apps/api
pnpm exec tsx scripts/generate-mdd.ts --interactive
```

### Proveedor LLM (alineado al API The Forge)
El backend usa **OpenRouter** (`OPENROUTER_API_KEY` o `AI_API_KEY` / `OPENAI_API_KEY`). Ver `.env.example` y `docs/notebooklm/THEFORGE-INDEX.md` §3.

(Nota: script `generate-mdd.ts` pendiente si aplica)

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
