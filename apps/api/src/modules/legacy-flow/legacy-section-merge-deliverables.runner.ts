/**
 * Entregables legacy por **ventanas de secciones MDD** (§1–§7), ensamblado + verificación.
 */

import type { Logger } from "@nestjs/common";
import type { DeliverableKind } from "@theforge/shared-types";
import type { AiService } from "../ai/ai.service.js";
import type { LegacyGenerateOptions } from "../ai/ai.service.js";
import { appendLegacyBaselineDetailPrompt } from "../ai/utils/legacy-baseline-detail.util.js";
import { BLUEPRINT_PROMPT } from "../ai/prompts/blueprint-prompt.js";
import { SPEC_PROMPT } from "../ai/prompts/spec-prompt.js";
import { ARCHITECTURE_PROMPT } from "../ai/prompts/architecture-prompt.js";
import { USE_CASES_PROMPT } from "../ai/prompts/use-cases-prompt.js";
import { API_CONTRACTS_PROMPT } from "../ai/prompts/api-contracts-prompt.js";
import { LOGIC_FLOWS_PROMPT } from "../ai/prompts/logic-flows-prompt.js";
import { INFRA_PROMPT } from "../ai/prompts/infra-prompt.js";
import { USER_STORIES_PROMPT } from "../ai/prompts/user-stories-prompt.js";
import { TASKS_PROMPT } from "../ai/prompts/tasks-prompt.js";
import { UX_UI_GUIDE_PROMPT } from "../ai/prompts/ux-ui-guide-prompt.js";
import {
  joinConstitutionSectionsForPrompt,
  sliceMddConstitutionSections,
  type ConstitutionSectionNum,
} from "./legacy-mdd-constitution-sections.util.js";
import type { LegacySectionMergeTrace } from "./legacy-section-merge.types.js";

const NO_MILITAR =
  "\n\n**Regla obligatoria:** En toda tu respuesta no uses nunca las palabras \"militar\", \"grado militar\" ni variantes; usa \"alta criticidad\", \"misión crítica\" o \"robustez industrial\" en su lugar.";

const LEGACY_NO_INVENTAR =
  "**Regla obligatoria (legacy):** No inventes nada. Apégate al MDD y al contexto TheForge si se proporciona; si algo no consta, no lo incluyas.";

function trimTheForgeBlock(tf: string): string {
  const max = parseInt(process.env.THEFORGE_CONTEXT_PREPEND_MAX_CHARS ?? "16000", 10);
  const cap = Number.isFinite(max) && max > 2000 ? max : 16000;
  return tf.trim().slice(0, cap);
}

function prependTheForge(prompt: string, opts?: LegacyGenerateOptions): string {
  const raw = opts?.theforgeContext?.trim();
  if (!raw) return prompt;
  const block = trimTheForgeBlock(raw);
  return (
    "**Contexto del codebase (TheForge) — priorizar antes del extracto MDD:**\n---\n" +
    block +
    "\n---\n\n" +
    LEGACY_NO_INVENTAR +
    "\n\n**Instrucción:** Usa TODO lo anterior al alinear el fragmento. A continuación, la ventana del MDD.\n\n" +
    prompt
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function interStepMs(): number {
  const raw = process.env.LEGACY_DELIVERABLES_INTER_STEP_DELAY_MS?.trim();
  if (raw === undefined || raw === "") return 5000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 180_000);
}

type ConformanceKind = "blueprint" | "api" | "logicFlows" | "infra";

interface KindCfg {
  groups: { id: string; sections: ConstitutionSectionNum[] }[];
  systemPrompt: string;
  activeTab: string;
  h1Pattern: RegExp;
  minChars: number;
  conformance?: ConformanceKind;
  /** Título H1 del documento ensamblado */
  assembledTitle: string;
  mergeIntro: string;
}

const KIND_CFG: Partial<Record<DeliverableKind, KindCfg>> = {
  blueprint: {
    groups: [
      { id: "contexto_stack", sections: [1, 2] },
      { id: "modelo_datos", sections: [3] },
      { id: "api_logica", sections: [4, 5] },
      { id: "seguridad_infra", sections: [6, 7] },
    ],
    systemPrompt: BLUEPRINT_PROMPT + NO_MILITAR,
    activeTab: "blueprint",
    h1Pattern: /^#\s*Blueprint\b/im,
    minChars: 800,
    conformance: "blueprint",
    assembledTitle: "# Blueprint",
    mergeIntro:
      "> **The Forge — section merge:** Blueprint ensamblado desde ventanas del MDD (§1–§7). Revisa coherencia entre bloques.\n\n",
  },
  spec: {
    groups: [
      { id: "alcance_contexto", sections: [1, 2, 3] },
      { id: "api_logica", sections: [4, 5] },
    ],
    systemPrompt: SPEC_PROMPT,
    activeTab: "spec",
    h1Pattern: /^#\s*(Spec|Especificación|Documento\s+Spec)\b/im,
    minChars: 600,
    assembledTitle: "# Spec (SDD: what/why)",
    mergeIntro:
      "> **The Forge — section merge:** Spec ensamblado por ventanas del MDD.\n\n",
  },
  architecture: {
    groups: [
      { id: "stack_modulos", sections: [2, 3] },
      { id: "api_flujos", sections: [4, 5] },
    ],
    systemPrompt: ARCHITECTURE_PROMPT + NO_MILITAR,
    activeTab: "architecture",
    h1Pattern: /^#\s*Arquitectura\b/im,
    minChars: 700,
    assembledTitle: "# Arquitectura del sistema",
    mergeIntro: "> **The Forge — section merge:** Arquitectura por ventanas MDD.\n\n",
  },
  use_cases: {
    groups: [
      { id: "dominio_flujos", sections: [4, 5] },
      { id: "contexto", sections: [1, 2] },
    ],
    systemPrompt: USE_CASES_PROMPT,
    activeTab: "use-cases",
    h1Pattern: /^#\s*Casos\s+de\s+uso\b/im,
    minChars: 600,
    assembledTitle: "# Casos de uso",
    mergeIntro: "> **The Forge — section merge:** Casos de uso por ventanas MDD (+ Spec si se inyecta).\n\n",
  },
  api_contracts: {
    groups: [{ id: "modelo_api_escenarios", sections: [3, 4, 5] }],
    systemPrompt: API_CONTRACTS_PROMPT + NO_MILITAR,
    activeTab: "api-contracts",
    h1Pattern: /^#\s*(Contratos?\s+de\s+API|API\s+Contracts)\b/im,
    minChars: 600,
    conformance: "api",
    assembledTitle: "# Contratos de API",
    mergeIntro:
      "> **The Forge — section merge:** Contratos API por §3–§5 (modelo, API, escenarios/evidencia) + Blueprint si se inyecta.\n\n",
  },
  logic_flows: {
    groups: [{ id: "logica", sections: [4, 5] }],
    systemPrompt: LOGIC_FLOWS_PROMPT + NO_MILITAR,
    activeTab: "logic-flows",
    h1Pattern: /^#\s*(Flujos|L[oó]gica)\b/im,
    minChars: 600,
    conformance: "logicFlows",
    assembledTitle: "# Flujos de lógica",
    mergeIntro: "> **The Forge — section merge:** Flujos por §4–§5.\n\n",
  },
  user_stories: {
    groups: [
      { id: "alcance", sections: [4, 5] },
      { id: "contexto", sections: [1, 2] },
    ],
    systemPrompt: USER_STORIES_PROMPT,
    activeTab: "user-stories",
    h1Pattern: /^#\s*Historias\s+de\s+usuario\b/im,
    minChars: 500,
    assembledTitle: "# Historias de Usuario",
    mergeIntro: "> **The Forge — section merge:** Historias por ventanas MDD + Spec/CU.\n\n",
  },
  tasks: {
    groups: [
      { id: "trabajo", sections: [5, 7] },
      { id: "contexto", sections: [1, 2] },
    ],
    systemPrompt: TASKS_PROMPT + NO_MILITAR,
    activeTab: "tasks",
    h1Pattern: /^#\s*Tasks?\b/im,
    minChars: 500,
    assembledTitle: "# Tasks",
    mergeIntro: "> **The Forge — section merge:** Tasks por ventanas MDD + Blueprint.\n\n",
  },
  infra: {
    groups: [
      { id: "seg_infra", sections: [6, 7] },
      { id: "stack", sections: [2] },
    ],
    systemPrompt: INFRA_PROMPT + NO_MILITAR,
    activeTab: "infra",
    h1Pattern: /^#\s*Infra(estructura)?\b/im,
    minChars: 600,
    conformance: "infra",
    assembledTitle: "# Infraestructura",
    mergeIntro: "> **The Forge — section merge:** Infra por §6–§7 (+ stack §2).\n\n",
  },
  ux_ui_guide: {
    groups: [
      { id: "producto_stack", sections: [1, 2, 3] },
      { id: "ux_flujos", sections: [4, 5, 6] },
    ],
    systemPrompt: UX_UI_GUIDE_PROMPT,
    activeTab: "ux-ui-guide",
    h1Pattern: /^#\s*Gu[ií]a\s+UX\b/im,
    minChars: 600,
    assembledTitle: "# Guía UX/UI",
    mergeIntro: "> **The Forge — section merge:** Guía UX por ventanas MDD (legacy).\n\n",
  },
};

function stripLeadingH1(md: string, pattern: RegExp): string {
  return md.replace(pattern, "").trim();
}

function mechanicalVerify(kind: DeliverableKind, doc: string, cfg: KindCfg): { ok: boolean; gaps: string[] } {
  const gaps: string[] = [];
  const t = doc.trim();
  if (t.length < cfg.minChars) gaps.push(`Documento demasiado corto (<${cfg.minChars} caracteres).`);
  if (!cfg.h1Pattern.test(t)) gaps.push("Falta encabezado principal reconocible (H1).");
  if (kind === "blueprint" && !/\b(Nest|React|repo|m[oó]dulo|servicio)\b/i.test(t) && t.length < 2000) {
    gaps.push("Blueprint posiblemente vacío de sustancia técnica.");
  }
  return { ok: gaps.length === 0, gaps };
}

export function legacyDeliverableKindSupportsSectionMerge(kind: DeliverableKind): boolean {
  return KIND_CFG[kind] != null;
}

export async function trySectionMergeDeliverable(
  ai: AiService,
  kind: DeliverableKind,
  mdd: string,
  legacyOpts: LegacyGenerateOptions | undefined,
  extra: { spec?: string; useCases?: string; blueprint?: string },
  run429: <T>(fn: () => Promise<T>, step: string) => Promise<T>,
  logger: Logger,
  opts: { attemptSectionMerge: boolean },
): Promise<{ content: string; trace: LegacySectionMergeTrace } | null> {
  if (!opts.attemptSectionMerge) return null;

  const cfg = KIND_CFG[kind];
  if (!cfg) return null;

  const slices = sliceMddConstitutionSections(mdd);
  const groupsOut: LegacySectionMergeTrace["groups"] = [];
  const bodies: string[] = [];

  let gi = 0;
  for (const g of cfg.groups) {
    if (gi++ > 0) {
      const gap = interStepMs();
      if (gap > 0) await sleepMs(gap);
    }
    const window = joinConstitutionSectionsForPrompt(slices, g.sections);
    if (!window.trim()) {
      groupsOut.push({ id: g.id, sections: g.sections, durationMs: 0, outChars: 0, ok: true });
      bodies.push(`### ${g.id}\n\n_(Sin texto en el MDD para estas secciones.)_\n`);
      continue;
    }

    let tail = "";
    if (kind === "use_cases" && extra.spec?.trim()) {
      tail += `\n\nSpec (contexto):\n---\n${extra.spec.trim().slice(0, 8000)}\n---`;
    }
    if (kind === "user_stories") {
      if (extra.spec?.trim()) tail += `\n\nSpec:\n---\n${extra.spec.trim().slice(0, 6000)}\n---`;
      if (extra.useCases?.trim()) tail += `\n\nCasos de uso:\n---\n${extra.useCases.trim().slice(0, 6000)}\n---`;
    }
    if (kind === "api_contracts" && extra.blueprint?.trim()) {
      tail += `\n\nBlueprint (esquema / estructura):\n---\n${extra.blueprint.trim().slice(0, 8000)}\n---`;
    }
    if (kind === "tasks" && extra.blueprint?.trim()) {
      tail += `\n\nBlueprint:\n---\n${extra.blueprint.trim().slice(0, 8000)}\n---`;
    }
    if (kind === "ux_ui_guide" && extra.blueprint?.trim()) {
      tail += `\n\nBlueprint:\n---\n${extra.blueprint.trim().slice(0, 4000)}\n---`;
    }
    if (kind === "infra" && extra.blueprint?.trim()) {
      tail += `\n\nBlueprint:\n---\n${extra.blueprint.trim().slice(0, 6000)}\n---`;
    }
    if (kind === "architecture" && extra.blueprint?.trim()) {
      tail += `\n\nBlueprint (referencia):\n---\n${extra.blueprint.trim().slice(0, 6000)}\n---`;
    }

    const userPrompt = prependTheForge(
      appendLegacyBaselineDetailPrompt(
        `**Modo ventana MDD (${g.id}):** Genera un **fragmento markdown** del entregable que cubra solo lo deducible de las secciones **§${g.sections.join(", §")}** del MDD.\n` +
          "No repitas un documento completo si el extracto es parcial. Usa subtítulos `###` bajo el bloque.\n" +
          "Si no aplica contenido, responde exactamente: `Sin contenido aplicable.`\n\n" +
          "**Extracto MDD:**\n---\n" +
          window +
          "\n---" +
          tail,
        legacyOpts?.legacyBaselineStage,
      ),
      legacyOpts,
    );

    const t0 = Date.now();
    try {
      const text = await run429(
        () =>
          ai.generateResponse(userPrompt, [], {
            systemPrompt: cfg.systemPrompt,
            activeTab: cfg.activeTab,
            ...(kind === "ux_ui_guide"
              ? { projectTypeForUxGuide: "LEGACY" as const }
              : {}),
          }),
        `section_merge_${kind}_${g.id}`,
      );
      const body = (text ?? "").trim();
      groupsOut.push({
        id: g.id,
        sections: g.sections,
        durationMs: Date.now() - t0,
        outChars: body.length,
        ok: body.length > 0,
      });
      bodies.push(`### Bloque ${g.id.replace(/_/g, " ")}\n\n${body}`);
    } catch (e) {
      groupsOut.push({
        id: g.id,
        sections: g.sections,
        durationMs: Date.now() - t0,
        outChars: 0,
        ok: false,
      });
      logger.warn(
        `[LegacyDeliverables] section_merge group failed kind=${kind} id=${g.id} — ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  let assembled =
    cfg.assembledTitle +
    "\n\n" +
    cfg.mergeIntro +
    bodies.map((b) => stripLeadingH1(b, cfg.h1Pattern)).join("\n\n---\n\n");

  if (/Sin contenido aplicable\.?/i.test(assembled)) {
    logger.warn(
      `[LegacyDeliverables] section_merge rejected kind=${kind}: empty block(s) in assembled output`,
    );
    return null;
  }

  let mech = mechanicalVerify(kind, assembled, cfg);
  let confOk: boolean | undefined;
  let gaps = [...mech.gaps];

  if (cfg.conformance) {
    const c = await run429(
      () => ai.conformanceCheck(mdd, assembled, cfg.conformance!),
      `section_merge_conformance_${kind}`,
    );
    confOk = c.ok;
    if (!c.ok) gaps.push(...c.gaps);
  }

  let repaired = false;
  if (gaps.length > 0) {
    const repairPrompt = prependTheForge(
      `Corrige el documento siguiente atendiendo **solo** los gaps listados. No amplíes alcance fuera del MDD.\n\n**Gaps:**\n${gaps.map((x) => `- ${x}`).join("\n")}\n\n**Documento:**\n---\n${assembled.slice(0, 16_000)}\n---`,
      legacyOpts,
    );
    try {
      assembled = await run429(
        () =>
          ai.generateResponse(repairPrompt, [], {
            systemPrompt: cfg.systemPrompt + "\n\n**Modo:** corrección mínima; salida markdown completa del documento.",
            activeTab: cfg.activeTab,
            ...(kind === "ux_ui_guide" ? { projectTypeForUxGuide: "LEGACY" as const } : {}),
          }),
        `section_merge_repair_${kind}`,
      );
      repaired = true;
      mech = mechanicalVerify(kind, assembled, cfg);
      gaps = [...mech.gaps];
      if (cfg.conformance) {
        const c2 = await run429(
          () => ai.conformanceCheck(mdd, assembled, cfg.conformance!),
          `section_merge_conformance2_${kind}`,
        );
        confOk = c2.ok;
        if (!c2.ok) gaps.push(...c2.gaps);
      }
    } catch {
      /* deja ensamblado previo */
    }
  }

  const trace: LegacySectionMergeTrace = {
    kind,
    groups: groupsOut,
    mechanicalOk: mech.ok,
    conformanceOk: confOk,
    gaps,
    repaired,
    finalChars: assembled.trim().length,
  };

  return { content: assembled.trim(), trace };
}
