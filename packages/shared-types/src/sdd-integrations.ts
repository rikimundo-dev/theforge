import { z } from "zod";

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
