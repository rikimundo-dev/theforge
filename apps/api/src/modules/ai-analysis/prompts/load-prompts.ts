import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(__dirname, ".");
// Force reload comment - Fix Manager "regenerar" delegation
/** En build Nest: assets van a dist/modules/ai-analysis/prompts; el JS a dist/apps/api/src/.../prompts (8 niveles hasta dist) */
const PROMPTS_DIR_DIST = join(__dirname, "..", "..", "..", "..", "..", "..", "..", "..", "modules", "ai-analysis", "prompts");

function loadPrompt(subdir: string, filename: string, fallback: string): string {
  const paths = [
    join(PROMPTS_DIR, subdir, filename),
    join(PROMPTS_DIR_DIST, subdir, filename),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf-8").trim();
      } catch {
        break;
      }
    }
  }
  return fallback;
}

// Benchmark (DBGA): Scout → Auditor → Critic → Synthesis
export const SCOUT_PROMPT = loadPrompt(
  "benchmark",
  "scout-prompt.md",
  "Eres un Market Scout. Identifica hasta 5 competidores directos. Responde solo con JSON: { competitors: [{ name, url, uvp?, pricing?, marketShare? }] }. No inventes URLs.",
);

export const AUDITOR_PROMPT = loadPrompt(
  "benchmark",
  "auditor-prompt.md",
  "Eres un Tech Auditor. Identifica tecnologías del dominio. Responde solo con JSON: { techStackInsights: string[] }.",
);

export const CRITIC_PROMPT = loadPrompt(
  "benchmark",
  "critic-prompt.md",
  "Eres un Critic. Revisa la info del Scout y Auditor. Responde solo con JSON: { criticDecision: 'scout'|'synthesis', refinedQuery?: string }.",
);

export const SYNTHESIS_PROMPT = loadPrompt(
  "benchmark",
  "synthesis-prompt.md",
  "Eres un Synthesis Agent. Produce el documento de Gap Analysis en markdown a partir del estado. Empieza por # Domain Benchmark & Gap Analysis.",
);

export const MDD_GOVERNANCE_AGENT_RULE = loadPrompt(
  "mdd",
  "mdd-governance-agent-rule.md",
  "**Gobernanza inmutable:** No modifiques la sección [ARQUITECTURA - SECCIÓN INMUTABLE]; respeta los patrones [X] del Wizard.",
);

function withMddGovernanceAgentRule(prompt: string): string {
  return `${prompt}\n\n${MDD_GOVERNANCE_AGENT_RULE}`;
}

// MDD: Clarificador → Security → Integration → Auditor
export const CLARIFIER_MDD_PROMPT = withMddGovernanceAgentRule(
  loadPrompt(
  "mdd",
  "clarifier-prompt.md",
  "Eres el Clarificador del MDD. Extrae requisitos del DBGA y genera la versión inicial del Master Design Document en markdown. Responde solo con JSON: { clarifiedScope, mddDraft }.",
  ),
);

export const CLARIFIER_QUESTIONS_ONLY_MDD_PROMPT = loadPrompt(
  "mdd",
  "clarifier-questions-only-prompt.md",
  "Genera exactamente 2 preguntas para el usuario para mejorar el MDD según el feedback del Auditor. Responde solo con JSON: { questions: [\"...\", \"...\"] }.",
);

/** Regenerar solo §1: sintetizar Contexto y alcance desde §2–§7. Salida: solo el cuerpo de §1 (sin título). */
export const CONTEXT_SYNTHESIZER_PROMPT = loadPrompt(
  "mdd",
  "context-synthesizer-prompt.md",
  "Sintetiza la sección 1. Contexto y alcance del MDD a partir de las secciones 2–7. Responde solo con el cuerpo de la sección 1 en markdown, en español.",
);

export const SOFTWARE_ARCHITECT_MDD_PROMPT = withMddGovernanceAgentRule(
  loadPrompt(
  "mdd",
  "software-architect-prompt.md",
  "Eres el Arquitecto de Software del MDD. Transforma el borrador del Clarificador en documento técnico: schema SQL completo (tablas, UUIDs, relaciones) y contratos de API con payloads JSON. Responde solo con JSON: { mddDraft }. NO uses tags de razonamiento ni pienses en voz alta. Devuelve ÚNICAMENTE el JSON.",
  ),
);

export const ARCHITECT_CRITIC_MDD_PROMPT = loadPrompt(
  "mdd",
  "architect-critic-prompt.md",
  "Eres un Critic que verifica si §3 y §4 del MDD cumplen la directiva del usuario. Responde solo con JSON: { verdict: 'ok'|'gap', gaps?: string[] }.",
);

export const FRONTEND_ARCHITECT_MDD_PROMPT = loadPrompt(
  "mdd",
  "frontend-architect-prompt.md",
  "Eres el Arquitecto Frontend del MDD. Añade la sección ## 4. Arquitectura Frontend en markdown basándote en el backend.",
);

export const SECURITY_ARCHITECT_MDD_PROMPT = withMddGovernanceAgentRule(
  loadPrompt(
  "mdd",
  "security-architect-prompt.md",
  "Eres el Arquitecto de Seguridad del MDD. Añade la sección ## Seguridad en markdown. Responde solo con JSON: { securitySection }. NO uses tags de razonamiento ni pienses en voz alta. Devuelve ÚNICAMENTE el JSON sin markdown ni código adicional.",
  ),
);

export const INTEGRATION_ENGINEER_MDD_PROMPT = withMddGovernanceAgentRule(
  loadPrompt(
  "mdd",
  "integration-engineer-prompt.md",
  "Eres el Ingeniero de Integración del MDD. Añade la sección ## Integración en markdown. Responde solo con JSON: { integrationSection }. NO uses tags de razonamiento ni pienses en voz alta. Devuelve ÚNICAMENTE el JSON.",
  ),
);

export const REDACTOR_MDD_PROMPT = loadPrompt(
  "mdd",
  "redactor-prompt.md",
  "Eres el Redactor del MDD. Unifica el documento y alinea Seguridad e Integración al alcance. Responde solo con JSON: { mddDraft }.",
);

export const AUDITOR_MDD_PROMPT = withMddGovernanceAgentRule(
  loadPrompt(
  "mdd",
  "auditor-prompt.md",
  "Eres el Auditor del MDD. Sigue el Protocolo de auditoría (5 pasos). Responde solo con JSON: auditorScore (0-100), auditorDecision ('clarifier' si <85, 'done' si >=85), auditorFeedback, status, critical_gaps, syntax_errors, infrastructure_ready. Textos en español. NO uses tags de razonamiento ni pienses en voz alta. Devuelve ÚNICAMENTE el JSON.",
  ),
);

export const MANAGER_MDD_PROMPT = loadPrompt(
  "mdd",
  "manager-prompt.md",
  "Eres el Manager del MDD. Entrevista al usuario con máximo 2 preguntas por ronda. Responde solo con JSON: { questions: string[] }.",
);

// Fase 0 — Entrevistador interactivo
export const PHASE0_ARRANQUE_PROMPT = loadPrompt(
  "phase0",
  "arranque-prompt.md",
  "Eres analista de dominio. Construye borrador inicial de Fase 0 + gaps. JSON: { borrador: {...}, gaps: [...] }.",
);

export const PHASE0_QUESTION_PROMPT = loadPrompt(
  "phase0",
  "question-prompt.md",
  "Eres entrevistador. Una pregunta a la vez. JSON: { type: 'question'|'done', question?: string }.",
);

export const PHASE0_UPDATE_PROMPT = loadPrompt(
  "phase0",
  "update-prompt.md",
  "Eres analista. Actualiza borrador + gaps con respuesta. JSON: { borrador: {...}, gaps: [...] }.",
);

export const MANAGER_PLAN_GENERATOR_PROMPT = loadPrompt(
  "mdd",
  "manager-plan-generator-prompt.md",
  "Genera un plan de ejecución MDD: lista de pasos con step_id, node, task_description y goal. Responde solo con JSON: { steps: [{ step_id, node, task_description, goal? }] }.",
);

/** Esqueleto canónico del MDD (§4.A antes que §4.B, profundidad §5, YAGNI). Referencia en prompts y docs; no se inyecta entero salvo que el producto lo requiera. */
export const MDD_CONSTITUTION_SKELETON_MARKDOWN = loadPrompt(
  "mdd",
  "mdd-constitution-skeleton.md",
  "# Master Design Document — constitución (YAGNI)\n\nVer repositorio: prompts/mdd/mdd-constitution-skeleton.md",
);

export const MDD_LLM_FORMATTER_PROMPT = loadPrompt(
  "mdd",
  "mdd-formatter-prompt.md",
  "Eres el Formateador del MDD. Recibes JSON estructurado y generas markdown limpio. Sin JSON keys en la salida.",
);

export const CROSS_CONSISTENCY_MDD_PROMPT = loadPrompt(
  "mdd",
  "cross-consistency-prompt.md",
  "Eres el Revisor de Consistencia Cruzada del MDD. Responde OK_CONSISTENT o un array JSON de parches find/replace.",
);
