import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LivePrecisionCalculator } from "../estimation/estimation.types.js";
import { AUDITOR_MDD_PROMPT } from "../prompts/load-prompts.js";
import { auditorGapsSchema, mddAuditorDecisionSchema, type MDDStateType } from "../state/index.js";
import { parseJsonOrThrow } from "../utils/parse-json.js";
import { validateMddStructure } from "../utils/mdd-sanitize.js";
import { getInternalDirectivesContext } from "../utils/mdd-mesh-topology.js";
import { z } from "zod";

/** >= 85: done (cede intervención al usuario). < 85: clarifier (Manager asigna gaps a agentes). */
const AUDIT_PASS_THRESHOLD = 85;

const auditorCriticalGapItemSchema = z.union([
  z.object({
    sections: z.array(z.string()).optional().default([]),
    issue: z.string().optional().default(""),
    fix: z.string().optional().default(""),
  }),
  z.string().transform((str) => ({
    sections: [] as string[],
    issue: str,
    fix: "Revisión manual requerida",
  })),
]).pipe(z.object({
  sections: z.array(z.string()),
  issue: z.string(),
  fix: z.string(),
}));

const auditorOutputSchema = z.object({
  auditorScore: z.number().min(0).max(100),
  auditorFeedback: z.string().optional().nullable(),
  auditorDecision: mddAuditorDecisionSchema,
  /** LLM a veces devuelve "completed"/"done"; lo normalizamos después del parse. */
  status: z.string().optional(),
  critical_gaps: z.array(auditorCriticalGapItemSchema).optional().default([]),
  syntax_errors: z.union([
    z.array(z.string()),
    z.array(z.any()).transform((arr) => arr.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))),
    z.string().transform((s) => [s]),
    z.record(z.any()).transform((obj) => [JSON.stringify(obj)]),
  ]).optional().default([]),
  infrastructure_ready: z.union([
    z.boolean(),
    z.string().transform((s) => s.toLowerCase() === "true" || s.toLowerCase() === "yes" || s.toLowerCase() === "sí" || s.toLowerCase() === "si"),
  ]).optional(),
});

const LOG = (msg: string, ...args: unknown[]) => console.log(`[MDD:Auditor] ${msg}`, ...args);
const MAX_TOOL_LOOPS = 3;

function buildToolsByName(tools: StructuredToolInterface[]): Record<string, StructuredToolInterface> {
  const byName: Record<string, StructuredToolInterface> = {};
  for (const t of tools) byName[t.name] = t;
  return byName;
}

/** Creates the MDD Auditor (quality) node. Optionally with tools and precisionCalculator (semáforo). 4.3: si state.currentStepAllowedTools está set, solo usa esas tools. */
export function createMddAuditorNode(
  llm: BaseChatModel,
  tools: StructuredToolInterface[] = [],
  precisionCalculator?: LivePrecisionCalculator | null,
) {
  return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
    const allowed = state.currentStepAllowedTools;
    const toolsToUse = allowed?.length ? tools.filter((t) => allowed.includes(t.name)) : tools;
    const toolsByName = buildToolsByName(toolsToUse);
    const llmWithTools = llm.bindTools && toolsToUse.length > 0 ? llm.bindTools(toolsToUse) : llm;

    LOG("entry mddDraftLen=%s tools=%s (allowed=%s)", (state.mddDraft ?? "").length, toolsToUse.length, allowed?.length ?? "all");
    try {
      const draft = (state.mddDraft ?? "").trim();
      let prompt = `${AUDITOR_MDD_PROMPT}\n\n---\n**Borrador completo del MDD:**\n${draft || "(vacío)"}\n\n${getInternalDirectivesContext(state, "auditor")}`;
      if (toolsToUse.length > 0) {
        prompt += "\n\n**Opcional:** Usa las tools de validación (validate_mdd_structure, validate_sql_syntax, validate_json_payloads) con el borrador anterior para obtener métricas objetivas. Usa esos resultados para rellenar auditorScore, auditorDecision, critical_gaps, syntax_errors e infrastructure_ready. Responde al final solo con el JSON de salida.";
      }
      const messages = [new HumanMessage(prompt)];

      let lastContent = "";
      let loopCount = 0;

      while (loopCount < MAX_TOOL_LOOPS) {
        const response = await llmWithTools.invoke(messages);
        const aiMsg = response as AIMessage;
        lastContent = typeof aiMsg.content === "string" ? aiMsg.content : "";

        const toolCalls = aiMsg.tool_calls ?? [];
        if (toolCalls.length === 0) break;

        const toolMessages: ToolMessage[] = [];
        for (const tc of toolCalls) {
          const tool = toolsByName[tc.name];
          const toolCallId = tc.id ?? `tc-${loopCount}-${tc.name}`;
          if (!tool) {
            toolMessages.push(new ToolMessage({ content: `Unknown tool: ${tc.name}`, tool_call_id: toolCallId, status: "error" }));
            continue;
          }
          const args = typeof tc.args === "object" && tc.args !== null ? tc.args as Record<string, unknown> : {};
          const result = await tool.invoke(args);
          const content = typeof result === "string" ? result : JSON.stringify(result);
          toolMessages.push(new ToolMessage({ content, tool_call_id: toolCallId }));
        }
        messages.push(aiMsg, ...toolMessages);
        loopCount++;
      }

      let text = lastContent.trim();
      if (!text) {
        // Sin respuesta final: usar validación determinística para score/feedback
        const validation = validateMddStructure(draft);
        let score = 80;
        if (!validation.section3HasPayloads) score -= 20;
        if (!validation.hasTechnicalMetadata) score -= 5;
        if (validation.missingSections.length > 0) {
          score = Math.min(score, 94);
          score -= validation.missingSections.length * 5;
        }
        score = Math.max(0, Math.min(100, score));
        const decision =
          score >= AUDIT_PASS_THRESHOLD && validation.missingSections.length === 0 ? "done" as const : "clarifier" as const;
        const iteration = (state.mddIteration ?? 0) + (decision === "clarifier" ? 1 : 0);
        const feedback =
          validation.issues.length > 0
            ? validation.issues.join(" ")
            : "Faltan: modelo de datos/entidades, contratos con payloads, decisiones de seguridad, estrategia de infraestructura.";
        LOG("sin respuesta LLM, usando validación determinística score=%s", score);
        return {
          auditorScore: score,
          auditorFeedback: feedback,
          auditorDecision: decision,
          mddIteration: iteration,
          delegateTarget: undefined,
          sectionsToRun: undefined,
          acceptedProposalDirective: undefined,
        };
      }

      const parsed = parseJsonOrThrow(text, auditorOutputSchema);
      let score = Math.min(100, Math.max(0, parsed.auditorScore));
      const validation = validateMddStructure(draft);

      // Estructura 7 secciones obligatoria: si faltan secciones, MDD no es válido (score capado).
      if (validation.missingSections.length > 0) {
        score = Math.min(score, 94);
        const sectionsNote = "Secciones obligatorias faltantes: " + validation.missingSections.join(", ") + ". El MDD debe tener exactamente las 7 secciones canónicas.";
        const existing = (parsed.auditorFeedback ?? "").trim();
        parsed.auditorFeedback = existing ? existing + " " + sectionsNote : sectionsNote;
        LOG("missingSections=%s → score capped at 94", validation.missingSections.join(";"));
      }

      if (tools.length > 0 && !validation.section3HasPayloads && score > 20) {
        score = Math.min(score, 79);
        if (!parsed.auditorFeedback?.includes("Contratos de API")) {
          parsed.auditorFeedback = (parsed.auditorFeedback ?? "").trim() + " Sección 3. Contratos de API: debe incluir endpoints con request/response en ```json.";
        }
      }

      const hasStructuredGaps =
        Array.isArray(parsed.critical_gaps) && parsed.critical_gaps.length > 0 ||
        Array.isArray(parsed.syntax_errors) && parsed.syntax_errors.length > 0 ||
        parsed.status != null ||
        typeof parsed.infrastructure_ready === "boolean";

      let auditorGaps: typeof state.auditorGaps = undefined;
      let feedback = (parsed.auditorFeedback ?? "").trim();

      const normalizedStatus =
        parsed.status === "APROBADO" || parsed.status === "RECHAZADO"
          ? parsed.status
          : (score >= AUDIT_PASS_THRESHOLD ? "APROBADO" : "RECHAZADO");

      if (hasStructuredGaps) {
        const criticalGaps = parsed.critical_gaps ?? [];
        const syntaxErrors = parsed.syntax_errors ?? [];
        const result = auditorGapsSchema.safeParse({
          score,
          status: normalizedStatus,
          critical_gaps: criticalGaps,
          syntax_errors: syntaxErrors,
          infrastructure_ready: parsed.infrastructure_ready ?? true,
        });
        if (result.success) {
          auditorGaps = result.data;
          if (!feedback && (criticalGaps.length > 0 || syntaxErrors.length > 0)) {
            const parts: string[] = [];
            for (const g of criticalGaps as unknown as { sections: string[], issue: string, fix: string }[]) {
              parts.push(`[${(g.sections ?? []).join(", ")}] ${g.issue} Corrección: ${g.fix}`);
            }
            for (const e of (syntaxErrors as string[])) parts.push(e);
            feedback = parts.join(" ");
          }
        }
      }

      if (!hasStructuredGaps && precisionCalculator && draft.length > 100) {
        const metrics = precisionCalculator.calculateLiveMetrics(draft);
        if (metrics.precision < AUDIT_PASS_THRESHOLD) {
          score = metrics.precision;
          const semaphoreNote =
            ` El semáforo de consistencia marca ${metrics.precision}%; se requieren correcciones para llegar al 85%.`;
          feedback = feedback ? feedback + semaphoreNote : semaphoreNote.trim();
          if (precisionCalculator.getGapsReport) {
            const gapMessages = precisionCalculator.getGapsReport(draft);
            if (gapMessages.length > 0) feedback += " Gaps detectados: " + gapMessages.join(" ");
          }
          LOG("semáforo (regex) precision=%s < 85 → score y feedback alineados", metrics.precision);
        }
      }

      const hasConflict = Array.isArray(parsed.critical_gaps) && parsed.critical_gaps.some(g => {
        const text = typeof g === "string" ? g : (g.issue || "");
        return text.includes("[CONFLICTO]");
      });

      const decision =
        hasConflict
          ? "blackboard" as const
          : score >= AUDIT_PASS_THRESHOLD && validation.missingSections.length === 0
            ? "done" as const
            : (parsed.auditorDecision === "clarifier" ? "clarifier" as const : "clarifier" as const);
      const iteration = (state.mddIteration ?? 0) + (decision === "clarifier" ? 1 : 0);
      const finalFeedback =
        feedback ||
        (score < AUDIT_PASS_THRESHOLD
          ? "Faltan: modelo de datos/entidades con tipos y relaciones, contratos u operaciones con entrada/salida, decisiones de seguridad, estrategia de infraestructura/despliegue. Genera preguntas para cubrir estos huecos."
          : undefined);
      LOG("ok score=%s decision=%s iteration=%s gaps=%s", score, decision, iteration, auditorGaps ? "estructurados" : "no");
      return {
        auditorScore: score,
        auditorFeedback: finalFeedback,
        auditorGaps: auditorGaps ?? undefined,
        auditorDecision: decision,
        mddIteration: iteration,
        delegateTarget: undefined,
        sectionsToRun: undefined,
        acceptedProposalDirective: undefined,
      };
    } catch (err) {
      LOG("error: %s", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
