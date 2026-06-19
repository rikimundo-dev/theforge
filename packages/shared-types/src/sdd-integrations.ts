import { z } from "zod";

export const convergeTriggerBodySchema = z.object({
  /** If true, persist converge tasks into tasksContent (same as POST /converge). */
  persist: z.boolean().optional().default(false),
  /** Override webhook URL (default: project.convergeWebhookUrl, then CONVERGE_WEBHOOK_URL). */
  webhookUrl: z.string().url().optional(),
});

export type ConvergeTriggerBody = z.infer<typeof convergeTriggerBodySchema>;

export const convergeBodySchema = z.object({
  /** Si true, fusiona las nuevas tareas en `tasksContent` del proyecto. */
  persist: z.boolean().optional().default(false),
});

export type ConvergeBody = z.infer<typeof convergeBodySchema>;

export const tasksToIssuesBodySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  milestone: z.number().int().positive().optional(),
  labels: z.array(z.string().min(1)).optional(),
  /** Si true, solo devuelve el plan sin crear issues. */
  dryRun: z.boolean().optional().default(false),
});

export type TasksToIssuesBody = z.infer<typeof tasksToIssuesBodySchema>;

export const clarifySpecBodySchema = z.object({
  /** Si true, persiste el Spec aclarado en `specContent`. */
  persist: z.boolean().optional().default(false),
  /** Notas del usuario para guiar la clarificación. */
  notes: z.string().optional(),
});

export type ClarifySpecBody = z.infer<typeof clarifySpecBodySchema>;
