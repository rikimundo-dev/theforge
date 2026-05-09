import { z } from "zod";

/** POST /projects/:projectId/stages */
export const createStageBodySchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().min(1).max(64).optional(),
  /** Si no se envía, se usa max(ordinal)+1 */
  ordinal: z.number().int().min(1).optional(),
  /** Copiar MDD y semáforo desde otra etapa del mismo proyecto */
  copyMddFromStageId: z.string().uuid().optional(),
  /** Copiar legacyChangeState desde otra etapa del mismo proyecto (flujo legacy) */
  copyLegacyChangeFromStageId: z.string().uuid().optional(),
  /** Si true (default), esta etapa pasa a ACTIVE y las demás ACTIVE → SUPERSEDED */
  activate: z.boolean().optional().default(true),
});

/** PATCH /projects/:projectId/stages/:stageId */
export const patchStageBodySchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().min(1).max(64).optional(),
  ordinal: z.number().int().min(1).optional(),
  /** Poner esta etapa como única ACTIVE del proyecto */
  activate: z.boolean().optional(),
  brdContent: z.string().optional(),
});

export type CreateStageBody = z.infer<typeof createStageBodySchema>;
export type PatchStageBody = z.infer<typeof patchStageBodySchema>;
