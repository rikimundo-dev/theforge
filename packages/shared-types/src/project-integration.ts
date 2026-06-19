import { z } from "zod";

export const integrationHandoffItemStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "implemented",
  "rejected",
]);

export type IntegrationHandoffItemStatus = z.infer<typeof integrationHandoffItemStatusSchema>;

export const integrationHandoffItemSchema = z.object({
  id: z.string().regex(/^NEW-LEG-\d{2,}$/),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  actor: z.string().max(120).optional(),
  acceptanceCriteria: z.array(z.string().max(500)).max(12).optional(),
  status: integrationHandoffItemStatusSchema.default("draft"),
  legacyStoryId: z.string().max(40).optional(),
  legacyStageId: z.string().uuid().optional(),
});

export type IntegrationHandoffItem = z.infer<typeof integrationHandoffItemSchema>;

export const integrationHandoffSchema = z.object({
  items: z.array(integrationHandoffItemSchema),
  updatedAt: z.string().datetime().optional(),
});

export type IntegrationHandoff = z.infer<typeof integrationHandoffSchema>;

export const integrationLinkBodySchema = z
  .object({
    linkedLegacyProjectId: z.string().uuid().nullable().optional(),
    linkedNewProjectId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.linkedLegacyProjectId !== undefined || d.linkedNewProjectId !== undefined, {
    message: "Indica linkedLegacyProjectId o linkedNewProjectId",
  });

export const createHandoffItemBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  actor: z.string().max(120).optional(),
  acceptanceCriteria: z.array(z.string().max(500)).max(12).optional(),
});

export const updateHandoffItemBodySchema = createHandoffItemBodySchema.partial().extend({
  status: integrationHandoffItemStatusSchema.optional(),
  legacyStoryId: z.string().max(40).optional(),
  screenOrEndpoint: z.string().max(300).optional(),
});

export const updateIntegrationTraceBodySchema = z.object({
  legacyStoryId: z.string().max(40).optional().nullable(),
  screenOrEndpoint: z.string().max(300).optional().nullable(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "IMPLEMENTED", "REJECTED"]).optional(),
  legacyStageId: z.string().uuid().optional().nullable(),
});

export const integrationProjectPickerQuerySchema = z.object({
  targetType: z.enum(["LEGACY", "NEW"]),
  q: z.string().max(80).optional(),
});

export interface IntegrationLinkedProjectSummary {
  id: string;
  name: string;
  projectType: "NEW" | "LEGACY";
  hasBaselineMdd: boolean;
}

export interface IntegrationContextResponse {
  legacyProjectId: string;
  legacyProjectName: string;
  contextSectionMarkdown: string;
  apiSectionMarkdown: string;
  baselineStageOrdinal: number;
}

export interface IntegrationStatusResponse {
  linkedLegacyProject: IntegrationLinkedProjectSummary | null;
  linkedNewProject: IntegrationLinkedProjectSummary | null;
  handoff: IntegrationHandoff;
  traces: IntegrationTraceRow[];
  warnings: string[];
  handoffImportedAt: string | null;
  promotableItemIds?: string[];
  linkedNewHandoff?: IntegrationHandoff;
}

export interface IntegrationTraceRow {
  id: string;
  newLegId: string;
  legacyStoryId: string | null;
  legacyStageId: string | null;
  screenOrEndpoint: string | null;
  status: string;
  title: string;
  description: string;
}

/** Genera el siguiente id NEW-LEG-XX a partir de items existentes. */
export function nextNewLegId(items: Pick<IntegrationHandoffItem, "id">[]): string {
  let max = 0;
  for (const item of items) {
    const m = item.id.match(/^NEW-LEG-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `NEW-LEG-${String(max + 1).padStart(2, "0")}`;
}

export function emptyIntegrationHandoff(): IntegrationHandoff {
  return { items: [] };
}

export function parseIntegrationHandoff(raw: unknown): IntegrationHandoff {
  const parsed = integrationHandoffSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return emptyIntegrationHandoff();
}

export const promoteHandoffToStageBodySchema = z.object({
  itemIds: z.array(z.string().regex(/^NEW-LEG-\d{2,}$/)).optional(),
  stageName: z.string().min(1).max(120).optional(),
  activate: z.boolean().optional().default(true),
});

export type PromoteHandoffToStageBody = z.infer<typeof promoteHandoffToStageBodySchema>;

export interface PromoteHandoffToStageResponse {
  stage: {
    id: string;
    ordinal: number;
    name: string | null;
    workflowStatus: string;
    handoffImportedAt: string | null;
    linkedNewProjectId: string | null;
  };
  traces: IntegrationTraceRow[];
  promotedItemIds: string[];
}

export function buildHandoffImportDescription(
  items: IntegrationHandoffItem[],
  newProjectName: string,
): string {
  const lines: string[] = [
    `Integración con proyecto NEW: ${newProjectName}`,
    "",
    "Handoff importado:",
    "",
  ];
  for (const item of items) {
    lines.push(`- **${item.id}** — ${item.title}: ${item.description.replace(/\n/g, " ")}`);
  }
  return lines.join("\n");
}

export function mergeHandoffIntoLegacyDescription(
  existing: string | undefined,
  handoffBlock: string,
): string {
  const marker = "## Handoff importado";
  const base = (existing ?? "").trim();
  const idx = base.indexOf(marker);
  const withoutOld = idx >= 0 ? base.slice(0, idx).trim() : base;
  return [withoutOld, handoffBlock].filter(Boolean).join("\n\n").trim();
}
