import {
  MDD_MAX_GOAL_OTHER_NODES_CHARS,
  MDD_MAX_GOAL_SOFTWARE_ARCHITECT_CHARS,
  MDD_MAX_PLAN_DIRECTIVE_CHARS,
} from "@theforge/shared-types";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { Command, END, interrupt } from "@langchain/langgraph";
import type { LivePrecisionCalculator } from "../estimation/estimation.types.js";
import { MANAGER_MDD_PROMPT, MANAGER_PLAN_GENERATOR_PROMPT } from "../prompts/load-prompts.js";
import { mddStructuredToMarkdown } from "../render/mdd-structured-to-markdown.js";
import type { MDDStateType } from "../state/index.js";
import type { MddPlanStep } from "../state/mdd-state.schema.js";
import { getLastSubstantiveUserMessage, getPlanDirective, getUserBrief } from "../utils/mdd-user-brief.js";
import { extractFirstJsonObject, parseJsonOrThrow } from "../utils/parse-json.js";
import { regenerateErDiagramFromSql } from "../utils/mdd-diagram-suggestions.js";
import {
  ensureContratosSection,
  hydrateStructuredFromDraft,
  logMddNodeOutput,
  finalizeMddDeliverable,
  normalizeMddFormat,
  replaceContextWhenOnlyMetadata,
  sanitizeContextKeyValueAndObject,
  sanitizeContextSection,
} from "../utils/mdd-sanitize.js";
import { reconcileUiUxDesignIntent } from "../utils/mdd-enrich-uiux-intent.js";
import { z } from "zod";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";
import { generateImpactAnalysis } from "../utils/mdd-impact-analysis.js";
import { getAgenticRagToolset } from "../tools/tool-registry.js";
import { runAgentToolsRound } from "../utils/mdd-agent-tools-invoke.js";
import type { ProjectsService } from "../../projects/projects.service.js";
import type { TheForgeService } from "../../theforge/theforge.service.js";
import type { AiService } from "../../ai/ai.service.js";

/** Tools SDD + TheForge para `search_memory` (bindTools). */
export type MddManagerToolDeps = {
  projects: ProjectsService;
  theforge: TheForgeService;
  ai: AiService;
};

/** Schema para parse manual (discriminated union). */
const managerOutputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), reply: z.string() }),
  z.object({
    action: z.literal("delegate"),
    target: z.enum(["clarifier_only", "full_pipeline", "sections"]).optional(),
    sections: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("search_memory"),
    memorySearchQuery: z.string(),
  }),
]);

/**
 * Schema plano para structured output. OpenAI exige que 'required' incluya todas las propiedades;
 * no usar .optional() ni .default() o el JSON schema tendrá campos fuera de required y fallará.
 */
const managerStructuredOutputSchema = z.object({
  action: z.enum(["reply", "delegate", "search_memory"]).describe("reply = solo aclaración; delegate = ejecutar agentes; search_memory = buscar en grafo"),
  reply: z.string().describe("Si action es reply: respuesta breve al usuario; si delegate/search enviar cadena vacía"),
  target: z
    .enum(["clarifier_only", "full_pipeline", "sections"])
    .describe("clarifier_only = solo sección 1; full_pipeline = todo; sections = solo los listados en sections"),
  sections: z
    .array(z.string())
    .describe("Si target es sections: software_architect, security, integration; si no, array vacío"),
  memorySearchQuery: z
    .string()
    .describe("Si action es search_memory: la intención a buscar en el grafo (ej: 'auth con MFA'); si no, cadena vacía"),
});

/** Orden de agentes en el pipeline (sin Clarifier). Tras software_architect viene format_after_architect (y crítico si aplica). */
const PIPELINE_AGENTS = ["software_architect", "security", "integration"] as const;
const PIPELINE_TAIL = ["format_after_redactor", "diagram_injector", "auditor"] as const;

/** Infiere qué agentes toca la petición a partir del texto (modelo de datos, seguridad, integración). */
function inferSectionsFromMessage(text: string): string[] {
  const t = (text ?? "").toLowerCase();
  const out: string[] = [];
  const needsModelOrApi =
    /\b(modelo\s+de\s+datos|modelo\s+datos|tablas?|entidades?|schema|sql|roles?|permisos?|aplicaciones?|§3|secci[oó]n\s*3)\b/i.test(t) ||
    /\b(contratos?\s+api|endpoints?|§4|secci[oó]n\s*4)\b/i.test(t) ||
    /\b(arquitectura|stack|frontend|kubernetes|kubernets|k8s|dokploy|coolify|despliegue|contenedores?|§2|secci[oó]n\s*2)\b/i.test(t) ||
    /\b(denue|inegi|directorio\s+estad[ií]stico|app\/api\/denue|consulta\/buscar)\b/i.test(t) ||
    /\b(base\s+de\s+datos|campo|columna|guardar(?:se)?\s+en|almacenar\s+en|jwt_token|refresh_token|token\s+en\s+bd)\b/i.test(t);
  if (needsModelOrApi) out.push("software_architect");
  if (
    /\b(seguridad|mfa|2fa|autenticaci[oó]n|autorizaci[oó]n|rbac|§6|secci[oó]n\s*6|paso\s*6)\b/i.test(t) ||
    /\b(?:regenera|actualiza|rehacer).*(?:paso|secci[oó]n)\s*6\b/i.test(t)
  ) {
    out.push("security");
  }
  if (/\b(infraestructura|docker|kubernetes|kubernets|k8s|dokploy|coolify|despliegue|§7|secci[oó]n\s*7)\b/i.test(t)) {
    out.push("integration");
  }
  return [...new Set(out)];
}

/** Cambio concreto sobre stack/despliegue/infra (mensajes cortos que el LLM suele clasificar como reply). */
function looksLikeExplicitMddModificationRequest(msg: string): boolean {
  const t = (msg ?? "").trim();
  if (t.length < 15) return false;
  if (/^\s*¿/.test(t) && !/\b(cambiar|reemplaz|no\s+se\s+usar|usar[ií]a|sustitu|modific|actualiz)\b/i.test(t)) {
    return false;
  }
  const changeIntent =
    /\b(no\s+se\s+usar[aá]?|usar[ií]a|usar[aá]?|cambiar|cambio|reemplaz|sustitu|modific|actualiz|en\s+vez\s+de|en\s+lugar\s+de|pasar(?:emos)?\s+a)\b/i.test(
      t,
    );
  const mddSurface =
    /\b(kubernetes|kubernets|k8s|dokploy|coolify|docker|despliegue|deploy|infra|stack|§\s*2|secci[oó]n\s*2|secci[oó]n\s*7|§\s*7)\b/i.test(
      t,
    );
  return changeIntent && mddSurface;
}

/** Descripción por nodo para el plan explícito (patrón Planner–Executor). */
const NODE_TASK_DESCRIPTIONS: Record<string, string> = {
  ask_initial_topic: "Preguntar tema o problema del MDD",
  clarifier: "Clarificar contexto y alcance",
  merge_section1_only: "Fusionar solo sección 1 (contexto y alcance)",
  software_architect: "Definir schema SQL y contratos de API",
  format_after_architect: "Formatear documento tras arquitecto",
  security: "Definir arquitectura de seguridad",
  integration: "Definir integraciones (API/Docker)",
  format_after_redactor: "Formatear documento final",
  diagram_injector: "Añadir diagramas Mermaid",
  auditor: "Evaluar calidad del MDD",
};

/** 4.3 Least privilege: tools por nodo (solo nodos con tools en el grafo MDD). */
const NODE_REQUIRED_TOOLS: Record<string, string[]> = {
  software_architect: ["format_section3_endpoints"],
  auditor: ["validate_mdd_structure", "validate_sql_syntax", "validate_json_payloads"],
};

function stepWithTools(node: string, stepId: string, taskDescription: string, goal?: string): MddPlanStep {
  const required_tools = NODE_REQUIRED_TOOLS[node];
  return {
    step_id: stepId,
    task_description: taskDescription,
    node,
    ...(goal ? { goal } : {}),
    ...(required_tools?.length ? { required_tools } : {}),
  };
}

/** Sufijo opcional para contextualizar solo el primer paso con la solicitud del usuario (máx. 50 chars). */
function contextSuffix(userBrief: string | undefined): string {
  if (!userBrief || userBrief.length < 10) return "";
  const trimmed = userBrief.replace(/\s+/g, " ").trim().slice(0, 50);
  return trimmed.length >= 10 ? ` (según: ${trimmed}${userBrief.length > 50 ? "…" : ""})` : "";
}

/** Indicios de requisito de modelo de datos (para goal explícito en paso software_architect). */
const MODEL_REQUIREMENT_REGEX =
  /\b(aplicaciones?|modelo\s+de\s+datos|roles?|permisos?|entidades?|tablas?|diagrama\s*(er|entidad|relaci[oó]n)?|relaci[oó]n(es)?|base\s+de\s+datos|campo|columna|guardar(?:se)?\s+en|jwt_token|refresh_token)\b/i;

/** Indicios de petición que afectan §2 Arquitectura y Stack (stack tecnológico, frontend, backend, etc.). */
const STACK_SECTION2_REGEX =
  /\b(stack|arquitectura|frontend|backend|framework|tecnolog[ií]a|nestjs|react|vue|angular|node\.?js|postgresql|mysql|vite|webpack|docker|kubernetes|kubernets|k8s|dokploy|coolify|despliegue|contenedores?|secci[oó]n\s*2|§2)\b/i;

function truncateForGoal(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/**
 * Goal para un paso a partir del plan/directiva. El manager es la única fuente de instrucciones
 * explícitas para los agentes: aquí se construye el texto que recibe cada nodo (currentStepGoal).
 * Sin condicionales en los nodos: el Arquitecto solo obedece lo que viene en el goal/directive.
 */
function goalForStep(node: string, directiveOrBrief: string | undefined): string | undefined {
  if (!directiveOrBrief || directiveOrBrief.length < 10) return undefined;
  const full = directiveOrBrief.replace(/\s+/g, " ").trim();
  const shortGoal = truncateForGoal(full, MDD_MAX_GOAL_OTHER_NODES_CHARS);
  const architectGoal = truncateForGoal(full, MDD_MAX_GOAL_SOFTWARE_ARCHITECT_CHARS);
  if (architectGoal.length < 10) return undefined;
  if (node === "clarifier") return `Aclarar contexto y alcance para: ${shortGoal}`;
  if (node === "software_architect") {
    const rolesPorApp =
      /(?:roles?\s+por\s+aplicaci[oó]n|roles?\s+a\s+nivel\s+de\s+aplicaci[oó]n|permisos?\s+basados\s+en\s+roles?\s+definidos\s+por\s+cada\s+aplicaci[oó]n)/i.test(full);
    if (rolesPorApp) {
      return "Cambiar el modelo de datos para que incluya applications, application_roles por aplicación y user_application_roles. No copies §3 del borrador; genera §3 desde cero con esas tablas. Luego elabora §4 Contratos de API.";
    }
    if (directiveRequiresModelAndDiagramChange(full)) {
      return `Requisito de seguridad/almacenamiento: ${architectGoal} Debes actualizar §3 Modelo de Datos (quitar de las tablas SQL cualquier campo que no deba persistirse, p. ej. jwt_token) y el diagrama entidad-relación para que coincida; y §4 Contratos de API (añadir o ajustar endpoints, p. ej. refresh_token). Revisa todo el SQL y el erDiagram y elimina columnas que el usuario indica que no deben guardarse en BD.`;
    }
    const affectsModel = MODEL_REQUIREMENT_REGEX.test(full);
    const affectsSection2 = STACK_SECTION2_REGEX.test(full);
    if (affectsModel && affectsSection2) {
      return `Actualizar §2 Arquitectura y Stack y el modelo de datos según lo que pide el usuario. Elabora §2, §3 (SQL, diagrama ER), §4 y §5 según: ${architectGoal}`;
    }
    if (affectsSection2) {
      return `Actualizar §2 Arquitectura y Stack según lo que pide el usuario. Elabora §2 (y §3, §4, §5 si aplica) según: ${architectGoal}`;
    }
    if (affectsModel) {
      return `Cambiar el modelo de datos para que incluya lo que pide el usuario. Elabora §3 (SQL, diagrama ER) y §4 Contratos según: ${architectGoal}`;
    }
    return `Incorporar en §2, §3, §4 y §5 lo indicado: ${architectGoal}`;
  }
  if (node === "security") return `Aplicar en §6 Seguridad lo que corresponda de: ${shortGoal}`;
  if (node === "integration") return `Aplicar en §7 Infraestructura lo que corresponda de: ${shortGoal}`;
  return undefined;
}

/** Si la directiva pide no guardar algo en BD (ej. jwt_token) o eliminar un campo, el Arquitecto debe actualizar §3 y diagrama. */
function directiveRequiresModelAndDiagramChange(directive: string): boolean {
  const d = (directive ?? "").toLowerCase();
  return (
    /\bno\s+guardar(?:se)?\s+en\s+base\s+de\s+datos\b/i.test(d) ||
    /\b(no\s+almacenar|eliminar\s+campo|quitar\s+campo|no\s+persistir|jwt_token|refresh_token)\b/i.test(d) ||
    /\bcampo\s+\w+.*(?:no\s+debe|no\s+guardar|eliminar|quitar)\b/i.test(d)
  );
}

/** Construye el plan estructurado (lista de pasos) al delegar; artefacto explícito para patrón Planner–Executor. */
function buildMddPlan(
  delegateTarget: "clarifier_only" | "full_pipeline" | "sections" | undefined,
  sectionsToRun: string[] | undefined,
  userBrief?: string,
  planDirective?: string,
): MddPlanStep[] {
  // Preferir directiva acumulada (primera petición sustancial) sobre último mensaje corto ("no, ya haz la modificación").
  const effectiveBrief =
    planDirective?.trim() && planDirective.trim().length > 50 ? planDirective.trim() : (userBrief ?? "");
  const suffix = contextSuffix(effectiveBrief);
  const briefForGoal = effectiveBrief.replace(/\s+/g, " ").trim();
  const step = (node: string, stepId: string, desc: string, isFirst: boolean): MddPlanStep =>
    stepWithTools(node, stepId, isFirst ? desc + suffix : desc, goalForStep(node, briefForGoal));

  if (delegateTarget === "clarifier_only") {
    return [
      step("clarifier", "1", NODE_TASK_DESCRIPTIONS.clarifier, true),
      step("merge_section1_only", "2", NODE_TASK_DESCRIPTIONS.merge_section1_only, false),
    ];
  }
  if (delegateTarget === "sections" && sectionsToRun?.length) {
    return sectionsToRun.map((node, i) =>
      step(node, String(i + 1), NODE_TASK_DESCRIPTIONS[node] ?? node, i === 0),
    );
  }
  if (delegateTarget === "full_pipeline" || !delegateTarget) {
    const fullSequence = ["clarifier", "software_architect", "format_after_architect", "security", "integration", "format_after_redactor", "diagram_injector", "auditor"];
    return fullSequence.map((node, i) =>
      step(node, String(i + 1), NODE_TASK_DESCRIPTIONS[node] ?? node, i === 0),
    );
  }
  return [];
}

export type ExpandSectionsToRunOptions = {
  /**
   * full: format tras arquitecto + cola (format_after_redactor, diagram_injector, auditor).
   * minimal: solo agentes de dominio (sin format ni cola) — planes acotados stack/infra.
   */
  tail?: "full" | "minimal";
};

/** Expande la lista de agentes solicitados a la secuencia real de nodos (incluye format entre escritores y tail). */
export function expandSectionsToRun(
  agentNames: string[],
  options?: ExpandSectionsToRunOptions,
): string[] {
  const tailMode = options?.tail ?? "full";
  const valid = new Set(agentNames.filter((a) => PIPELINE_AGENTS.includes(a as (typeof PIPELINE_AGENTS)[number])));
  const out: string[] = [];
  for (const node of PIPELINE_AGENTS) {
    if (valid.has(node)) {
      out.push(node);
      if (tailMode === "full" && node === "software_architect") out.push("format_after_architect");
    }
  }
  if (!out.length) return [];
  if (tailMode === "minimal") return out;
  return [...out, ...PIPELINE_TAIL];
}

const FULL_PIPELINE_NODES = ["clarifier", "software_architect", "format_after_architect", "security", "integration", "format_after_redactor", "diagram_injector", "auditor"] as const;
const CLARIFIER_ONLY_NODES = ["clarifier", "merge_section1_only"] as const;

const planGeneratorOutputSchema = z.object({
  steps: z.array(
    z.object({
      step_id: z.string(),
      node: z.string(),
      task_description: z.string(),
      goal: z.string().optional(),
    }),
  ),
});

/**
 * Genera el plan de ejecución (tareas explícitas por agente) interpretando la intención del usuario.
 * El Manager es quien interpreta y produce las instrucciones; los agentes solo ejecutan lo que viene en cada paso.
 * Si el LLM falla o devuelve un plan inválido, retorna [] para usar fallback buildMddPlan.
 */
async function generateMddPlanWithLLM(
  llm: BaseChatModel,
  state: MDDStateType,
  delegateTarget: "clarifier_only" | "full_pipeline" | "sections" | undefined,
  sectionsToRun: string[] | undefined,
): Promise<MddPlanStep[]> {
  const allowedNodes =
    delegateTarget === "clarifier_only"
      ? new Set(CLARIFIER_ONLY_NODES)
      : delegateTarget === "sections" && sectionsToRun?.length
        ? new Set(sectionsToRun)
        : new Set(FULL_PIPELINE_NODES);
  const planDirective = getPlanDirective(state);
  const userBrief = getUserBrief(state);
  const context = [
    "**Objetivo / petición del usuario:**",
    planDirective?.trim() || userBrief?.trim() || state.lastUserMessage?.trim() || "(sin mensaje)",
    state.clarifiedScope?.trim() ? `\n**Alcance clarificado:**\n${state.clarifiedScope.trim().slice(0, 2000)}` : "",
    `\n**Tipo de delegación:** ${delegateTarget ?? "full_pipeline"}${sectionsToRun?.length ? `; agentes: ${sectionsToRun.join(", ")}` : ""}`,
    "\n**Instrucción:** Genera un plan (lista de pasos) con `step_id`, `node`, `task_description` y `goal` para cada paso. Usa solo nodos de la lista permitida. El `goal` debe ser una instrucción concreta para ese agente (qué hacer en §3, §4, etc.). Responde solo con el JSON.",
  ]
    .filter(Boolean)
    .join("\n");
  const prompt = `${MANAGER_PLAN_GENERATOR_PROMPT}\n\n---\n${context}`;
  try {
    const response = await llm.invoke([new HumanMessage(prompt)]);
    const text = typeof response.content === "string" ? response.content : "";
    if (!text.trim()) return [];
    const jsonStr = extractFirstJsonObject(text);
    if (!jsonStr) return [];
    const parsed = planGeneratorOutputSchema.safeParse(JSON.parse(jsonStr));
    if (!parsed.success || !parsed.data.steps?.length) return [];
    const steps: MddPlanStep[] = [];
    let stepIndex = 0;
    for (const s of parsed.data.steps) {
      if (!allowedNodes.has(s.node)) continue;
      stepIndex += 1;
      const required_tools = NODE_REQUIRED_TOOLS[s.node];
      steps.push({
        step_id: String(stepIndex),
        task_description: s.task_description.trim() || (NODE_TASK_DESCRIPTIONS[s.node] ?? s.node),
        node: s.node,
        ...(s.goal?.trim() ? { goal: s.goal.trim() } : {}),
        ...(required_tools?.length ? { required_tools } : {}),
      });
    }
    return steps;
  } catch {
    return [];
  }
}

/** >= 85: done (cede intervención al usuario). < 85: Manager asigna gaps a agentes para corregir. */
const QUALITY_THRESHOLD = 85;
/** Nota < 9/10: por debajo de 90% el documento se devuelve al Clarifier con reporte de gaps para segunda iteración. */
const AUDITOR_RETRY_THRESHOLD = 90;
const MAX_MDD_ITERATIONS = 3;

/** Usuario pide explícitamente detenerse: done solo si Auditor >= 85% o el usuario lo pide. */
const USER_STOP_PATTERN = /^(parar|detener|stop|terminar|salir|no\s+continuar|basta|listo)$/i;

/** Petición explícita de auditar el documento → disparar solo el Auditor (no todo el pipeline). */
const AUDIT_DOCUMENT_PATTERN =
  /audita\s+(el\s+)?(mdd|documento)|auditar\s+(el\s+)?(mdd|documento)/i;

/** Usuario pide solo reformatear el documento (sin LLM). */
const REFORMAT_DOCUMENT_PATTERN =
  /reformatea\s+(el\s+)?(mdd|documento)|reformatear\s+(el\s+)?(mdd|documento)|reformateo\s+(del?\s+)?(mdd|documento)/i;

/** Usuario pide regenerar el diagrama ER desde el SQL (solo sección 2, sin LLM). */
const REGENERATE_ER_DIAGRAM_PATTERN =
  /regenera(r)?\s+(el\s+)?(diagrama\s+)?(er|entidad-relación|entidad\s+relación)(\s+desde\s+el\s+sql)?|regenerar\s+(el\s+)?(diagrama\s+)?(er|entidad-relación)/i;

/** Regeneración completa del MDD (constitución); plan aprobado + pipeline, no solo reply del Manager. */
function looksLikeFullMddRegenerateRequest(msg: string): boolean {
  const m = (msg ?? "").trim();
  if (m.length < 10) return false;
  if (REGENERATE_ER_DIAGRAM_PATTERN.test(m)) return false;
  if (REFORMAT_DOCUMENT_PATTERN.test(m)) return false;
  return (
    /(?:re)?genera(?:rá|ra|r|mos|da)\s+(?:de\s+nuevo\s+)?(?:todo\s+)?(?:el\s+|la\s+)?(?:mdd|master\s+design\s+document(?:\s*\(mdd\))?|documento\s+(?:maestro|completo))\b/i.test(m) ||
    /\b(?:vuelve|volver)\s+a\s+generar\s+(?:el\s+|la\s+)?(?:mdd|documento)\b/i.test(m) ||
    /\brehacer\s+(?:el\s+|la\s+)?(?:mdd|documento)(?:\s+desde\s+cero)?\b/i.test(m) ||
    /\bactualiza(?:r)?\s+(?:el\s+|la\s+)?(?:mdd|documento)\s+completo\b/i.test(m)
  );
}

const FULL_MDD_REGENERATE_DIRECTIVE =
  "ACCIÓN REQUERIDA — Regeneración completa del MDD (constitución vigente del repo):\n" +
  "1) §2: solo stack que §1 sustente; bloque ```TechnicalMetadata``` **prohibido** en §2 (va en §3).\n" +
  "2) §3: CREATE TABLE + erDiagram + ```TechnicalMetadata```; si hay GEOMETRY, extensiones `postgis` en el SQL; YAGNI.\n" +
  "3) §4: **obligatorio §4.A** (API del producto: tabla + /health + endpoints alineados a §3). **§4.B** solo para integraciones externas (DENUE, etc.). No dejes §4 = solo terceros.\n" +
  "4) §5: proporcional al alcance; sin checklist genérico interminable.\n" +
  "5) Reescribe §2–§5 desde cero si el borrador contradice lo anterior; conserva §1 salvo que el usuario pida cambiar contexto.\n" +
  "6) §6 y §7: placeholders breves para agentes posteriores si aún no aplican — sin fusionar `## 6. Seguridad` con `###`.";

/**
 * Usuario pide explícitamente solo generar/regenerar contexto y alcance a partir del documento.
 * Si coincide, delegar solo al Clarifier y fusionar solo sección 1 (no ejecutar el resto del pipeline).
 */
function looksLikeContextScopeOnlyRequest(msg: string): boolean {
  const m = (msg ?? "").trim().toLowerCase();
  if (m.length < 20) return false;
  return (
    /\b(no\s+)?generaste\s+(el\s+)?contexto\s+y\s+alcance\b/i.test(m) ||
    /\b(genera|generar|generen)\s+(solo\s+)?(el\s+)?contexto\s+y\s+alcance\b/i.test(m) ||
    /\bcontexto\s+y\s+alcance\b.*\b(a\s+partir\s+del\s+documento|del\s+documento|del\s+contenido)\b/i.test(m) ||
    /\b(solo\s+)?contexto\s+y\s+alcance\b.*\b(genera|generar|debes\s+generarlo)\b/i.test(m)
  );
}

/** Indica si el usuario pide seguir refinando (ej. "sigamos trabajando", "avanzar al 85%", "seguir con el MDD"). */
const CONTINUE_REFINING_PATTERN =
  /(?:sigamos?|seguir|continu(?:ar|amos|emos)|avancemos?|avanzar|trabaj(?:ar|emos)|(?:del?\s+)?\d+\s*%\s*(?:al\s+)?85|(?:al\s+)?85\s*%|mejor(?:ar|emos)|refin(?:ar|emos)|complet(?:ar|emos)|termin(?:ar|emos)\s+el\s+mdd)/i;

/** Usuario pregunta qué falta o con qué continuar para llegar al 85% (debe responder con auditorFeedback). */
const ASK_WHAT_NEEDED_FOR_85_PATTERN =
  /(?:con\s+qué|qué\s+falta|qué\s+necesitamos?|qué\s+hay\s+que\s+hacer|qué\s+pendiente|cómo\s+llegamos?)\s+(?:para\s+)?(?:llegar\s+al\s+)?\d+\s*%?|\d+\s*%?\s*(?:con\s+qué|qué\s+falta|qué\s+continuamos)/i;

/** Respuesta breve de acuerdo a una propuesta (ACID, MFA, etc.): delegar para que se incorpore al MDD, no responder "reply". */
const SHORT_AGREEMENT_PATTERN =
  /^(?:s[ií]|s[ií]\s*,\s*de\s*acuerdo|de\s*acuerdo|ok|vale|correcto|estoy\s+de\s+acuerdo|perfecto|acepto|aprobado|procedamos?|adelante|hazlo|incorpóralo|agreg(?:ar|uen)(?:lo)?|inclu(?:ir|yan)(?:lo)?)[\s.]*$/i;

/** Confirmación de aprobación del plan (HITL 4.4): ejecutar el plan pendiente. */
const PLAN_APPROVAL_CONFIRM_PATTERN =
  /^(?:s[ií]|s[ií]\s*,\s*ejecuta|ejecuta(r)?\s*(el\s+)?plan|adelante|aprobado|ok|vale|procedamos?|adelante\s+con\s+el\s+plan|ejecutar)[\s.]*$/i;

/** Petición explícita de regenerar una sección del MDD (p. ej. «regenera el paso 6»). */
const REGENERATE_SECTION_N_PATTERN =
  /\b(?:regenera(?:r)?|rehacer|actualiza(?:r)?|genera(?:r)?\s+de\s+nuevo)\s+(?:solo\s+)?(?:la\s+)?(?:secci[oó]n|paso)\s*([1-7])\b/i;

function parseRegenerateSectionNumber(msg: string): number | null {
  const m = (msg ?? "").trim().match(REGENERATE_SECTION_N_PATTERN);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return n >= 1 && n <= 7 ? n : null;
}

/** Mapea número de sección MDD → agente del pipeline (§6 → security). */
function agentsForMddSection(section: number): string[] {
  if (section === 1) return ["clarifier"];
  if (section >= 2 && section <= 5) return ["software_architect"];
  if (section === 6) return ["security"];
  if (section === 7) return ["integration"];
  return [];
}

/** Usuario indica que ya no tiene más información o que trabaje con lo que hay → armar plan actual y mostrar para aprobar. */
const WORK_WITH_WHAT_WE_HAVE_PATTERN =
  /^(?:(?:no,?\s*)?ya\s*(?:trabaj(e|a)|haz\s*(?:la\s*)?modificaci[oó]n)|no\s*tengo\s*m[aá]s\s*(informaci[oó]n|info)?|ejecut(a|ar)|avanza|contin[uú]a|con\s+eso\s+est[aá]|listo\s*para\s*ejecut|haz\s*(la\s*)?modificaci[oó]n)[\s.]*$/i;

function wantsToContinueRefining(msg: string): boolean {
  return (msg ?? "").trim().length >= 10 && CONTINUE_REFINING_PATTERN.test(msg.trim());
}

function looksLikeShortAgreement(msg: string): boolean {
  const t = (msg ?? "").trim();
  return t.length <= 80 && SHORT_AGREEMENT_PATTERN.test(t);
}

/** Infiere qué agentes deben aplicar la propuesta a partir del feedback del auditor. */
function inferAgentsFromAuditorFeedback(feedback: string): string[] {
  const agents: string[] = [];
  if (
    /\b(modelo\s+de\s+datos|sql|tablas?|fk|clave\s+externa|integridad\s+referencial|references|create\s+table|entidades?)\b/i.test(feedback)
  ) {
    agents.push("software_architect");
  }
  if (STACK_SECTION2_REGEX.test(feedback)) {
    if (!agents.includes("software_architect")) agents.push("software_architect");
  }
  if (/\b(seguridad|auth|mfa|contraseñas?|tokens?|rbac)\b/i.test(feedback)) {
    agents.push("security");
  }
  if (/\b(infra|docker|kubernetes|despliegue|manifest|orquestación)\b/i.test(feedback)) {
    agents.push("integration");
  }
  if (agents.length === 0) agents.push("software_architect");
  return agents;
}

/** Indica si el mensaje ya describe tema/alcance del MDD (evitar preguntar "¿Sobre qué tema?"). */
const INITIAL_TOPIC_PATTERN =
  /(?:necesito|quiero|requiero|busco|dame|genera?|elabora?|crea?)\s+(?:el\s+)?mdd|mdd\s+de\s+un\s+sistema|sistema\s+(?:de\s+)?(?:auth|sso|login|mfa|totp|jwks|api)|autenticación|single\s*sign|mfa|totp|jwks|well-known|oauth|jwt/i;

function looksLikeInitialTopic(msg: string): boolean {
  const t = (msg ?? "").trim();
  return t.length >= 25 && (INITIAL_TOPIC_PATTERN.test(t) || /\b(sistema|plataforma|aplicación|api|backend|servicio)\b.*\b(con|que|para|maneje)\b/i.test(t));
}

const LOG = (msg: string, ...args: unknown[]) => console.log(`[MDD:Manager] ${msg}`, ...args);

function hasRealBenchmark(state: MDDStateType): boolean {
  const c = (state.dbgaContent ?? "").trim();
  return c.length > 0 && !/^\(sin\s+benchmark|sin\s+contexto/i.test(c);
}

function mddHasContent(state: MDDStateType): boolean {
  return (state.mddDraft?.trim()?.length ?? 0) > 100;
}

/**
 * Manager como Entrevistador de Estados (no pasapapeles).
 * Caso 1: Sin Bench ni MDD → no delegar; pregunta "¿Sobre qué tema o problema necesitas el MDD?"; al responder delega a agentes para v1; luego bucle refinamiento (preguntas del Clarifier).
 * Caso 2: MDD con contenido pero score < 85% → Manager asigna gaps a agentes; >= 85% cede al usuario.
 * Caso 3: Existe dbgaContent → delegar de inmediato a especialistas para v1; luego bucle refinamiento.
 * Done solo si Auditor >= 85% o usuario pide parar (umbral 85 = ceder intervención al usuario).
 * Si se pasa precisionCalculator, el % mostrado coincide con el semáforo (calculateLiveMetrics sobre mddDraft).
 */
export function createMddManagerNode(
  llm: BaseChatModel,
  graphMemory: GraphMemoryService,
  precisionCalculator?: LivePrecisionCalculator | null,
  toolDeps?: MddManagerToolDeps | null,
) {
  return async (state: MDDStateType): Promise<Partial<MDDStateType> | Command> => {
    const userMessage = (state.lastUserMessage ?? "").trim();
    const score = state.auditorScore ?? 0;
    const iteration = state.mddIteration ?? 0;
    LOG("entry lastUserMessage=%s mddDraftLen=%s auditorScore=%s", userMessage.slice(0, 80), (state.mddDraft ?? "").length, score);

    // Terminar solo sin mensaje nuevo (p. ej. vuelta del Executor). Con score alto el usuario
    // sigue pudiendo pedir cambios (Dokploy, stack, etc.); no cortar en END aquí.
    if (score >= QUALITY_THRESHOLD && !userMessage) {
      LOG("goto END (score >= 85, sin mensaje nuevo)");
      return new Command({ goto: END });
    }
    if (score < AUDITOR_RETRY_THRESHOLD) {
      LOG("score < 90% → segunda iteración con reporte de gaps");
    }
    if (USER_STOP_PATTERN.test(userMessage)) {
      LOG("goto END (usuario pidió detenerse)");
      return new Command({ goto: END });
    }
    if (iteration >= MAX_MDD_ITERATIONS) {
      LOG("goto END (máx. iteraciones=%s)", MAX_MDD_ITERATIONS);
      return new Command({ goto: END });
    }

    const pending = state.pendingPlanApproval;
    if (pending) {
      if (PLAN_APPROVAL_CONFIRM_PATTERN.test(userMessage)) {
        LOG("plan aprobado por usuario → Executor (paso a paso)");
        const accumulatedWithRequest = state.userInputAccumulated?.trim() ?? "";
        const dbgaWithRequest = state.dbgaContent?.trim() ?? "";
        const directive = state.planUserIntent ?? getLastSubstantiveUserMessage(state);
        const impact = state.impactSummary?.trim();
        let mergedDirective = directive?.trim() ?? "";
        if (impact && mergedDirective && !mergedDirective.includes(impact.slice(0, Math.min(80, impact.length)))) {
          mergedDirective = `${mergedDirective}\n\n---\n\n**Resumen de impacto (aprobado con el plan):**\n${impact}`;
        } else if (impact && !mergedDirective) {
          mergedDirective = `**Resumen de impacto (aprobado con el plan):**\n${impact}`;
        }
        const { mddPlan, delegateTarget, sectionsToRun, previousMddDraftForMerge } = pending;
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            requestQuestionsOnly: delegateTarget === "clarifier_only",
            lastStepFailed: undefined,
            mddPlan,
            delegateTarget,
            sectionsToRun,
            previousMddDraftForMerge,
            pendingPlanApproval: undefined,
            planUserIntent: undefined,
            impactSummary: undefined,
            executorControlled: true,
            mddPlanCurrentStep: undefined,
            architectCriticFeedback: undefined,
            architectCriticAttempts: undefined,
            ...(mergedDirective ? { acceptedProposalDirective: mergedDirective } : {}),
          },
          goto: "executor",
        });
      }
      LOG("plan no aprobado, usuario respondió; re-entrando Manager sin plan pendiente");
      return new Command({ update: { pendingPlanApproval: undefined }, goto: "manager" });
    }

    const hasBench = hasRealBenchmark(state);
    const hasDraft = mddHasContent(state);
    const hasAccumulated = !!(state.userInputAccumulated?.trim());

    // Vuelta del executor sin mensaje nuevo: no generar otro plan ni preguntar de nuevo; terminar para que el usuario vea "MDD generado".
    if (!userMessage.trim() && hasDraft) {
      LOG("vuelta del executor sin mensaje nuevo → END (evitar segundo plan/segunda ejecución)");
      return new Command({ goto: END });
    }

    const regenSection = parseRegenerateSectionNumber(userMessage);
    if (hasDraft && regenSection !== null) {
      const agents = expandSectionsToRun(agentsForMddSection(regenSection));
      if (agents.length > 0) {
        const planDirective =
          [getPlanDirective(state), `Regenerar §${regenSection} del MDD según la petición del usuario.`]
            .filter(Boolean)
            .join("\n\n") || userMessage;
        const sectionsToRun = agents;
        const mddPlan = buildMddPlan("sections", sectionsToRun, getUserBrief(state), planDirective);
        LOG("regenerar §%s solicitado → Executor sections=%s", regenSection, sectionsToRun.join(","));
        return new Command({
          update: {
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            delegateTarget: "sections",
            sectionsToRun,
            mddPlan,
            executorControlled: true,
            mddPlanCurrentStep: undefined,
            acceptedProposalDirective: planDirective,
            pendingPlanApproval: undefined,
            planUserIntent: undefined,
            impactSummary: undefined,
          },
          goto: "executor",
        });
      }
    }

    // Comando "reformatea el documento": si hay mddStructured, re-renderizar; si no, normalizar mddDraft (sin LLM) y terminar.
    if (REFORMAT_DOCUMENT_PATTERN.test(userMessage) && hasDraft) {
      try {
        let formatted: string;
        if (state.mddStructured && typeof state.mddStructured === "object" && Object.keys(state.mddStructured).some((k) => state.mddStructured![k as keyof typeof state.mddStructured] != null)) {
          const hydrated = hydrateStructuredFromDraft(state.mddStructured, state.mddDraft ?? "");
          formatted = mddStructuredToMarkdown(hydrated);
        } else {
          const draft = (state.mddDraft ?? "").trim();
          formatted = reconcileUiUxDesignIntent(
            finalizeMddDeliverable(
              normalizeMddFormat(
                ensureContratosSection(
                  replaceContextWhenOnlyMetadata(sanitizeContextKeyValueAndObject(sanitizeContextSection(draft))),
                ),
              ),
            ),
          );
        }
        logMddNodeOutput("Reformat", formatted);
        LOG("reformateo solicitado: documento actualizado, goto END");
        return new Command({
          update: { mddDraft: formatted, lastUserMessage: undefined },
          goto: END,
        });
      } catch (err) {
        LOG("reformateo error: %s", err instanceof Error ? err.message : String(err));
        return new Command({ goto: END });
      }
    }

    // Comando "regenerar diagrama ER desde el SQL": solo regenerar erDiagram de la sección 2 (sin LLM) y terminar.
    if (REGENERATE_ER_DIAGRAM_PATTERN.test(userMessage) && hasDraft) {
      const draft = (state.mddDraft ?? "").trim();
      try {
        const updated = regenerateErDiagramFromSql(draft);
        if (updated) {
          logMddNodeOutput("RegenerateER", updated);
          LOG("diagrama ER regenerado desde SQL, goto END");
          return new Command({
            update: { mddDraft: updated, lastUserMessage: undefined },
            goto: END,
          });
        }
        LOG("regenerar ER: sin CREATE TABLE en sección 2 o sin cambios");
        return new Command({ goto: END });
      } catch (err) {
        LOG("regenerar ER error: %s", err instanceof Error ? err.message : String(err));
        return new Command({ goto: END });
      }
    }

    if (hasDraft && userMessage && looksLikeFullMddRegenerateRequest(userMessage)) {
      const planDirective = [FULL_MDD_REGENERATE_DIRECTIVE, getPlanDirective(state)].filter(Boolean).join("\n\n");
      const clipped =
        planDirective.length > MDD_MAX_PLAN_DIRECTIVE_CHARS
          ? planDirective.slice(0, MDD_MAX_PLAN_DIRECTIVE_CHARS) + "…"
          : planDirective;
      const mddPlan = buildMddPlan("full_pipeline", undefined, getUserBrief(state), clipped);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), `Petición: ${userMessage}`].filter(Boolean).join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), `Petición: ${userMessage}`].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("regeneración completa MDD solicitada → plan_approval full_pipeline");
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            pendingPlanApproval: { mddPlan, delegateTarget: "full_pipeline", goto: "clarifier" },
            planUserIntent: clipped,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Caso 3: Basado en Benchmark (DBGA). Delegar de inmediato para generar v1; luego entra en bucle refinamiento.
    if (hasBench && !hasDraft) {
      LOG("Caso 3 (Benchmark): delegar a especialistas para v1");
      return new Command({
        update: {
          lastUserMessage: undefined,
          requestQuestionsOnly: false,
        },
        goto: "clarifier",
      });
    }

    // Caso 1: Inicio de proyecto (sin Bench ni MDD). Si el mensaje actual ya describe el tema → delegar; si no, preguntar tema.
    if (!hasBench && !hasDraft) {
      const messageIsTopic = userMessage && looksLikeInitialTopic(userMessage);
      if (messageIsTopic) {
        LOG("Caso 1 (Inicio): mensaje ya describe tema (len=%s) → delegar a Clarifier sin preguntar", userMessage.length);
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage].filter(Boolean).join("\n\n");
        return new Command({
          update: {
            userInputAccumulated: state.userInputAccumulated?.trim() || userMessage,
            dbgaContent: dbgaWithRequest || userMessage,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
          },
          goto: "clarifier",
        });
      }
      if (!hasAccumulated) {
        LOG("Caso 1 (Inicio): sin respuesta inicial → ask_initial_topic");
        return new Command({ goto: "ask_initial_topic" });
      }
      LOG("Caso 1: usuario ya respondió tema → delegar a Clarifier para v1");
      const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
      const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
      return new Command({
        update: {
          userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
          dbgaContent: dbgaWithRequest || state.dbgaContent,
          lastUserMessage: undefined,
          requestQuestionsOnly: false,
        },
        goto: "clarifier",
      });
    }

    // HITL 4.4: reanudación tras aprobación del plan. Usuario aprobó (ejecutar) o rechazó (modificar → Clarifier).
    if (state.pendingPlanApproval && state.lastUserMessage?.trim()) {
      const approved = PLAN_APPROVAL_CONFIRM_PATTERN.test(state.lastUserMessage.trim());
      const { mddPlan, delegateTarget, sectionsToRun, previousMddDraftForMerge } = state.pendingPlanApproval;
      const accumulatedWithRequest = approved
        ? state.userInputAccumulated?.trim() ?? ""
        : [state.userInputAccumulated?.trim(), state.lastUserMessage ? `Usuario: ${state.lastUserMessage}` : ""]
            .filter(Boolean)
            .join("\n\n---\n\n");
      const dbgaWithRequest = approved
        ? state.dbgaContent?.trim() ?? ""
        : [state.dbgaContent?.trim(), state.lastUserMessage ? `Usuario: ${state.lastUserMessage}` : ""]
            .filter(Boolean)
            .join("\n\n");
      if (approved) {
        LOG("plan aprobado por usuario → Executor (paso a paso)");
        const directive = state.planUserIntent ?? getLastSubstantiveUserMessage(state);
        return new Command({
          update: {
            pendingPlanApproval: undefined,
            planUserIntent: undefined,
            lastUserMessage: undefined,
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            mddPlan,
            delegateTarget,
            sectionsToRun,
            previousMddDraftForMerge,
            executorControlled: true,
            mddPlanCurrentStep: undefined,
            architectCriticFeedback: undefined,
            architectCriticAttempts: undefined,
            ...(directive ? { acceptedProposalDirective: directive } : {}),
          },
          goto: "executor",
        });
      }
      LOG("usuario pidió modificar plan → delegar a Clarifier");
      return new Command({
        update: {
          pendingPlanApproval: undefined,
          lastUserMessage: undefined,
          userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
          dbgaContent: dbgaWithRequest || state.dbgaContent,
          requestQuestionsOnly: false,
        },
        goto: "clarifier",
      });
    }

    // PRIMERO: si el Clarifier acaba de generar preguntas, mostrarlas e interrumpir (si no, volveríamos a pedir preguntas y bucle infinito).
    if (state.clarifierJustGeneratedQuestions === true && Array.isArray(state.managerQuestions) && state.managerQuestions.length > 0) {
      const questions = state.managerQuestions.slice(0, 1);
      // Resume: si lastUserMessage ya trae la respuesta del usuario (inyectada por Command.update al reanudar), usarla y delegar sin interrumpir de nuevo.
      const resumeAnswer =
        state.lastUserMessage?.trim() && state.lastUserMessage.trim().length >= 5
          ? state.lastUserMessage.trim()
          : null;
      if (resumeAnswer) {
        LOG("resume: respuesta del usuario presente (len=%s) → plan_approval y luego Executor", resumeAnswer.length);
        const round = (state.managerRound ?? 0) + 1;
        const newAccumulated = [state.userInputAccumulated?.trim(), resumeAnswer].filter(Boolean).join("\n\n---\n\n");
        const newDbgaContent = [state.dbgaContent?.trim(), `Respuesta del usuario (ronda ${round}):\n${resumeAnswer}`].filter(Boolean).join("\n\n");
        const planDirective = getPlanDirective(state);
        const mddPlan = buildMddPlan("full_pipeline", undefined, getUserBrief(state), planDirective);
        if (mddPlan.length > 0) {
          const impactSummary = await generateImpactAnalysis(llm, state, resumeAnswer);
          return new Command({
            update: {
              managerQuestions: undefined,
              managerRound: round,
              userInputAccumulated: newAccumulated,
              dbgaContent: newDbgaContent,
              clarifierJustGeneratedQuestions: false,
              lastUserMessage: undefined,
              requestQuestionsOnly: false,
              pendingPlanApproval: { mddPlan, delegateTarget: "full_pipeline", goto: "clarifier" },
              planUserIntent: planDirective,
              impactSummary,
            },
            goto: "plan_approval",
          });
        }
        return new Command({
          update: {
            managerQuestions: undefined,
            managerRound: round,
            userInputAccumulated: newAccumulated,
            dbgaContent: newDbgaContent,
            clarifierJustGeneratedQuestions: false,
            lastUserMessage: undefined,
          },
          goto: "clarifier",
        });
      }
      const precision =
        precisionCalculator && (state.mddDraft ?? "").trim()
          ? precisionCalculator.calculateLiveMetrics(state.mddDraft, {
            auditorGaps: state.auditorGaps ?? undefined,
            complexity: state.mddComplexity,
            projectId: state.projectId,
            stageId: state.activeStageId ?? null,
          }).precision
          : (state.auditorScore ?? 0);
      const directiveReply =
        "Estamos al " +
        precision +
        "%. Para avanzar al 85%, necesito que definamos los siguientes puntos.\n\n" +
        questions.join("\n\n");
      LOG("interrupt questions (Clarifier) count=%s con mensaje directivo", questions.length);
      const userAnswer = interrupt({ type: "questions", questions, reply: directiveReply });
      const answerText = typeof userAnswer === "string" ? userAnswer : String(userAnswer ?? "").trim();
      const round = (state.managerRound ?? 0) + 1;
      const newAccumulated = [state.userInputAccumulated?.trim(), answerText].filter(Boolean).join("\n\n---\n\n");
      const newDbgaContent = [state.dbgaContent?.trim(), `Respuesta del usuario (ronda ${round}):\n${answerText}`].filter(Boolean).join("\n\n");
      return new Command({
        update: {
          managerQuestions: undefined,
          managerRound: round,
          userInputAccumulated: newAccumulated,
          dbgaContent: newDbgaContent,
          clarifierJustGeneratedQuestions: false,
          lastUserMessage: undefined,
          requestQuestionsOnly: false,
        },
        goto: "clarifier",
      });
    }

    // Patrón Planner–Executor: toda delegación pasa por plan → plan_approval → executor. Sin atajos.

    // Usuario pide seguir refinando → plan (full_pipeline) y aprobación.
    if (hasDraft && score < QUALITY_THRESHOLD && userMessage && wantsToContinueRefining(userMessage)) {
      const planDirective = getPlanDirective(state);
      const mddPlan = buildMddPlan("full_pipeline", undefined, getUserBrief(state), planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("Seguir refinando → plan_approval mddPlanLen=%s", mddPlan.length);
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            pendingPlanApproval: { mddPlan, delegateTarget: "full_pipeline", goto: "clarifier" },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Usuario responde con acuerdo breve al feedback del auditor → plan (sections) y aprobación.
    if (hasDraft && score < QUALITY_THRESHOLD && userMessage && looksLikeShortAgreement(userMessage) && state.auditorFeedback?.trim()) {
      const directive = state.auditorFeedback.trim();
      const sectionsToRun = expandSectionsToRun(inferAgentsFromAuditorFeedback(directive));
      const planDirective = getPlanDirective(state);
      const mddPlan = buildMddPlan("sections", sectionsToRun, getUserBrief(state), planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Usuario: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Usuario: ${userMessage}` : ""].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, directive);
        LOG("Acuerdo breve → plan_approval sections=%s", sectionsToRun.join(", "));
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            delegateTarget: "sections",
            sectionsToRun,
            acceptedProposalDirective: directive,
            pendingPlanApproval: { mddPlan, delegateTarget: "sections", sectionsToRun, goto: sectionsToRun[0] },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Refinamiento obligatorio: score < 85% y sin mensaje → plan clarifier + merge_section1_only (Manager asigna gaps a agentes).
    if (hasDraft && score < QUALITY_THRESHOLD && !userMessage) {
      const mddPlan = buildMddPlan("clarifier_only", undefined, getUserBrief(state), getPlanDirective(state));
      if (mddPlan.length > 0) {
        const impactSummary = state.auditorFeedback ? await generateImpactAnalysis(llm, state, state.auditorFeedback) : "";
        LOG("Refinamiento (preguntas) → plan_approval plan=[clarifier, merge_section1_only]");
        return new Command({
          update: {
            requestQuestionsOnly: true,
            delegateTarget: "clarifier_only",
            previousMddDraftForMerge: state.mddDraft ?? "",
            pendingPlanApproval: {
              mddPlan,
              delegateTarget: "clarifier_only",
              previousMddDraftForMerge: state.mddDraft ?? "",
              goto: "clarifier",
            },
            planUserIntent: getPlanDirective(state),
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
      const fallbackPlan: MddPlanStep[] = [
        stepWithTools("clarifier", "1", NODE_TASK_DESCRIPTIONS.clarifier),
        { step_id: "2", node: "merge_section1_only", task_description: NODE_TASK_DESCRIPTIONS.merge_section1_only },
      ];
      LOG("Refinamiento (preguntas) fallback → plan_approval plan=[clarifier, merge_section1_only]");
      return new Command({
        update: {
          requestQuestionsOnly: true,
          delegateTarget: "clarifier_only",
          previousMddDraftForMerge: state.mddDraft ?? "",
          pendingPlanApproval: {
            mddPlan: fallbackPlan,
            delegateTarget: "clarifier_only",
            previousMddDraftForMerge: state.mddDraft ?? "",
            goto: "clarifier",
          },
          planUserIntent: getPlanDirective(state),
          impactSummary: "Análisis de impacto: refinamiento de contexto y alcance (Sección 1).",
        },
        goto: "plan_approval",
      });
    }

    // Usuario pregunta qué falta para llegar al 85% → responder con auditorFeedback si existe (no mensaje genérico).
    const askingWhatNeededFor85 =
      userMessage &&
      ASK_WHAT_NEEDED_FOR_85_PATTERN.test(userMessage.trim()) &&
      hasDraft &&
      score < QUALITY_THRESHOLD;
    if (askingWhatNeededFor85 && state.auditorFeedback?.trim()) {
      const precision =
        precisionCalculator && (state.mddDraft ?? "").trim()
          ? precisionCalculator.calculateLiveMetrics(state.mddDraft, {
            auditorGaps: state.auditorGaps ?? undefined,
            complexity: state.mddComplexity,
            projectId: state.projectId,
            stageId: state.activeStageId ?? null,
          }).precision
          : score;
      const replyContent =
        "Estamos al " +
        precision +
        "%. Para avanzar al 85%, necesitamos:\n\n" +
        state.auditorFeedback.trim() +
        "\n\n¿Quieres que avancemos con estos puntos? Responde validando o indicando cambios concretos.";
      LOG("interrupt reply (qué falta para 85%, con auditorFeedback)");
      const resumeValue = interrupt({ type: "reply", reply: replyContent });
      const newMsg = typeof resumeValue === "string" ? resumeValue : String(resumeValue ?? "").trim();
      return new Command({
        update: { lastUserMessage: newMsg },
        goto: "manager",
      });
    }

    // "Audita el documento" → plan [auditor] y aprobación (patrón exclusivo).
    const trimmedMsg = userMessage?.trim() ?? "";
    if (hasDraft && trimmedMsg && AUDIT_DOCUMENT_PATTERN.test(trimmedMsg) && trimmedMsg.length <= 120) {
      const mddPlan: MddPlanStep[] = [
        stepWithTools("auditor", "1", NODE_TASK_DESCRIPTIONS.auditor),
      ];
      LOG("usuario pidió auditar → plan_approval (1 paso: auditor)");
      const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
      return new Command({
        update: {
          lastUserMessage: undefined,
          pendingPlanApproval: { mddPlan, delegateTarget: "sections", sectionsToRun: ["auditor"], goto: "auditor" },
          planUserIntent: getPlanDirective(state),
          impactSummary,
        },
        goto: "plan_approval",
      });
    }

    // "Solo contexto y alcance" → plan clarifier_only y aprobación.
    if (hasDraft && userMessage && looksLikeContextScopeOnlyRequest(userMessage)) {
      const planDirective = getPlanDirective(state);
      const mddPlan = buildMddPlan("clarifier_only", undefined, getUserBrief(state), planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("solo contexto y alcance → plan_approval mddPlanLen=%s", mddPlan.length);
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            delegateTarget: "clarifier_only",
            previousMddDraftForMerge: state.mddDraft ?? "",
            pendingPlanApproval: { mddPlan, delegateTarget: "clarifier_only", previousMddDraftForMerge: state.mddDraft ?? "", goto: "clarifier" },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Sin fallbacks: mensajes de corrección/cambios pasan al LLM → plan → plan_approval → executor.

    // Cambio explícito (p. ej. «no Kubernetes, usar Dokploy»): plan + impacto aunque el mensaje sea corto.
    if (hasDraft && userMessage && looksLikeExplicitMddModificationRequest(userMessage)) {
      const planDirective = getPlanDirective(state);
      const minimalPlan = { tail: "minimal" as const };
      let sectionsToRun = expandSectionsToRun(inferSectionsFromMessage(userMessage), minimalPlan);
      if (sectionsToRun.length === 0) {
        sectionsToRun = expandSectionsToRun(["software_architect", "security", "integration"], minimalPlan);
      }
      let mddPlan = await generateMddPlanWithLLM(llm, state, "sections", sectionsToRun);
      if (!mddPlan.length) {
        mddPlan = buildMddPlan("sections", sectionsToRun, getUserBrief(state), planDirective);
      }
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), `Petición: ${userMessage}`]
          .filter(Boolean)
          .join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), `Petición: ${userMessage}`]
          .filter(Boolean)
          .join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG(
          "cambio explícito MDD (stack/infra) → plan_approval sections=%s",
          sectionsToRun.join(","),
        );
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            managerQuestions: undefined,
            requestQuestionsOnly: false,
            pendingPlanApproval: {
              mddPlan,
              delegateTarget: "sections",
              sectionsToRun,
              previousMddDraftForMerge: state.mddDraft ?? "",
              goto: sectionsToRun[0],
            },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Petición sustancial que describe qué hacer (modelo de datos, roles, API, seguridad, etc.) → generar plan solo con agentes involucrados y mostrar para aprobar.
    const substantialRequest =
      userMessage &&
      userMessage.trim().length >= 120 &&
      inferSectionsFromMessage(userMessage + " " + (state.userInputAccumulated ?? "")).length > 0;
    if (substantialRequest) {
      const stateForDirective: MDDStateType = {
        ...state,
        userInputAccumulated: [state.userInputAccumulated?.trim(), userMessage ? `Usuario: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n"),
      };
      const planDirective = getPlanDirective(stateForDirective);
      let sectionsToRun = expandSectionsToRun(
        inferSectionsFromMessage(userMessage + " " + (state.userInputAccumulated ?? "")),
      );
      if (sectionsToRun.length === 0) sectionsToRun = expandSectionsToRun(["software_architect"]);
      let mddPlan = await generateMddPlanWithLLM(llm, stateForDirective, "sections", sectionsToRun);
      if (!mddPlan.length) mddPlan = buildMddPlan("sections", sectionsToRun, undefined, planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = stateForDirective.userInputAccumulated ?? state.userInputAccumulated;
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("petición sustancial (len=%s) → plan sections=%s, goto plan_approval", userMessage!.trim().length, sectionsToRun.join(","));
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            managerQuestions: undefined,
            requestQuestionsOnly: false,
            pendingPlanApproval: { mddPlan, delegateTarget: "sections", sectionsToRun, goto: sectionsToRun[0] },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Usuario dice "ya trabaje" / "no tengo más" / "ejecuta" → plan con lo acumulado (solo agentes involucrados) y mostrar para aprobar.
    const workWithWhatWeHave =
      userMessage &&
      WORK_WITH_WHAT_WE_HAVE_PATTERN.test(userMessage.trim()) &&
      (hasAccumulated || hasDraft);
    if (workWithWhatWeHave) {
      const planDirective = getPlanDirective(state);
      const textForSections = (state.userInputAccumulated ?? "") + " " + (state.clarifiedScope ?? "");
      let sectionsToRun = expandSectionsToRun(inferSectionsFromMessage(textForSections));
      if (sectionsToRun.length === 0) sectionsToRun = expandSectionsToRun(["software_architect"]);
      let mddPlan = await generateMddPlanWithLLM(llm, state, "sections", sectionsToRun);
      if (!mddPlan.length) mddPlan = buildMddPlan("sections", sectionsToRun, getUserBrief(state), planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Usuario: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("usuario dijo 'ya trabaje' / ejecuta (len=%s) → plan sections=%s, goto plan_approval", userMessage!.trim().length, sectionsToRun.join(","));
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            lastUserMessage: undefined,
            requestQuestionsOnly: false,
            pendingPlanApproval: { mddPlan, delegateTarget: "sections", sectionsToRun, goto: sectionsToRun[0] },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Usuario acaba de responder a preguntas que hicimos (respuesta sustancial) → delegar para incorporar al documento, no volver a preguntar.
    const justAnsweredQuestions =
      hasDraft &&
      (state.managerQuestions?.length ?? 0) > 0 &&
      userMessage &&
      userMessage.trim().length >= 80;
    if (justAnsweredQuestions) {
      const planDirective = getPlanDirective(state);
      const mddPlan = buildMddPlan("full_pipeline", undefined, getUserBrief(state), planDirective);
      if (mddPlan.length > 0) {
        const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
        const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
        const impactSummary = await generateImpactAnalysis(llm, state, userMessage);
        LOG("usuario respondió con sustancia a nuestras preguntas (len=%s) → delegate (no más preguntas)", userMessage!.trim().length);
        return new Command({
          update: {
            userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
            dbgaContent: dbgaWithRequest || state.dbgaContent,
            lastUserMessage: undefined,
            managerQuestions: undefined,
            requestQuestionsOnly: false,
            clarifierJustGeneratedQuestions: false,
            pendingPlanApproval: { mddPlan, delegateTarget: "full_pipeline", goto: "clarifier" },
            planUserIntent: planDirective,
            impactSummary,
          },
          goto: "plan_approval",
        });
      }
    }

    // Respuesta conversacional o delegar según LLM. Usamos structured output cuando el modelo lo soporta
    // para que la API obligue a devolver JSON válido (action + reply/target/sections) y no caigamos en
    // "reply" por defecto cuando el parse falla (texto libre, markdown, etc.).
    const round = (state.managerRound ?? 0) + 1;
    const userBrief = getUserBrief(state);
    const context = [
      "**Contexto:**",
      userBrief ? `**Objetivo del usuario (resumen):** ${userBrief}\n` : "",
      hasBench ? `**Benchmark (DBGA):**\n${(state.dbgaContent ?? "").trim().slice(0, 4000)}${(state.dbgaContent ?? "").length > 4000 ? "…" : ""}` : "**Benchmark:** No hay. El usuario indicó tema; los agentes generan/refinan el MDD.",
      state.userInputAccumulated?.trim() ? `\n**Respuestas del usuario:**\n${state.userInputAccumulated.trim()}` : "",
      state.mddDraft?.trim() ? `\n**Borrador MDD (completo):**\n${state.mddDraft.slice(0, 12_000)}${state.mddDraft.length > 12_000 ? "\n\n...(truncado, las últimas secciones pueden estar omitidas)" : ""}` : "",
      state.auditorFeedback?.trim() ? `\n**Feedback del Auditor:**\n${state.auditorFeedback.trim()}` : "",
      state.episodicMemoryContext?.trim()
        ? `\n**Memoria episódica (evaluador / reflexión — no ignores si pide corregir contratos o código):**\n${state.episodicMemoryContext.trim().slice(0, 4000)}${(state.episodicMemoryContext?.length ?? 0) > 4000 ? "…" : ""}`
        : "",
      state.lastStepFailed
        ? `\n**Falló un paso anterior:** nodo "${state.lastStepFailed.node}": ${state.lastStepFailed.error}. El usuario reanudó para re-planificar. Decide si reintentar (delegate a ese nodo o pipeline), omitir o pedir aclaración (reply).`
        : "",
      userMessage
        ? `\n**Mensaje actual:**\n${userMessage}\n\n**Instrucción:** Clasifica en una de las intenciones del prompt.\n\n**REGLAS PARA PREGUNTAS:** Si el usuario pregunta "para qué", "por qué", "qué es", "cómo funciona", "dónde se usa" o cualquier pregunta factual sobre el contenido del MDD (tecnologías, tablas, endpoints, infraestructura), responde con "reply" — es una consulta informativa, NO un cambio. No trates preguntas como solicitudes de modificación.\n\n**REGLAS PARA CAMBIOS Y CORRECCIONES:**\n- Si el mensaje describe una **necesidad** (pantalla, tabla, endpoint, flujo, MFA, etc.) que afecta a uno o más agentes → target: "sections"\n- Si el mensaje hace una **corrección** sobre contenido que YA EXISTE en el Borrador MDD (ej. "cambia X por Y", "te faltó Z", "en la sección N.N usa W") → DELEGA a clarifier o sections. No respondas con reply. El usuario está corrigiendo el documento, no preguntando.\n- Si el usuario menciona una sección específica (ej. "sección 2.1" o "§2.1") → DELEGA inmediatamente. El usuario está señalando contenido existente que debe modificarse.\n- Si es solo aclaración → "reply"\n- Si es confirmar o información amplia → "delegate" (pipeline completo)\n- Si el usuario **acaba de responder** a preguntas que hiciste (mensaje con contenido concreto, no solo "sí"/"no") → **delega** para incorporar su respuesta al documento; no hagas otra pregunta de seguimiento.\n- Si el mensaje es corto y usa "lo", "eso", "elimínenlo" y en Respuestas del usuario o en el Borrador se mencionó algo concreto (ej. Kubernetes, una tecnología) → **delega** con esa directiva; no respondas pidiendo "qué especificar" o "qué eliminar".\n- Ante la duda, "reply".`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `${MANAGER_MDD_PROMPT}\n\n---\nRonda ${round}.\n\n${context}`;
    let messages: HumanMessage[] = [new HumanMessage(prompt)];
    let action: "reply" | "delegate" | "search_memory" = "reply";
    let replyContent = "¿En qué más puedo ayudarte con el MDD? Puedes pedir refinamientos o revisar el documento.";
    let delegateTarget: "clarifier_only" | "full_pipeline" | "sections" | undefined;
    let sectionsToRun: string[] | undefined;
    let memoryQuery: string | undefined;

    const useStructuredOutput =
      "withStructuredOutput" in llm && typeof (llm as { withStructuredOutput?: (schema: unknown, config?: unknown) => unknown }).withStructuredOutput === "function";

    // Loop interno para búsqueda de memoria (max 1 salto)
    for (let i = 0; i < 2; i++) {
      if (useStructuredOutput) {
        try {
          const runnable = (llm as { withStructuredOutput(schema: unknown, config?: unknown): { invoke(input: unknown): Promise<unknown> } }).withStructuredOutput(
            managerStructuredOutputSchema,
            { method: "function_calling", strict: true },
          );
          const parsed = (await runnable.invoke(messages)) as z.infer<typeof managerStructuredOutputSchema>;
          action = parsed.action;
          if (parsed.action === "reply" && parsed.reply?.trim()) replyContent = parsed.reply.trim();
          if (parsed.action === "delegate") {
            delegateTarget = parsed.target;
            if (parsed.target === "sections" && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
              sectionsToRun = expandSectionsToRun(parsed.sections);
            }
          }
          if (parsed.action === "search_memory") {
            memoryQuery = parsed.memorySearchQuery;
          }
        } catch (err) {
          LOG("structured output falló, fallback a invoke+parse: %s", err instanceof Error ? err.message : String(err));
          const response = await llm.invoke(messages);
          const text = typeof response.content === "string" ? response.content : "";
          if (text.trim()) {
            try {
              const parsed = parseJsonOrThrow(text, managerOutputSchema);
              action = parsed.action;
              if (parsed.action === "reply" && parsed.reply?.trim()) replyContent = parsed.reply.trim();
              if (parsed.action === "delegate" && "target" in parsed) {
                delegateTarget = parsed.target;
                if (parsed.target === "sections" && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
                  sectionsToRun = expandSectionsToRun(parsed.sections);
                }
              }
              if (parsed.action === "search_memory") {
                memoryQuery = parsed.memorySearchQuery;
              }
            } catch { /* keep defaults */ }
          }
        }
      } else {
        const response = await llm.invoke(messages);
        const text = typeof response.content === "string" ? response.content : "";
        if (text.trim()) {
          try {
            const parsed = parseJsonOrThrow(text, managerOutputSchema);
            action = parsed.action;
            if (parsed.action === "reply" && parsed.reply?.trim()) replyContent = parsed.reply.trim();
            if (parsed.action === "delegate" && "target" in parsed) {
              delegateTarget = parsed.target;
              if (parsed.target === "sections" && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
                sectionsToRun = expandSectionsToRun(parsed.sections);
              }
            }
            if (parsed.action === "search_memory") {
              memoryQuery = parsed.memorySearchQuery;
            }
          } catch { /* keep defaults */ }
        }
      }

      if (action === "search_memory" && memoryQuery && i < 2) {
        LOG("ejecutando búsqueda en memoria semántica: %s", memoryQuery);
        const [projects, decisions] = await Promise.all([
          graphMemory.searchSimilarProjects(memoryQuery),
          graphMemory.searchSimilarDecisions(memoryQuery)
        ]);

        let memoryContext = "";
        if (projects && projects.length > 0) {
          memoryContext += "### Proyectos Similares:\n" +
            projects.map((r: any) => `- Proyecto: ${r.title} (ID: ${r.id})\n  Tablas: ${r.tables.join(", ")}\n  Endpoints: ${r.endpoints.join(", ")}`).join("\n") + "\n\n";
        }
        if (decisions && decisions.length > 0) {
          memoryContext += "### Decisiones Arquitectónicas (ADRs) Relevantes:\n" +
            decisions.map((d: any) => `- **${d.title}** (Proyecto: ${d.projectTitle})\n  Contexto: ${d.context}\n  Consecuencia: ${d.consequence}`).join("\n") + "\n";
        }

        if (!memoryContext) memoryContext = "No se encontraron proyectos o decisiones previas similares.";

        if (toolDeps && state.projectId?.trim() && memoryQuery) {
          try {
            const tools = getAgenticRagToolset(
              graphMemory,
              toolDeps.projects,
              toolDeps.theforge,
              toolDeps.ai,
              state.projectId.trim(),
              {
                legacy: state.isLegacyProject === true,
                theforgeProjectId: state.theforgeProjectId?.trim() ?? null,
                activeStageId: state.activeStageId?.trim() ?? undefined,
              },
            );
            if (tools.length > 0) {
              const toolSummary = await runAgentToolsRound(llm, tools, memoryQuery);
              memoryContext += "\n\n### Herramientas Grafo SDD / TheForge (query_sdd_graph, patch, MCP):\n" + toolSummary;
            }
          } catch (err) {
            memoryContext += `\n\n(Error ejecutando herramientas agénticas: ${err instanceof Error ? err.message : String(err)})`;
          }
        }

        messages.push(new HumanMessage(`[Resultados de búsqueda en memoria semántica para "${memoryQuery}"]:\n${memoryContext}\n\nInstrucción: Usa esta información para decidir la mejor arquitectura o delegación.`));
        continue;
      }
      break;
    }

    LOG("action=%s delegateTarget=%s sectionsToRun=%s", action, delegateTarget, sectionsToRun?.length);

    if (
      action === "reply" &&
      userMessage &&
      hasDraft &&
      looksLikeExplicitMddModificationRequest(userMessage)
    ) {
      LOG("reply anulado: cambio explícito MDD → forzar delegate/sections");
      action = "delegate";
      delegateTarget = "sections";
      sectionsToRun = expandSectionsToRun(inferSectionsFromMessage(userMessage));
      if (sectionsToRun.length === 0) {
        sectionsToRun = expandSectionsToRun(["software_architect", "security", "integration"]);
      }
    }

    if (action === "reply") {
      LOG("interrupt reply");
      const resumeValue = interrupt({ type: "reply", reply: replyContent });
      const newMsg = typeof resumeValue === "string" ? resumeValue : String(resumeValue ?? "").trim();
      const accumulatedWithReply = [state.userInputAccumulated?.trim(), userMessage ? `Usuario: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
      return new Command({
        update: {
          lastUserMessage: newMsg,
          userInputAccumulated: accumulatedWithReply || state.userInputAccumulated,
        },
        goto: "manager",
      });
    }

    const accumulatedWithRequest = [state.userInputAccumulated?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n---\n\n");
    const dbgaWithRequest = [state.dbgaContent?.trim(), userMessage ? `Petición: ${userMessage}` : ""].filter(Boolean).join("\n\n");
    const baseUpdate = {
      userInputAccumulated: accumulatedWithRequest || state.userInputAccumulated,
      dbgaContent: dbgaWithRequest || state.dbgaContent,
      lastUserMessage: undefined,
      requestQuestionsOnly: false,
      lastStepFailed: undefined,
    };

    const planDirective = getPlanDirective(state);
    let mddPlan = await generateMddPlanWithLLM(llm, state, delegateTarget, sectionsToRun);
    if (!mddPlan.length) {
      LOG("plan generado por LLM vacío o inválido, usando buildMddPlan");
      mddPlan = buildMddPlan(delegateTarget, sectionsToRun, getUserBrief(state), planDirective);
    } else {
      LOG("plan generado por LLM steps=%s", mddPlan.length);
    }

    // HITL 4.4: delegar al nodo plan_approval para interrumpir y mostrar el plan al usuario.
    if (mddPlan.length > 0) {
      let gotoNode: string;
      let previousMddDraftForMerge: string | undefined;
      if (delegateTarget === "sections" && sectionsToRun?.length) {
        gotoNode = sectionsToRun[0];
      } else if (delegateTarget === "clarifier_only" && hasDraft) {
        gotoNode = "clarifier";
        previousMddDraftForMerge = state.mddDraft ?? "";
      } else {
        gotoNode = "clarifier";
      }
      LOG("delegar a plan_approval mddPlanLen=%s goto=%s", mddPlan.length, gotoNode);
      const impactSummary = await generateImpactAnalysis(llm, state, userMessage || planDirective || "Re-planificación");
      return new Command({
        update: {
          pendingPlanApproval: {
            mddPlan,
            delegateTarget: delegateTarget ?? "full_pipeline",
            sectionsToRun,
            previousMddDraftForMerge,
            goto: gotoNode,
          },
          planUserIntent: planDirective,
          impactSummary,
        },
        goto: "plan_approval",
      });
    }

    // Delegar solo a los agentes indicados (sections) sin pasar por Clarifier (sin plan aprobación).
    if (delegateTarget === "sections" && sectionsToRun?.length) {
      LOG("delegate -> sections first=%s mddPlanLen=%s", sectionsToRun[0], mddPlan.length);
      return new Command({
        update: {
          ...baseUpdate,
          delegateTarget: "sections",
          sectionsToRun,
          mddPlan,
        },
        goto: sectionsToRun[0],
      });
    }

    // Delegar solo contexto y alcance (Clarifier + merge sección 1).
    if (delegateTarget === "clarifier_only" && hasDraft) {
      LOG("delegate -> clarifier_only mddPlanLen=%s", mddPlan.length);
      return new Command({
        update: {
          ...baseUpdate,
          delegateTarget: "clarifier_only",
          previousMddDraftForMerge: state.mddDraft ?? "",
          mddPlan,
        },
        goto: "clarifier",
      });
    }

    // Pipeline completo: Clarifier → ... → Auditor → Manager.
    LOG("delegate -> clarifier (full pipeline) mddPlanLen=%s", mddPlan.length);
    return new Command({
      update: {
        ...baseUpdate,
        delegateTarget: undefined,
        sectionsToRun: undefined,
        mddPlan,
      },
      goto: "clarifier",
    });
  };
}
