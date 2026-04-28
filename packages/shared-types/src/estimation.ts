import { z } from "zod";

export const teamStructureSchema = z.object({
  architect: z.number().int().min(0).optional(),
  back: z.number().int().min(0).optional(),
  front: z.number().int().min(0).optional(),
  ux: z.number().int().min(0).optional(),
  techLead: z.number().int().min(0).optional(),
  pm: z.number().int().min(0).optional(),
  security: z.number().int().min(0).optional(),
  qa: z.number().int().min(0).optional(),
  devops: z.number().int().min(0).optional(),
});

export const estimationResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  totalHours: z.number(),
  totalMxn: z.number(),
  teamStructure: teamStructureSchema,
});

export type TeamStructure = z.infer<typeof teamStructureSchema>;
export type EstimationResponse = z.infer<typeof estimationResponseSchema>;
