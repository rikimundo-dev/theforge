import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { SECURITY_ARCHITECT_MDD_PROMPT } from "../prompts/load-prompts.js";
import type { MDDStateType } from "../state/index.js";
import { mddSeguridadItemSchema } from "../state/mdd-structured.schema.js";
import { mergeMddStructured } from "../utils/mdd-merge-structured.js";
import { getUserBrief } from "../utils/mdd-user-brief.js";
import {
  getMddDraftSummary,
  getSection6Or7Range,
  jsonSectionToMarkdown,
  logMddNodeOutput,
  normalizeMddFormat,
  replaceSection6Or7InDraft,
  seguridadItemsToSection6Markdown,
  unbulletAndJoinForJson,
} from "../utils/mdd-sanitize.js";
import { extractFirstJsonObject, parseJsonOrThrow } from "../utils/parse-json.js";
import { getInternalDirectivesContext, extractInternalDirectives } from "../utils/mdd-mesh-topology.js";
import { z } from "zod";

/** Schema estricto: array de { title, content: string[] }. */
const securityStructuredSchema = z.object({
  seguridad: z.array(mddSeguridadItemSchema),
});

/** Item permisivo: content puede ser string o string[] (el LLM a veces devuelve uno u otro). */
const securityItemPermissiveSchema = z
  .object({
    title: z.string().optional().default("Seguridad"),
    content: z.union([z.string(), z.array(z.string())]).transform((c) => (Array.isArray(c) ? c : c ? [String(c)] : [])),
  })
  .transform((o) => ({ title: String(o.title || "Seguridad").trim(), content: o.content }));

/** Schema permisivo para respuesta del LLM: acepta seguridad o security, content como string o array. */
const securityStructuredPermissiveSchema = z
  .object({
    seguridad: z.array(securityItemPermissiveSchema).optional(),
    security: z.array(securityItemPermissiveSchema).optional(),
  })
  .transform((o) => {
    const arr = o.seguridad ?? o.security ?? [];
    return { seguridad: arr };
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

const SNIP_LEN = 600;

function formatParseError(err: unknown): string {
  if (err instanceof z.ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return `Zod: ${issues}`;
  }
  if (err instanceof SyntaxError) return `Syntax: ${err.message}`;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function snip(s: string, max = SNIP_LEN): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "\n... (truncado " + (t.length - max) + " chars)";
}

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

/** Títulos típicos del manifest de §7; si los ítems de seguridad son estos, es contenido de §7, no §6. */
const MANIFEST_LIKE_TITLES = new Set(
  [
    "project_id", "stack", "backend", "framework", "version", "language", "orm", "container",
    "base_image", "exposed_port", "database", "engine", "extensions", "security", "protocol",
    "token_management", "mfa_strategy", "hashing_algorithm", "hashing_rounds", "deployment",
    "orchestrator", "provider", "tooling", "resources", "min_replicas", "max_replicas",
    "cpu_threshold", "integration_metadata", "api_prefix", "jwks_enabled", "multi_tenant_support",
  ].map((s) => s.toLowerCase()),
);

function looksLikeManifestContent(items: Array<{ title: string }>): boolean {
  if (!items.length) return false;
  const titles = items.map((t) => (t.title ?? "").trim().toLowerCase().replace(/^\d+\.\d*\s*/, ""));
  const matchCount = titles.filter((t) => MANIFEST_LIKE_TITLES.has(t)).length;
  return matchCount >= 2 || (titles.length >= 3 && matchCount >= 1 && MANIFEST_LIKE_TITLES.has(titles[0]!));
}

/** Parsea markdown con ### títulos y viñetas - en array de { title, content[] }. */
function markdownSeguridadToItems(md: string): z.infer<typeof mddSeguridadItemSchema>[] {
  const withoutH2 = md.replace(/^##\s*(6\.\s*)?Seguridad\s*\n?/i, "").trim();
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
        getInternalDirectivesContext(state, "security"),
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
        const range6 = getSection6Or7Range(state.mddDraft ?? "", 6);
        const currentBody =
          range6 != null
            ? (state.mddDraft ?? "").slice(range6.start + (range6.heading?.length ?? 0), range6.end).trim()
            : "";
        const looksEmpty =
          /^\s*(Vacía|Pendiente|Placeholder|\(Pendiente[^)]*\))\s*$/im.test(currentBody) || currentBody.length < 200;
        if (range6 != null && !looksEmpty && currentBody.length > 200) {
          LOG("seguridad §6 ya tiene contenido sustancial; conservando sin sobrescribir");
          return { mddStructured: state.mddStructured, mddDraft: state.mddDraft };
        }
        const slice = { seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })] };
        const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
        const section6Md = seguridadItemsToSection6Markdown(slice.seguridad);
        const mddDraft = replaceSection6Or7InDraft(state.mddDraft ?? "", 6, section6Md);
        logMddNodeOutput("Security", mddDraft);
        return { mddStructured: merged, mddDraft };
      }
      const jsonStr = extractFirstJsonObject(text) ?? text.trim();

      const placeholderSlice: { seguridad: z.infer<typeof mddSeguridadItemSchema>[] } = {
        seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })],
      };
      let slice = placeholderSlice;
      /** Cuando el LLM devuelve securitySection (markdown), usamos ese markdown directo para §6 sin round-trip items→md que pierde contenido. */
      let legacySection6Markdown: string | null = null;
      try {
        const parsed = parseJsonOrThrow(jsonStr, securityStructuredSchema);
        slice = { seguridad: parsed.seguridad };
      } catch (err) {
        LOG("parse estricto falló: %s", formatParseError(err));
        LOG("payload (extractFirstJsonObject): %s", snip(jsonStr));
        let recovered = false;
        try {
          const legacy = parseJsonOrThrow(jsonStr, legacySecurityOutputSchema);
          const sectionMd = String(legacy.securitySection ?? "").trim();
          if (sectionMd.length > 50) {
            const body = sectionMd.replace(/^##\s*(6\.\s*)?Seguridad\s*\n?/i, "").trim() || sectionMd;
            slice = { seguridad: markdownSeguridadToItems(body) };
            let md = sectionMd.trim();
            const sec7 = md.match(/\n##\s+7\.\s/m);
            if (sec7?.index != null) md = md.slice(0, sec7.index).trim();
            if (!/^##\s+(?:6\.\s+)?Seguridad\b/i.test(md)) md = "## 6. Seguridad\n\n" + md;
            else md = md.replace(/^##\s+Seguridad\b/i, "## 6. Seguridad");
            md = md.replace(/6\.\s*Seguridad\s*###/gi, "6. Seguridad\n\n###");
            legacySection6Markdown = md.replace(/\n*--\s*$/m, "").trim();
            recovered = true;
            LOG("parse legacy (securitySection) ok → %d ítems, usando markdown directo para §6", slice.seguridad.length);
          }
        } catch {
          /* ignorar, intentar permisivo */
        }
        if (!recovered) {
          try {
            type SecuritySlice = { seguridad: z.infer<typeof mddSeguridadItemSchema>[] };
            const permissive = parseJsonOrThrow(jsonStr, securityStructuredPermissiveSchema as z.ZodType<SecuritySlice>) as SecuritySlice;
            const normalized = permissive.seguridad.map((item) =>
              mddSeguridadItemSchema.parse({
                title: item.title,
                content: item.content.map((s) => (typeof s === "string" ? s : String(s))),
              }),
            );
            slice = { seguridad: normalized };
            recovered = true;
            LOG("parse estructurado vía schema permisivo (seguridad/security, content string|array)");
          } catch (permissiveErr) {
            LOG("parse permisivo también falló: %s", formatParseError(permissiveErr));
            LOG("respuesta LLM (inicio): %s", snip(text, 400));
            LOG("fallback desde markdown");
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
            section = section.replace(/\n*--\s*$/m, "").trim();
            // No tomar contenido de §7 (Infraestructura/manifest) como si fuera §6
            const sec7Match = section.match(/\n##\s+7\.\s/m);
            if (sec7Match != null && sec7Match.index != null) {
              section = section.slice(0, sec7Match.index).trim();
            }
            let trimmedSection = section.trim();
            const hasSeguridadJson =
              trimmedSection.includes('"## Seguridad"') ||
              trimmedSection.includes('"6. Seguridad"') ||
              trimmedSection.includes('"6.1"') ||
              trimmedSection.startsWith("{");
            if (hasSeguridadJson) {
              let normalized = trimmedSection
                .replace(/^##\s*(6\.\s*)?Seguridad\s*\{:?\s*\n?/i, "")
                .replace(/(\n\s*-\s*)+$/, "")
                .replace(/\n\s*---\s*$/, "")
                .trim();
              normalized = normalized
                .replace(/\n\s*-\s*}\s*\n\s*-\s*}\s*$/, "\n}\n}")
                .replace(/\n\s*-\s*}\s*$/, "\n}")
                .trim();
              const jsonCandidate = normalized.startsWith("{")
                ? normalized
                : unbulletAndJoinForJson(normalized);
              let markdown = jsonSectionToMarkdown(jsonCandidate, "Seguridad");
              if (markdown === jsonCandidate) {
                try {
                  const obj = JSON.parse(jsonCandidate) as Record<string, unknown>;
                  const inner = obj["## Seguridad"] ?? obj["6. Seguridad"];
                  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
                    markdown = jsonSectionToMarkdown(JSON.stringify(inner), "Seguridad");
                  }
                } catch {
                  /* keep markdown as jsonCandidate */
                }
              }
              if (markdown !== jsonCandidate) {
                slice = { seguridad: markdownSeguridadToItems(markdown) };
              } else {
                const item = markdownToSeguridadItem(section);
                slice = { seguridad: [item] };
              }
            } else {
              const body = section.replace(/^##\s*(6\.\s*)?Seguridad\s*\n?/i, "").trim() || section;
              slice = { seguridad: markdownSeguridadToItems(body) };
            }
          } // end catch permissiveErr
        } // end if (!recovered)
      }

      const merged = mergeMddStructured(state.mddStructured, slice, state.mddDraft ?? "");
      const range6 = getSection6Or7Range(state.mddDraft ?? "", 6);
      const currentBody =
        range6 != null
          ? (state.mddDraft ?? "").slice(range6.start + (range6.heading?.length ?? 0), range6.end).trim()
          : "";
      const looksLikePlaceholderOrEmpty =
        /^\s*(Vacía|Pendiente|Placeholder|\(Pendiente[^)]*\))\s*$/im.test(currentBody) ||
        currentBody.length < 200;
      const hadSubstantialSection6 =
        currentBody.length > 200 && !/^\s*\(Pendiente de definir\.?\)\s*$/im.test(currentBody) && !looksLikePlaceholderOrEmpty;
      const isManifestContent = looksLikeManifestContent(slice.seguridad);
      if (isManifestContent) {
        LOG("seguridad §6 parseó contenido tipo manifest (§7); no sobrescribiendo §6");
        if (range6 != null && hadSubstantialSection6) {
          return { mddStructured: merged, mddDraft: state.mddDraft };
        }
        slice = {
          seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })],
        };
      }
      let section6Md =
        legacySection6Markdown ?? seguridadItemsToSection6Markdown(slice.seguridad);
      section6Md = section6Md.replace(/\n##\s+7\.\s[\s\S]*$/i, "").trim();
      const isPlaceholder =
        section6Md.length < 280 && /\(Pendiente de definir\.?\)/i.test(section6Md);
      if (isPlaceholder && range6 != null && hadSubstantialSection6) {
        LOG("seguridad §6 fallback produjo solo placeholder; conservando contenido previo");
        return { mddStructured: merged, mddDraft: state.mddDraft };
      }
      let mddDraft = replaceSection6Or7InDraft(state.mddDraft ?? "", 6, section6Md);
      if (!/##\s+(?:6\.\s+)?Seguridad\b/i.test(mddDraft)) {
        const insertMd = section6Md.trim();
        const idx7 = mddDraft.search(/\n##\s+7\.\s*(?:Infraestructura|Integración)\b/i);
        if (idx7 >= 0) {
          mddDraft = (mddDraft.slice(0, idx7) + insertMd + "\n\n" + mddDraft.slice(idx7)).trim();
          LOG("§6 insertada antes de §7 (fallback por índice)");
        } else {
          const range7 = getSection6Or7Range(mddDraft, 7);
          if (range7 != null) {
            mddDraft = (mddDraft.slice(0, range7.start) + insertMd + "\n\n" + mddDraft.slice(range7.start)).trim();
          } else {
            mddDraft = (mddDraft + "\n\n" + insertMd).trim();
          }
        }
      }
      mddDraft = normalizeMddFormat(mddDraft);
      const internalDirectives = extractInternalDirectives(text, "security");
      const meshUpdate = internalDirectives.length > 0 ? { internalDirectives } : {};

      const sum = getMddDraftSummary(mddDraft);
      LOG("ok seguridad §6 reemplazada mddDraftLen=%s section2=%s", sum.length, sum.section2);
      logMddNodeOutput("Security", mddDraft);
      return { mddStructured: merged, mddDraft, ...meshUpdate };
    } catch (err) {
      LOG("error: %s", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
