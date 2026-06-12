import type { MDDStateType } from "../state/index.js";
import { mergeMddStructured } from "../utils/mdd-merge-structured.js";
import { injectProposedComponentDiagramIntoSection2 } from "../utils/mdd-component-diagram.util.js";
import {
  injectErDiagramBlockIntoDraft,
  injectMddDiagrams,
  suggestMddDiagrams,
  sqlToErDiagramContent,
} from "../utils/mdd-diagram-suggestions.js";
import { getMddDraftSummary, logMddNodeOutput } from "../utils/mdd-sanitize.js";

const LOG = (msg: string, ...args: unknown[]) => console.log(`[MDD:DiagramInjector] ${msg}`, ...args);

function finalizeDiagramInjection(
  originalDraft: string,
  workingDraft: string,
  logLabel: string,
): Partial<MDDStateType> | null {
  const withComponentDiagram = injectProposedComponentDiagramIntoSection2(workingDraft);
  const finalDraft = withComponentDiagram;
  if (finalDraft === originalDraft) return null;
  const sum = getMddDraftSummary(finalDraft);
  LOG("%s draftLen=%s section2=%s", logLabel, sum.length, sum.section2);
  logMddNodeOutput("DiagramInjector", finalDraft);
  return { mddDraft: finalDraft };
}

/**
 * Nodo que detecta puntos del MDD donde enriquecer con diagramas Mermaid (ER, estados, flujo).
 * Prioridad: generar el diagrama ER desde el §3 del draft actual (no desde mddStructured) para no
 * inyectar un diagrama viejo si structured quedó desactualizado. Solo usa mddStructured si el draft no tiene §3 con SQL.
 */
export function createMddDiagramInjectorNode(): (state: MDDStateType) => Promise<Partial<MDDStateType>> {
  return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
    const draft = (state.mddDraft ?? "").trim();
    if (!draft || draft.length < 200) {
      LOG("draft vacío o muy corto, sin cambios");
      return {};
    }

    let workingDraft = draft;
    const suggestions = suggestMddDiagrams(workingDraft);
    if (suggestions.length > 0) {
      try {
        workingDraft = injectMddDiagrams(workingDraft, suggestions);
        if (workingDraft !== draft) {
          LOG("inyectados %s diagrama(s) desde draft §3", suggestions.length);
        }
      } catch (err) {
        LOG("error inyectando diagramas desde draft: %s", err instanceof Error ? err.message : String(err));
      }
    }

    const md = state.mddStructured?.modeloDatos;
    if (md?.sql?.trim() && !md.diagramaEr?.trim()) {
      try {
        const diagramaEr = sqlToErDiagramContent(md.sql);
        if (diagramaEr) {
          const mermaidBlock = "```mermaid\nerDiagram\n" + diagramaEr + "\n```";
          workingDraft = injectErDiagramBlockIntoDraft(workingDraft, mermaidBlock);
          const merged = mergeMddStructured(
            state.mddStructured,
            {
              modeloDatos: { sql: md.sql, diagramaEr, technicalMetadata: md.technicalMetadata },
            },
            state.mddDraft ?? "",
          );
          const out = finalizeDiagramInjection(draft, workingDraft, "inyectado diagramaEr + componentes propuestos");
          if (out) return { ...out, mddStructured: merged };
        }
      } catch (err) {
        LOG("error generando diagramaEr desde structured: %s", err instanceof Error ? err.message : String(err));
      }
    }

    const out = finalizeDiagramInjection(draft, workingDraft, "inyectados diagramas / componentes propuestos");
    if (out) return out;

    LOG("sin sugerencias de diagramas o sin cambios");
    return {};
  };
}
