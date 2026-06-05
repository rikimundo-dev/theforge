import { z } from "zod";
import { StatusEnum } from "./status.js";

export const ProjectTypeEnum = z.enum(["NEW", "LEGACY"]);
export type ProjectType = z.infer<typeof ProjectTypeEnum>;

/** Alineado con Prisma `ComplexityLevel`: define semáforo y entregables obligatorios. */
export const ComplexityLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type ComplexityLevel = z.infer<typeof ComplexityLevelEnum>;

/** Propuesta de complejidad pendiente de confirmación (HITL). */
export const complexityPendingSchema = z
  .object({
    level: ComplexityLevelEnum,
    planSummary: z.string(),
    reason: z.string().optional(),
  })
  .strict();
export type ComplexityPending = z.infer<typeof complexityPendingSchema>;

export const VisibilityEnum = z.enum(["PRIVATE", "SHARED"]);
export type Visibility = z.infer<typeof VisibilityEnum>;

export const createProjectSchema = z
  .object({
    name: z.string().min(1),
    visibility: VisibilityEnum.default("PRIVATE"),
    hasUxTeam: z.boolean().default(false),
    complexity: ComplexityLevelEnum.default("HIGH"),
    projectType: ProjectTypeEnum.default("NEW"),
    theforgeProjectId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.projectType === "LEGACY") return !!data.theforgeProjectId;
      return true;
    },
    { message: "theforgeProjectId es obligatorio cuando projectType es LEGACY", path: ["theforgeProjectId"] },
  );

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  visibility: VisibilityEnum.optional(),
  hasUxTeam: z.boolean().optional(),
  /** Si true, el backend exige BRD + To-Be aprobados antes del MDD técnico (streams y, en legacy, generate-mdd / entregables). */
  requireBrdTobeGate: z.boolean().optional(),
  complexity: ComplexityLevelEnum.optional(),
  /** Borrar propuesta pendiente sin aplicar (rechazo). */
  clearComplexityPending: z.boolean().optional(),
  complexityPending: complexityPendingSchema.nullable().optional(),
  projectType: ProjectTypeEnum.optional(),
  theforgeProjectId: z.string().uuid().optional().nullable(),
  /** Etapa donde aplicar `mddContent`; si se omite, la etapa activa (workflow) o la primera por ordinal. */
  stageId: z.string().uuid().optional(),
  dbgaContent: z.string().optional().nullable(),
  specContent: z.string().optional().nullable(),
  architectureContent: z.string().optional().nullable(),
  useCasesContent: z.string().optional().nullable(),
  userStoriesContent: z.string().optional().nullable(),
  mddContent: z.string().optional().nullable(),
  /** true solo al guardar desde el wizard «Editar patrones (SSOT)»; si no, el backend restaura la selección [X] previa. */
  allowGovernancePatternChange: z.boolean().optional(),
  /** Vacía el MDD por completo (sin reinyectar wizard de patrones). */
  clearMddCompletely: z.boolean().optional(),
  /** Semilla SSOT sin §1–§7: omite pipeline de validación al persistir. */
  mddGovernanceSeedOnly: z.boolean().optional(),
  blueprintContent: z.string().optional().nullable(),
  tasksContent: z.string().optional().nullable(),
  apiContractsContent: z.string().optional().nullable(),
  logicFlowsContent: z.string().optional().nullable(),
  infraContent: z.string().optional().nullable(),
  uxUiGuideContent: z.string().optional().nullable(),
  phase0SummaryContent: z.string().optional().nullable(),
  aemContent: z.string().optional().nullable(),
  figmaMapping: z.record(z.unknown()).optional().nullable(),
});

/** Body para POST /projects/:id/phase0-deep-research */
export const phase0DeepResearchBodySchema = z.object({
  userIdea: z.string().optional(),
  urls: z.array(z.string()).optional(),
  includeBenchmark: z.boolean().optional().default(false),
});

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  projectType: ProjectTypeEnum,
  requireBrdTobeGate: z.boolean(),
  theforgeProjectId: z.string().nullable(),
  hasUxTeam: z.boolean(),
  complexity: ComplexityLevelEnum,
  complexityPending: complexityPendingSchema.nullable().optional(),
  status: z.enum(StatusEnum),
  precisionScore: z.number(),
  dbgaContent: z.string().nullable(),
  specContent: z.string().nullable(),
  architectureContent: z.string().nullable(),
  useCasesContent: z.string().nullable(),
  userStoriesContent: z.string().nullable(),
  mddContent: z.string().nullable(),
  blueprintContent: z.string().nullable(),
  tasksContent: z.string().nullable(),
  apiContractsContent: z.string().nullable(),
  logicFlowsContent: z.string().nullable(),
  infraContent: z.string().nullable(),
  uxUiGuideContent: z.string().nullable(),
  phase0SummaryContent: z.string().nullable(),
  aemContent: z.string().nullable(),
  figmaMapping: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export type Phase0DeepResearchBody = z.infer<typeof phase0DeepResearchBodySchema>;
export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
