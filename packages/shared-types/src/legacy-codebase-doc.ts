import { z } from "zod";

/**
 * Modo `ask_codebase` (Ariadne) — **deprecado** para doc. partida.
 * Usar siempre `generate_legacy_documentation` vía MCP (único modo fiel al código).
 */
export const codebaseDocResponseModeSchema = z.enum([
  "default",
  "evidence_first",
  "raw_evidence",
  "ingest_mdd",
]);
export type CodebaseDocResponseMode = z.infer<typeof codebaseDocResponseModeSchema>;

export const generateCodebaseDocRequestSchema = z
  .object({
    /** @deprecated Ignorado: doc. partida usa `generate_legacy_documentation` (MCP). */
    responseMode: codebaseDocResponseModeSchema.optional(),
    stageId: z.string().optional(),
  })
  .strict();

export type GenerateCodebaseDocRequest = z.infer<typeof generateCodebaseDocRequestSchema>;
