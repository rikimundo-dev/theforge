import { z } from "zod";

/**
 * Competitor data from the Market Scout (Researcher) agent.
 * Constraint: every competitor must have a verified link (no hallucinated URLs).
 */
export const competitorDataSchema = z.object({
  /** Display name of the competitor */
  name: z.string().min(1),
  /** Verified URL (required – no hallucinated links) */
  url: z.string().url(),
  /** Unique Value Proposition */
  uvp: z.string().nullable().optional(),
  /** Pricing info if available */
  pricing: z.string().nullable().optional(),
  /** Market share or relative position if available */
  marketShare: z.string().nullable().optional(),
  /** Why this competitor is a direct competitor of the user's idea */
  relevance: z.string().nullable().optional(),
});

export type CompetitorData = z.infer<typeof competitorDataSchema>;

/** Workflow status for DBGA pipeline */
export const dbgaStatusSchema = z.enum([
  "idle",
  "researching",
  "analyzing",
  "finalizing",
]);

export type DBGAStatus = z.infer<typeof dbgaStatusSchema>;

/** Critic decision: re-research (loop to Scout) or continue to Synthesis */
export const criticDecisionSchema = z.enum(["scout", "synthesis"]);
export type CriticDecision = z.infer<typeof criticDecisionSchema>;

/**
 * Shared state between agents (LangGraph State).
 * Strictly typed; use Zod schemas for validation at boundaries.
 */
export const dbgaStateSchema = z.object({
  /** Raw user idea (input) */
  rawIdea: z.string(),
  /** From Research Agent (Market Scout) – Top 5 competitors with verified links */
  competitors: z.array(competitorDataSchema),
  /** From Tech Agent (Tech Auditor) – e.g. "Built with Next.js", "Uses Stripe" */
  techStackInsights: z.array(z.string()),
  /** From Voice Agent – user pain points */
  userPainPoints: z.array(z.string()),
  /** From Synthesis Agent – final gap analysis text */
  gapAnalysis: z.string(),
  /** Current pipeline status */
  status: dbgaStatusSchema,
  /** From Critic Agent – route: re-research (scout) or continue (synthesis) */
  criticDecision: criticDecisionSchema.optional(),
  /** Refined query for re-research loop (when criticDecision === "scout") */
  refinedQuery: z.string().optional(),
  /** Preferencias arquitectónicas del usuario (memoria semántica) para alinear benchmark */
  userPreferences: z.string().optional(),
});

export type DBGAState = z.infer<typeof dbgaStateSchema>;

/** Default state for initializing the graph */
export const defaultDBGAState: DBGAState = {
  rawIdea: "",
  competitors: [],
  techStackInsights: [],
  userPainPoints: [],
  gapAnalysis: "",
  status: "idle",
  criticDecision: undefined,
  refinedQuery: undefined,
  userPreferences: undefined,
};
