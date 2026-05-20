import type { MDDStateType } from "../state/index.js";

// ---------------------------------------------------------------------------
// Input-hash helpers for each LLM node.
//
// Each function extracts ONLY the state fields that the node actually reads
// as input.  Fields unique to later nodes (e.g. auditorFeedback is consumed
// by clarifier but produced by auditor) are excluded to avoid cache poisoning
// when a downstream node hasn't run yet.
// ---------------------------------------------------------------------------

export function clarifierInput(state: MDDStateType): Record<string, unknown> {
  return {
    dbgaContent: state.dbgaContent,
    mddDraft: truncStr(state.mddDraft, 20_000),
    auditorFeedback: state.auditorFeedback,
    userInputAccumulated: state.userInputAccumulated,
    mddComplexity: state.mddComplexity,
    managerQuestions: state.managerQuestions,
    requestQuestionsOnly: state.requestQuestionsOnly,
    mddIteration: state.mddIteration,
  };
}

export function softwareArchitectInput(state: MDDStateType): Record<string, unknown> {
  return {
    clarifiedScope: state.clarifiedScope,
    mddDraft: truncStr(state.mddDraft, 20_000),
    mddStructuredKeys: state.mddStructured
      ? Object.keys(state.mddStructured).filter((k) => k !== "seguridad" && k !== "integracion")
      : undefined,
    acceptedProposalDirective: state.acceptedProposalDirective,
    architectCriticFeedback: state.architectCriticFeedback,
    mddComplexity: state.mddComplexity,
    mddIteration: state.mddIteration,
    isLegacyProject: state.isLegacyProject,
    theforgeProjectId: state.theforgeProjectId,
  };
}

export function securityInput(state: MDDStateType): Record<string, unknown> {
  return {
    clarifiedScope: state.clarifiedScope,
    mddDraft: truncStr(state.mddDraft, 20_000),
    mddStructuredSeguridad: state.mddStructured?.seguridad,
    acceptedProposalDirective: state.acceptedProposalDirective,
    auditorFeedback: state.auditorFeedback,
  };
}

export function integrationInput(state: MDDStateType): Record<string, unknown> {
  return {
    clarifiedScope: state.clarifiedScope,
    mddDraft: truncStr(state.mddDraft, 20_000),
    mddStructuredIntegracion: state.mddStructured?.integracion,
    acceptedProposalDirective: state.acceptedProposalDirective,
    auditorFeedback: state.auditorFeedback,
    userInputAccumulated: state.userInputAccumulated,
  };
}

export function llmFormatterInput(state: MDDStateType): Record<string, unknown> {
  return {
    mddStructuredKeys: state.mddStructured ? Object.keys(state.mddStructured).sort() : undefined,
    // Only the first 4K of each structured section to keep hash cheap
    mddStructuredSnap: snapMddStructured(state.mddStructured, 4_000),
  };
}

export function crossConsistencyInput(state: MDDStateType): Record<string, unknown> {
  return {
    mddDraft: truncStr(state.mddDraft, 20_000),
    mddComplexity: state.mddComplexity,
  };
}

export function architectCriticInput(state: MDDStateType): Record<string, unknown> {
  return {
    // Only §§3-4 are relevant for the critic
    mddDraftSection3_4: extractSections3And4(state.mddDraft ?? "", 10_000),
    acceptedProposalDirective: state.acceptedProposalDirective,
  };
}

// ---- helpers --------------------------------------------------------------

/** Truncate a long string to `max` chars for hashing. */
function truncStr(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

/** Snap the first `max` chars of each string/key in mddStructured. */
function snapMddStructured(
  s: Record<string, unknown> | undefined,
  max: number,
): Record<string, string> | undefined {
  if (!s) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = truncStr(String(v ?? ""), max) ?? "";
  }
  return out;
}

/** Extract only §§3-4 from the draft for the architect critic. */
function extractSections3And4(draft: string, max: number): string {
  const section3 = extractSectionBody(draft, /^##\s*3\.\s*Modelo\s+(?:de\s+)?datos/im);
  const section4 = extractSectionBody(draft, /^##\s*4\.\s*Contratos\s+de\s+API/im);
  const combined = [section3, section4].filter(Boolean).join("\n\n---\n\n");
  return truncStr(combined, max) ?? "";
}

function extractSectionBody(draft: string, heading: RegExp): string {
  const match = heading.exec(draft);
  if (!match) return "";
  const start = match.index;
  const nextSection = /^##\s*\d+\./gm;
  nextSection.lastIndex = start + match[0].length;
  const nextMatch = nextSection.exec(draft);
  const end = nextMatch ? nextMatch.index : draft.length;
  return draft.slice(start, end).trim();
}