import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { SECURITY_ARCHITECT_MDD_PROMPT } from "../prompts/load-prompts.js";
import type { MDDStateType } from "../state/index.js";
import { mddSeguridadItemSchema } from "../state/mdd-structured.schema.js";
import { mergeMddStructured } from "../utils/mdd-merge-structured.js";
import { getUserBrief } from "../utils/mdd-user-brief.js";
import {
  getMddDraftSummary,
  jsonSectionToMarkdown,
  logMddNodeOutput,
  unbulletAndJoinForJson,
} from "../utils/mdd-sanitize.js";
import { extractFirstJsonObject, parseJsonOrThrow } from "../utils/parse-json.js";
import { z } from "zod";

/** Schema de salida estructurada: solo seguridad (array de { title, content }). */
const securityStructuredSchema = z.object({
  seguridad: z.array(mddSeguridadItemSchema),
});

/** Acepta string u objeto legacy; normaliza a string. */
function sectionToStr(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const obj = x as Record<string, unknown>;
    const key = ["content", "text", "section", "securitySection"].find((k) => typeof obj[k] === "string");
    if (key) return String(obj[key]);
  }
  return typeof x === "object" ? JSON.stringify(x, null, 2) : String(x);
}

const legacySecurityOutputSchema = z.object({
  securitySection: z
    .union([z.string(), z.record(z.unknown()), z.array(z.unknown())])
    .transform(sectionToStr)
    .pipe(z.string()),
});

const LOG = (msg: string, ...args: unknown[]) => console.log(`[MDD:Security] ${msg}`, ...args);

/** Convierte markdown de sección Seguridad a un único ítem { title, content }. */
function markdownToSeguridadItem(md: string): z.infer<typeof mddSeguridadItemSchema> {
  const trimmed = md.replace(/^##\s*Seguridad\s*/i, "").trim();
  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const content: string[] = [];
  for (const line of lines) {
    if (line.startsWith("###")) content.push(line.replace(/^###\s*/, "").trim());
    else if (line.startsWith("- ")) content.push(line.slice(2).trim());
    else content.push(line);
  }
  if (content.length === 0) content.push(trimmed || "(Pendiente de definir.)");
  return mddSeguridadItemSchema.parse({ title: "Seguridad", content });
}

/** Parsea markdown con ### títulos y viñetas - en array de { title, content[] }. */
function markdownSeguridadToItems(md: string): z.infer<typeof mddSeguridadItemSchema>[] {
  const withoutH2 = md.replace(/^##\s*Seguridad\s*/i, "").trim();
  const blocks = withoutH2.split(/\n###\s+/);
  const items: z.infer<typeof mddSeguridadItemSchema>[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ?? "Seguridad";
    const content: string[] = [];
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.startsWith("- ")) content.push(line.slice(2).trim());
      else if (line) content.push(line);
    }
    items.push(mddSeguridadItemSchema.parse({ title, content: content.length ? content : [trimmed] }));
  }
  if (items.length === 0) items.push(mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] }));
  return items;
}

/** Creates the MDD Security Architect node. Outputs structured seguridad; merge into mddStructured and derive mddDraft. */
export function createMddSecurityNode(llm: BaseChatModel) {
  return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
    LOG("entry mddDraftLen=%s", (state.mddDraft ?? "").length);
    try {
      const brief = getUserBrief(state);
      const briefBlock = brief
        ? `**Objetivo del documento (lo que el usuario pide):** ${brief}\n\n**Tu tarea:** Elaborar la sección 6. Seguridad para una aplicación que cumple este objetivo.\n\n---\n\n`
        : "";
      const contextParts = [
        briefBlock,
        "**Alcance clarificado:**",
        state.clarifiedScope || "(vacío)",
        "",
        "**Borrador actual del MDD:**",
        state.mddDraft || "(vacío)",
      ];
      if (state.acceptedProposalDirective?.trim()) {
        const directive = state.acceptedProposalDirective.trim();
        const affectsSection6 = /\b(seguridad|mfa|totp|autenticaci[oó]n|rbac|roles?|permisos?|hash|jwt|oauth|sso)\b/i.test(directive);
        const priorityBlock = affectsSection6
          ? ["**Prioridad (léelo primero):** La ACCIÓN REQUERIDA siguiente tiene prioridad máxima. Aplícala en ## 6. Seguridad.", ""]
          : [];
        contextParts.unshift(
          ...priorityBlock,
          "**ACCIÓN REQUERIDA (usuario aceptó esta propuesta):**",
          directive,
          "Debes aplicar esta directiva en ## 6. Seguridad.",
          "",
        );
      }
      if (state.auditorFeedback?.trim()) {
        contextParts.push(
          "",
          "**Feedback del Auditor (relevante para Seguridad – aplicar en esta sección):**",
          state.auditorFeedback.trim(),
          "",
          "Aplica las correcciones que afecten a Seguridad: decisiones respaldadas por el modelo de datos, campos de auditoría, almacén de credenciales, etc.",
        );
      }
      const context = contextParts.filter(Boolean).join("\n");
      const prompt = `${SECURITY_ARCHITECT_MDD_PROMPT}\n\n---\n${context}`;
      const response = await llm.invoke([new HumanMessage(prompt)]);
      const text = typeof response.content === "string" ? response.content : "";
      if (!text.trim()) {
        LOG("LLM vacío, usando fallback");
        const slice = { seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })] };
        const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
        logMddNodeOutput("Security", state.mddDraft ?? "");
        return { mddStructured: merged };
      }
      const jsonStr = extractFirstJsonObject(text) ?? text.trim();

      let slice: { seguridad: z.infer<typeof mddSeguridadItemSchema>[] };
      try {
        const parsed = parseJsonOrThrow(jsonStr, securityStructuredSchema);
        slice = { seguridad: parsed.seguridad };
      } catch {
        LOG("parse estructurado falló, fallback desde markdown");
        let section = "";
        try {
          const legacy = parseJsonOrThrow(text, legacySecurityOutputSchema);
          section = String(legacy.securitySection ?? "").trim();
        } catch {
          section = text.replace(/^```(?:markdown)?\s*|\s*```$/g, "").trim();
        }
        if (!section) {
          section = "## Seguridad\n\n(Pendiente de definir.)";
        } else if (!section.startsWith("##")) {
          section = "## Seguridad\n\n" + section;
        }
        const trimmedSection = section.trim();
        const looksLikeJson =
          trimmedSection.startsWith("{") ||
          (trimmedSection.includes('"6. Seguridad"') || trimmedSection.includes('"6.1'));
        if (looksLikeJson) {
          const jsonCandidate = trimmedSection.startsWith("{")
            ? trimmedSection
            : unbulletAndJoinForJson(trimmedSection);
          const markdown = jsonSectionToMarkdown(jsonCandidate, "Seguridad");
          if (markdown !== jsonCandidate) {
            slice = { seguridad: markdownSeguridadToItems(markdown) };
          } else {
            const item = markdownToSeguridadItem(section);
            slice = { seguridad: [item] };
          }
        } else {
          const item = markdownToSeguridadItem(section);
          slice = { seguridad: [item] };
        }
      }

      const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
      const sum = getMddDraftSummary(state.mddDraft ?? "");
      LOG("ok seguridad §6 actualizada en mddStructured mddDraftLen=%s section2=%s", sum.length, sum.section2);
      logMddNodeOutput("Security", state.mddDraft ?? "");
      return { mddStructured: merged };
    } catch (err) {
      LOG("error: %s", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
