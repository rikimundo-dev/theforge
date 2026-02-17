import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { INTEGRATION_ENGINEER_MDD_PROMPT } from "../prompts/load-prompts.js";
import type { MDDStateType } from "../state/index.js";
import {
  mddIntegracionSubsectionSchema,
  mddIntegracionWithManifestSchema,
} from "../state/mdd-structured.schema.js";
import { mergeMddStructured } from "../utils/mdd-merge-structured.js";
import { getUserBrief } from "../utils/mdd-user-brief.js";
import {
  buildNewFormatManifestFromIdentifiedTerms,
  extractIdentifiedInfraFromText,
  fixIntegrationSectionBullets,
  getMddDraftSummary,
  integracionToSection7Markdown,
  jsonSectionToMarkdown,
  logMddNodeOutput,
  replaceSection6Or7InDraft,
  sanitizeManifestToMatchIdentifiedInfra,
  stripInstructionAndFeedbackBlocks,
  stripNotaPendienteHeadingInIntegrationSection,
} from "../utils/mdd-sanitize.js";
import { extractFirstJsonObject, parseJsonOrThrow } from "../utils/parse-json.js";
import { getInternalDirectivesContext, extractInternalDirectives } from "../utils/mdd-mesh-topology.js";
import { z } from "zod";

/** Schema de salida estructurada: integracion con subsections y manifest opcional. */
const integrationStructuredSchema = z.object({
  integracion: mddIntegracionWithManifestSchema,
});

/** Acepta string u objeto legacy; normaliza a string. */
function sectionToStr(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const obj = x as Record<string, unknown>;
    const key = ["content", "text", "section", "integrationSection"].find(
      (k) => typeof obj[k] === "string",
    );
    if (key) return String(obj[key]);
  }
  return typeof x === "object" ? JSON.stringify(x, null, 2) : String(x);
}

const legacyIntegrationOutputSchema = z.object({
  integrationSection: z
    .union([z.string(), z.record(z.unknown()), z.array(z.unknown())])
    .transform(sectionToStr)
    .pipe(z.string()),
});

const LOG = (msg: string, ...args: unknown[]) => console.log(`[MDD:Integration] ${msg}`, ...args);

/** Detecta si el usuario describió un flujo de integración concreto. */
function hasUserDescribedIntegrationFlow(state: MDDStateType): boolean {
  const scope = (state.clarifiedScope ?? "").trim();
  const accumulated = (state.userInputAccumulated ?? "").trim();
  const text = `${scope} ${accumulated}`.toLowerCase();
  return (
    (/flujo\s+de\s+integraci[oó]n|definir(?:te)?\s+el\s+flujo|cuando el usuario entre/i.test(text) &&
      (/redirecci[oó]n|login\s+personalizado|logo.*slogan|token|mfa|validar.*token|rol.*aplicaci[oó]n/i.test(text) ||
        /redirig|pantalla de login|obtenga el rol/i.test(text)))
  );
}

/** Último bloque de userInputAccumulated (tras el último "---") o todo si es corto. */
function getLastUserInputBlock(accumulated: string, maxLen = 2000): string {
  const t = (accumulated ?? "").trim();
  if (!t) return "";
  const parts = t.split(/\n\n---\n\n/);
  const last = parts[parts.length - 1]?.trim() ?? t;
  return last.length > maxLen ? last.slice(0, maxLen) + "\n...(truncado)" : last;
}

/** Extrae del documento qué infra está identificada. */
function getIdentifiedInfraFromState(state: MDDStateType): string[] {
  const scope = (state.clarifiedScope ?? "").trim();
  const draft = (state.mddDraft ?? "").trim();
  const accumulated = (state.userInputAccumulated ?? "").trim();
  return extractIdentifiedInfraFromText(`${scope} ${draft} ${accumulated}`);
}

/** Extrae bloque ```json ... ``` y parsea como manifest. */
function extractManifestFromMarkdown(section: string): Record<string, unknown> | undefined {
  const m = section.match(/```json\s*([\s\S]*?)```/i);
  if (!m?.[1]) return undefined;
  try {
    const obj = JSON.parse(m[1].trim()) as Record<string, unknown>;
    return typeof obj === "object" && obj !== null ? obj : undefined;
  } catch {
    return undefined;
  }
}

/** Fallback: desde markdown de sección Integración construye integracion (una subsección + manifest si hay). */
function markdownToIntegracion(
  sectionMarkdown: string,
  identifiedInfra: string[],
): z.infer<typeof mddIntegracionWithManifestSchema> {
  let section = sectionMarkdown
    .replace(/^##\s*Integraci[oó]n\s*/i, "")
    .trim();
  section = stripInstructionAndFeedbackBlocks(section);
  section = fixIntegrationSectionBullets(section);
  if (identifiedInfra.length > 0) {
    const fullSection = "## Integración\n\n" + section;
    section = sanitizeManifestToMatchIdentifiedInfra(fullSection, identifiedInfra).replace(
      /^##\s*Integraci[oó]n\s*\n*/i,
      "",
    ).trim();
  }
  section = stripNotaPendienteHeadingInIntegrationSection(section);
  let manifest: Record<string, unknown> | undefined = extractManifestFromMarkdown(section);
  const content = section.replace(/```json\s*[\s\S]*?```/i, "").trim() || "(Pendiente de definir.)";
  const subsection = mddIntegracionSubsectionSchema.parse({
    title: "Integración",
    content,
  });
  return mddIntegracionWithManifestSchema.parse({
    subsections: [subsection],
    manifest,
  });
}

/** Creates the MDD Integration Engineer node. Outputs structured integracion; merge into mddStructured and derive mddDraft. */
export function createMddIntegrationNode(llm: BaseChatModel) {
  return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
    LOG("entry mddDraftLen=%s", (state.mddDraft ?? "").length);
    try {
      const brief = getUserBrief(state);
      const briefBlock = brief
        ? `**Objetivo del documento (lo que el usuario pide):** ${brief}\n\n**Tu tarea:** Elaborar la sección 7. Infraestructura/Integración para una aplicación que cumple este objetivo.\n\n---\n\n`
        : "";
      const contextParts: string[] = briefBlock ? [briefBlock] : [];
      if (state.acceptedProposalDirective?.trim()) {
        const directive = state.acceptedProposalDirective.trim();
        const affectsSection7 = /\b(infraestructura|docker|ci\/cd|despliegue|variables?\s+de\s+entorno|manifest|\.env|integracion)\b/i.test(directive);
        const priorityBlock = affectsSection7
          ? ["**Prioridad (léelo primero):** La ACCIÓN REQUERIDA siguiente tiene prioridad máxima. Aplícala en ## 7. Infraestructura/Integración.", ""]
          : [];
        contextParts.unshift(
          ...priorityBlock,
          "**ACCIÓN REQUERIDA (usuario aceptó esta propuesta):**",
          directive,
          "Debes aplicar esta directiva en ## 7. Infraestructura/Integración.",
          "",
        );
      }
      const accumulated = (state.userInputAccumulated ?? "").trim();
      if (hasUserDescribedIntegrationFlow(state)) {
        const userFlowText = getLastUserInputBlock(accumulated);
        contextParts.push(
          "**Flujo de integración descrito por el usuario (documentar EXACTAMENTE en esta sección, con subsecciones ### y párrafos):**",
          userFlowText || "(ver respuestas del usuario en el borrador/contexto)",
          "",
          "Incluye una subsección que describa paso a paso: (1) app detecta que no hay token válido y redirige a endpoint de login, (2) pantalla de login personalizada con logo, nombre, slogan y background de la aplicación, (3) SSO valida usuario/contraseña, (4) si MFA activado → pantalla de código → si correcto continúa, (5) redirección a la aplicación con el token, (6) la aplicación valida el token en el SSO y obtiene el rol del usuario en esa aplicación.",
          "",
        );
      }
      const identifiedInfra = getIdentifiedInfraFromState(state);
      if (identifiedInfra.length > 0) {
        contextParts.push(
          `**Manifest de Infraestructura:** El documento ya identifica: ${identifiedInfra.join(", ")}. El manifest al final de la sección debe reflejar **únicamente** lo identificado.`,
          "",
        );
      } else {
        contextParts.push(
          "**Manifest de Infraestructura:** El documento **no especifica** stack. Debes escribir igual una sección **completa** con subsecciones (Flujo, Seguridad y validación, Resiliencia, Infraestructura). Al final incluye manifest con `\"stack\": []` y `\"pending\": \"Definir con el usuario: orquestación y despliegue\"`.",
          "",
        );
      }
      const scope = (state.clarifiedScope ?? "").trim();
      if (scope) {
        contextParts.push("**Alcance clarificado:**", scope, "");
      }
      contextParts.push(
        "**Borrador actual del MDD (usa las secciones 1–4 y Seguridad para derivar ## Integración):**",
        state.mddDraft || "(vacío)",
        getInternalDirectivesContext(state, "integration_engineer"),
      );
      if (state.auditorFeedback?.trim()) {
        contextParts.push(
          "",
          "**Feedback del Auditor (relevante para Integración/Manifest – aplicar):**",
          state.auditorFeedback.trim(),
        );
      }
      const context = contextParts.join("\n");
      const prompt = `${INTEGRATION_ENGINEER_MDD_PROMPT}\n\n---\n${context}`;
      const response = await llm.invoke([new HumanMessage(prompt)]);
      const text = typeof response.content === "string" ? response.content : "";
      if (!text.trim()) {
        LOG("LLM vacío, usando fallback");
        const slice = {
          integracion: mddIntegracionWithManifestSchema.parse({
            subsections: [
              mddIntegracionSubsectionSchema.parse({
                title: "Integración",
                content: "(Pendiente de definir.)",
              }),
            ],
            manifest: {
              project_id: "mdd-project",
              stack: { backend: {}, database: {}, security: {} },
              deployment: { orchestrator: "TBD", provider: "TBD", tooling: {}, resources: {} },
              integration_metadata: { api_prefix: "/api/v1", jwks_enabled: false, multi_tenant_support: false },
            },
          }),
        };
        const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
        const section7Md = integracionToSection7Markdown(slice.integracion);
        const mddDraft = replaceSection6Or7InDraft(state.mddDraft ?? "", 7, section7Md);
        logMddNodeOutput("Integration", mddDraft);
        return { mddStructured: merged, mddDraft };
      }
      const jsonStr = extractFirstJsonObject(text) ?? text.trim();

      let slice: { integracion: z.infer<typeof mddIntegracionWithManifestSchema> };
      try {
        const parsed = parseJsonOrThrow(jsonStr, integrationStructuredSchema);
        slice = { integracion: parsed.integracion };
      } catch {
        LOG("parse estructurado falló, fallback desde markdown");
        let section = "";
        try {
          const legacy = parseJsonOrThrow(text, legacyIntegrationOutputSchema);
          section = String(legacy.integrationSection ?? "").trim();
        } catch {
          section = text.replace(/^```(?:markdown)?\s*|\s*```$/g, "").trim();
        }
        const sec6Match = section.match(/\n##\s+6\.\s/m);
        if (sec6Match != null && sec6Match.index != null) {
          section = section.slice(0, sec6Match.index).trim();
        }
        if (section.startsWith("{") && section.includes('"')) {
          section = jsonSectionToMarkdown(section, "Integración");
        }
        const identifiedInfra = getIdentifiedInfraFromState(state);
        slice = {
          integracion: markdownToIntegracion(section || "## Integración\n\n(Pendiente de definir.)", identifiedInfra),
        };
        const man = slice.integracion.manifest as Record<string, unknown> | undefined;
        const isOldFormat = man && Array.isArray(man.stack);
        if (!slice.integracion.manifest || isOldFormat) {
          slice.integracion.manifest = buildNewFormatManifestFromIdentifiedTerms(identifiedInfra);
        }
      }

      const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
      const section7Md = integracionToSection7Markdown(slice.integracion);
      const mddDraft = replaceSection6Or7InDraft(state.mddDraft ?? "", 7, section7Md);
      const internalDirectives = extractInternalDirectives(text, "integration_engineer");
      const meshUpdate = internalDirectives.length > 0 ? { internalDirectives } : {};

      const sum = getMddDraftSummary(mddDraft);
      LOG("ok integracion §7 reemplazada mddDraftLen=%s section2=%s", sum.length, sum.section2);
      logMddNodeOutput("Integration", mddDraft);
      return { mddStructured: merged, mddDraft, ...meshUpdate };
    } catch (err) {
      LOG("error: %s", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
