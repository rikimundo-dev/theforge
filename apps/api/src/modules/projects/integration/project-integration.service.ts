import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildStageChangeSpecContent,
  createHandoffItemBodySchema,
  integrationHandoffItemSchema,
  integrationLinkBodySchema,
  parseIntegrationHandoff,
  nextNewLegId,
  promoteHandoffToStageBodySchema,
  updateHandoffItemBodySchema,
  updateIntegrationTraceBodySchema,
  type IntegrationContextResponse,
  type IntegrationHandoff,
  type IntegrationHandoffItem,
  type IntegrationStatusResponse,
  type IntegrationTraceRow,
  type PromoteHandoffToStageResponse,
} from "@theforge/shared-types";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { getRequestUserId } from "../../../common/request-user.store.js";
import { ChangeLogService } from "../../change-log/change-log.service.js";
import { GraphMemoryService } from "../../ai-analysis/graph-memory/graph-memory.service.js";
import { TheForgeService } from "../../theforge/theforge.service.js";
import { ProjectsService } from "../projects.service.js";
import { persistStageDeliverableSnapshotFromProject } from "../stage-deliverable-snapshot.util.js";
import {
  buildExternalLegacyContextBlock,
  buildHandoffImportDescription,
  extractLegacyAsIsApiSection,
  extractLegacyAsIsContextSection,
  mergeHandoffIntoLegacyDescription,
  parseSatisfiesLinksFromUserStories,
} from "./integration-context.util.js";
import {
  pickHandoffItemsForPromotion,
  selectPromotableHandoffItemIds,
} from "./promote-handoff.util.js";

type ProjectRow = {
  id: string;
  name: string;
  projectType: "NEW" | "LEGACY";
  userId: string;
  visibility: string;
  linkedLegacyProjectId: string | null;
  linkedNewProjectId: string | null;
  theforgeProjectId: string | null;
  integrationHandoff: unknown;
  integrationHandoffUpdatedAt: Date | null;
  stages: { id: string; ordinal: number; mddContent: string | null; handoffSnapshot: unknown; handoffImportedAt: Date | null; linkedNewProjectId: string | null }[];
};

@Injectable()
export class ProjectIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changeLog: ChangeLogService,
    private readonly graphMemory: GraphMemoryService,
    private readonly theforge: TheForgeService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  private async assertAccess(projectId: string): Promise<ProjectRow> {
    const userId = getRequestUserId();
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
      include: { stages: { orderBy: { ordinal: "asc" } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    if (project.userId !== userId && project.visibility !== "SHARED") {
      throw new NotFoundException("Project not found");
    }
    return project as ProjectRow;
  }

  private baselineStage(project: ProjectRow) {
    return project.stages.find((s) => s.ordinal === 1) ?? project.stages[0] ?? null;
  }

  private handoffFromProject(project: ProjectRow): IntegrationHandoff {
    return parseIntegrationHandoff(project.integrationHandoff);
  }

  async getStatus(projectId: string): Promise<IntegrationStatusResponse> {
    const project = await this.assertAccess(projectId);
    const warnings = this.buildWarnings(project);
    const handoff = this.handoffFromProject(project);
    const stage2 = project.stages.find((s) => s.ordinal >= 2);
    const linkedNewHandoff =
      project.projectType === "LEGACY" && project.linkedNewProjectId
        ? this.handoffFromProject(await this.assertAccess(project.linkedNewProjectId))
        : handoff;
    const traceHandoff = project.projectType === "LEGACY" ? linkedNewHandoff : handoff;
    const tracesForProject = await this.listTraceRows(projectId, traceHandoff);
    return {
      linkedLegacyProject: await this.summarizeLinked(project.linkedLegacyProjectId),
      linkedNewProject: await this.summarizeLinked(project.linkedNewProjectId),
      handoff,
      traces: tracesForProject,
      warnings,
      handoffImportedAt: stage2?.handoffImportedAt?.toISOString() ?? null,
      promotableItemIds:
        project.projectType === "LEGACY"
          ? selectPromotableHandoffItemIds(tracesForProject)
          : undefined,
      linkedNewHandoff: project.projectType === "LEGACY" ? linkedNewHandoff : undefined,
    };
  }

  private buildWarnings(project: ProjectRow): string[] {
    const warnings: string[] = [];
    const handoff = this.handoffFromProject(project);
    if (project.projectType === "NEW" && !project.linkedLegacyProjectId) {
      warnings.push("Vincula un proyecto LEGACY para declarar dependencia AS-IS.");
    }
    if (project.projectType === "NEW" && handoff.items.length === 0) {
      warnings.push("Añade ítems handoff NEW-LEG antes de enviar al equipo legacy.");
    }
    const sent = handoff.items.filter((i) => i.status === "sent" || i.status === "accepted");
    if (project.projectType === "LEGACY" && project.linkedNewProjectId && sent.length > 0) {
      const stage2plus = project.stages.filter((s) => s.ordinal >= 2);
      const imported = stage2plus.some((s) => s.handoffImportedAt);
      if (!imported) {
        warnings.push("Importa el handoff en etapa 2+ antes de generate-mdd de cambio.");
      }
    }
    return warnings;
  }

  private async summarizeLinked(id: string | null | undefined) {
    if (!id?.trim()) return null;
    const p = await this.prisma.project.findFirst({
      where: { id: id.trim() },
      include: { stages: { where: { ordinal: 1 }, take: 1 } },
    });
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      projectType: p.projectType as "NEW" | "LEGACY",
      hasBaselineMdd: !!(p.stages[0]?.mddContent ?? "").trim(),
    };
  }

  async listPickerProjects(targetType: "NEW" | "LEGACY", q?: string) {
    const userId = getRequestUserId();
    const where = {
      archivedAt: null,
      projectType: targetType as "NEW" | "LEGACY",
      OR: [{ userId }, { visibility: "SHARED" as const }],
      ...(q?.trim()
        ? { name: { contains: q.trim(), mode: "insensitive" as const } }
        : {}),
    };
    const rows = await this.prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { stages: { where: { ordinal: 1 }, take: 1, select: { mddContent: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      projectType: p.projectType,
      hasBaselineMdd: !!(p.stages[0]?.mddContent ?? "").trim(),
    }));
  }

  async patchLink(projectId: string, body: unknown) {
    const dto = integrationLinkBodySchema.parse(body);
    const project = await this.assertAccess(projectId);

    if (dto.linkedLegacyProjectId !== undefined) {
      if (project.projectType !== "NEW") {
        throw new BadRequestException("linkedLegacyProjectId solo aplica a proyectos NEW");
      }
      const legacyId = dto.linkedLegacyProjectId;
      if (legacyId) {
        const legacy = await this.assertAccess(legacyId);
        if (legacy.projectType !== "LEGACY") {
          throw new BadRequestException("El proyecto enlazado debe ser LEGACY");
        }
        await this.prisma.project.update({
          where: { id: projectId },
          data: { linkedLegacyProjectId: legacyId },
        });
        await this.prisma.project.update({
          where: { id: legacyId },
          data: { linkedNewProjectId: projectId },
        });
        await this.graphMemory.syncProjectIntegrationLink(projectId, legacyId).catch(() => {});
      } else {
        const prev = project.linkedLegacyProjectId;
        await this.prisma.project.update({
          where: { id: projectId },
          data: { linkedLegacyProjectId: null },
        });
        if (prev) {
          await this.prisma.project.updateMany({
            where: { id: prev, linkedNewProjectId: projectId },
            data: { linkedNewProjectId: null },
          });
        }
      }
    }

    if (dto.linkedNewProjectId !== undefined) {
      if (project.projectType !== "LEGACY") {
        throw new BadRequestException("linkedNewProjectId solo aplica a proyectos LEGACY");
      }
      const newId = dto.linkedNewProjectId;
      if (newId) {
        const np = await this.assertAccess(newId);
        if (np.projectType !== "NEW") {
          throw new BadRequestException("El proyecto enlazado debe ser NEW");
        }
        await this.prisma.project.update({
          where: { id: projectId },
          data: { linkedNewProjectId: newId },
        });
        await this.prisma.project.update({
          where: { id: newId },
          data: { linkedLegacyProjectId: projectId },
        });
        await this.graphMemory.syncProjectIntegrationLink(newId, projectId).catch(() => {});
      } else {
        const prev = project.linkedNewProjectId;
        await this.prisma.project.update({
          where: { id: projectId },
          data: { linkedNewProjectId: null },
        });
        if (prev) {
          await this.prisma.project.updateMany({
            where: { id: prev, linkedLegacyProjectId: projectId },
            data: { linkedLegacyProjectId: null },
          });
        }
      }
    }

    return this.getStatus(projectId);
  }

  async getLegacyContextForNew(projectId: string): Promise<IntegrationContextResponse | null> {
    const project = await this.assertAccess(projectId);
    if (project.projectType !== "NEW" || !project.linkedLegacyProjectId) return null;
    const legacy = await this.assertAccess(project.linkedLegacyProjectId);
    const baseline = this.baselineStage(legacy);
    const mdd = baseline?.mddContent?.trim() ?? "";
    if (!mdd) {
      throw new BadRequestException("El legacy enlazado no tiene MDD AS-IS (etapa 1)");
    }
    return {
      legacyProjectId: legacy.id,
      legacyProjectName: legacy.name,
      contextSectionMarkdown: extractLegacyAsIsContextSection(mdd),
      apiSectionMarkdown: extractLegacyAsIsApiSection(mdd),
      baselineStageOrdinal: baseline?.ordinal ?? 1,
    };
  }

  async createHandoffItem(projectId: string, body: unknown) {
    const dto = createHandoffItemBodySchema.parse(body);
    const project = await this.assertAccess(projectId);
    if (project.projectType !== "NEW") {
      throw new BadRequestException("Handoff solo en proyectos NEW");
    }
    const handoff = this.handoffFromProject(project);
    const item: IntegrationHandoffItem = integrationHandoffItemSchema.parse({
      id: nextNewLegId(handoff.items),
      ...dto,
      status: "draft",
    });
    handoff.items.push(item);
    await this.persistHandoff(projectId, handoff);
    return this.getStatus(projectId);
  }

  async updateHandoffItem(projectId: string, itemId: string, body: unknown) {
    const dto = updateHandoffItemBodySchema.parse(body);
    const project = await this.assertAccess(projectId);
    const handoff = this.handoffFromProject(project);
    const idx = handoff.items.findIndex((i) => i.id === itemId);
    if (idx < 0) throw new NotFoundException("Handoff item not found");
    handoff.items[idx] = integrationHandoffItemSchema.parse({ ...handoff.items[idx], ...dto });
    await this.persistHandoff(projectId, handoff);
    if (dto.legacyStoryId && project.linkedLegacyProjectId) {
      await this.prisma.integrationTrace.updateMany({
        where: { newProjectId: projectId, newLegId: itemId },
        data: { legacyStoryId: dto.legacyStoryId },
      });
    }
    return this.getStatus(projectId);
  }

  async deleteHandoffItem(projectId: string, itemId: string) {
    const project = await this.assertAccess(projectId);
    const handoff = this.handoffFromProject(project);
    handoff.items = handoff.items.filter((i) => i.id !== itemId);
    await this.persistHandoff(projectId, handoff);
    await this.prisma.integrationTrace.deleteMany({
      where: { newProjectId: projectId, newLegId: itemId },
    });
    return this.getStatus(projectId);
  }

  async sendHandoff(projectId: string) {
    const project = await this.assertAccess(projectId);
    if (project.projectType !== "NEW") {
      throw new BadRequestException("sendHandoff solo en proyectos NEW");
    }
    if (!project.linkedLegacyProjectId) {
      throw new BadRequestException("Vincula un proyecto LEGACY antes de enviar handoff");
    }
    const handoff = this.handoffFromProject(project);
    if (!handoff.items.length) {
      throw new BadRequestException("No hay ítems handoff para enviar");
    }
    handoff.items = handoff.items.map((i) =>
      i.status === "draft" ? { ...i, status: "sent" as const } : i,
    );
    await this.persistHandoff(projectId, handoff);
    await this.syncTracesFromHandoff(projectId, project.linkedLegacyProjectId, handoff);
    await this.changeLog.log(project.linkedLegacyProjectId, "integrationHandoff", JSON.stringify(handoff));
    await this.changeLog.log(projectId, "integrationHandoff", "Handoff enviado al legacy");
    return this.getStatus(projectId);
  }

  async importHandoffToStage(projectId: string, stageId: string) {
    const project = await this.assertAccess(projectId);
    if (project.projectType !== "LEGACY") {
      throw new BadRequestException("importHandoff solo en proyectos LEGACY");
    }
    const stage = project.stages.find((s) => s.id === stageId);
    if (!stage) throw new NotFoundException("Stage not found");
    if (stage.ordinal < 2) {
      throw new BadRequestException("Importa handoff en etapa 2 o superior");
    }
    const newProjectId = stage.linkedNewProjectId ?? project.linkedNewProjectId;
    if (!newProjectId) {
      throw new BadRequestException("Vincula un proyecto NEW antes de importar handoff");
    }
    const newProject = await this.assertAccess(newProjectId);
    const handoff = this.handoffFromProject(newProject);
    const activeItems = handoff.items.filter(
      (i) => i.status === "sent" || i.status === "accepted" || i.status === "implemented",
    );
    if (!activeItems.length) {
      throw new BadRequestException("El proyecto NEW no tiene handoff enviado");
    }

    const snapshot = {
      items: activeItems,
      importedAt: new Date().toISOString(),
      fromProjectId: newProjectId,
    };
    const handoffDesc = buildHandoffImportDescription(activeItems, newProject.name);

    await this.applyHandoffPayloadToStage(stageId, newProjectId, snapshot, handoffDesc);
    await this.syncTracesFromHandoff(newProjectId, projectId, { items: activeItems }, stageId);
    await this.persistHandoffItemsLegacyStage(newProjectId, activeItems.map((i) => i.id), stageId);
    await this.finalizeHandoffStageSetup(projectId, stageId, newProjectId, activeItems);
    await this.changeLog.log(projectId, "handoffSnapshot", handoffDesc);
    return this.getStatus(projectId);
  }

  async promoteHandoffToStage(
    projectId: string,
    body: unknown,
  ): Promise<PromoteHandoffToStageResponse> {
    const dto = promoteHandoffToStageBodySchema.parse(body ?? {});
    const project = await this.assertAccess(projectId);
    if (project.projectType !== "LEGACY") {
      throw new BadRequestException("promote-to-stage solo en proyectos LEGACY");
    }
    const newProjectId = project.linkedNewProjectId;
    if (!newProjectId) {
      throw new BadRequestException("Vincula un proyecto NEW antes de promover handoff a etapa");
    }

    const newProject = await this.assertAccess(newProjectId);
    const handoff = this.handoffFromProject(newProject);
    const traces = await this.listTraceRows(projectId, handoff);
    const itemIds = selectPromotableHandoffItemIds(traces, dto.itemIds);
    if (!itemIds.length) {
      throw new BadRequestException("No hay ítems handoff SENT disponibles para promover");
    }

    const activeItems = pickHandoffItemsForPromotion(handoff.items, itemIds);
    if (!activeItems.length) {
      throw new BadRequestException("Los ítems seleccionados no están en estado sent/accepted en el NEW");
    }

    const stageName = dto.stageName?.trim() || `Integración — ${newProject.name}`;
    const snapshot = {
      items: activeItems,
      importedAt: new Date().toISOString(),
      fromProjectId: newProjectId,
      promotedFromSendAt: new Date().toISOString(),
    };
    const handoffDesc = buildHandoffImportDescription(activeItems, newProject.name);

    const { stage } = await this.projectsService.createStage(projectId, {
      name: stageName,
      activate: dto.activate,
    });

    await this.applyHandoffPayloadToStage(stage.id, newProjectId, snapshot, handoffDesc);
    await this.syncTracesFromHandoff(newProjectId, projectId, { items: activeItems }, stage.id);
    await this.persistHandoffItemsLegacyStage(newProjectId, activeItems.map((i) => i.id), stage.id);
    await this.finalizeHandoffStageSetup(projectId, stage.id, newProjectId, activeItems);
    await this.changeLog.log(projectId, "handoffSnapshot", `Promovido a etapa ${stage.ordinal}: ${handoffDesc}`);

    if (project.theforgeProjectId?.trim()) {
      this.theforge.scheduleAriadneBrownfieldWire(
        {
          ariadneSourceId: project.theforgeProjectId.trim(),
          workshopProjectId: projectId,
          workshopStageId: stage.id,
        },
        "Integration",
      );
    }

    const updatedStage = await this.prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    const updatedTraces = await this.listTraceRows(projectId, handoff);

    return {
      stage: {
        id: updatedStage.id,
        ordinal: updatedStage.ordinal,
        name: updatedStage.name,
        workflowStatus: updatedStage.workflowStatus,
        handoffImportedAt: updatedStage.handoffImportedAt?.toISOString() ?? null,
        linkedNewProjectId: updatedStage.linkedNewProjectId,
      },
      traces: updatedTraces,
      promotedItemIds: activeItems.map((i) => i.id),
    };
  }

  /** Snapshot deliverables, persist change spec, enrich Falkor graph after handoff import/promote. */
  private async finalizeHandoffStageSetup(
    legacyProjectId: string,
    stageId: string,
    newProjectId: string,
    activeItems: IntegrationHandoffItem[],
  ): Promise<void> {
    const [stage, projectRow] = await Promise.all([
      this.prisma.stage.findUnique({ where: { id: stageId } }),
      this.prisma.project.findUnique({ where: { id: legacyProjectId } }),
    ]);
    if (!stage || !projectRow) return;

    await persistStageDeliverableSnapshotFromProject(this.prisma, stageId, projectRow, {
      source: "manual",
    }).catch(() => {});

    let priorMdd: string | null = null;
    if (stage.ordinal > 1) {
      const prior = await this.prisma.stage.findFirst({
        where: { projectId: legacyProjectId, ordinal: stage.ordinal - 1 },
        select: { mddContent: true },
      });
      priorMdd = prior?.mddContent ?? null;
    }

    const legacyState = stage.legacyChangeState as { description?: string } | null;
    const changeSpec = buildStageChangeSpecContent({
      stageOrdinal: stage.ordinal,
      stageName: stage.name,
      priorMddExcerpt: priorMdd,
      legacyChangeDescription:
        legacyState?.description ??
        activeItems.map((i) => `${i.id}: ${i.title}`).join("; "),
      handoffItems: activeItems,
    });
    if (changeSpec) {
      await this.prisma.stage.update({
        where: { id: stageId },
        data: { changeSpecContent: changeSpec },
      });
    }

    await this.graphMemory
      .syncHandoffItemsToStage({
        newProjectId,
        legacyProjectId,
        legacyStageId: stageId,
        items: activeItems.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
        })),
      })
      .catch(() => {});
  }

  private async applyHandoffPayloadToStage(
    stageId: string,
    newProjectId: string,
    snapshot: {
      items: IntegrationHandoffItem[];
      importedAt: string;
      fromProjectId: string;
      promotedFromSendAt?: string;
    },
    handoffDesc: string,
  ) {
    const existingState =
      (await this.prisma.stage.findUnique({ where: { id: stageId }, select: { legacyChangeState: true } }))
        ?.legacyChangeState as { description?: string } | null;
    const mergedDescription = mergeHandoffIntoLegacyDescription(existingState?.description, handoffDesc);

    await this.prisma.stage.update({
      where: { id: stageId },
      data: {
        handoffSnapshot: snapshot,
        handoffImportedAt: new Date(),
        linkedNewProjectId: newProjectId,
        legacyChangeState: {
          ...(existingState && typeof existingState === "object" ? existingState : {}),
          description: mergedDescription,
        },
      },
    });
  }

  private async persistHandoffItemsLegacyStage(
    newProjectId: string,
    itemIds: string[],
    legacyStageId: string,
  ) {
    if (!itemIds.length) return;
    const project = await this.assertAccess(newProjectId);
    const handoff = this.handoffFromProject(project);
    const idSet = new Set(itemIds);
    handoff.items = handoff.items.map((item) =>
      idSet.has(item.id) ? { ...item, legacyStageId } : item,
    );
    await this.persistHandoff(newProjectId, handoff);
  }

  async updateTrace(projectId: string, traceId: string, body: unknown) {
    await this.assertAccess(projectId);
    const dto = updateIntegrationTraceBodySchema.parse(body);
    const trace = await this.prisma.integrationTrace.findFirst({
      where: {
        id: traceId,
        OR: [{ newProjectId: projectId }, { legacyProjectId: projectId }],
      },
    });
    if (!trace) throw new NotFoundException("Trace not found");
    await this.prisma.integrationTrace.update({
      where: { id: traceId },
      data: {
        legacyStoryId: dto.legacyStoryId === null ? null : dto.legacyStoryId ?? undefined,
        screenOrEndpoint: dto.screenOrEndpoint === null ? null : dto.screenOrEndpoint ?? undefined,
        status: dto.status ?? undefined,
        legacyStageId: dto.legacyStageId === null ? null : dto.legacyStageId ?? undefined,
      },
    });
    if (dto.legacyStoryId && trace.newLegId) {
      await this.graphMemory
        .syncHandoffSatisfies(trace.newProjectId, trace.legacyProjectId, trace.newLegId, dto.legacyStoryId)
        .catch(() => {});
    }
    return this.getStatus(projectId);
  }

  /** Resuelve bloques de prompt para generación MDD/HU. */
  async resolvePromptContext(projectId: string, stageId?: string | null) {
    const project = await this.assertAccess(projectId);
    const externalLegacy =
      project.projectType === "NEW" && project.linkedLegacyProjectId
        ? await this.getLegacyContextForNew(projectId)
        : null;
    const externalBlock = externalLegacy
      ? buildExternalLegacyContextBlock({
          legacyProjectId: externalLegacy.legacyProjectId,
          legacyProjectName: externalLegacy.legacyProjectName,
          apiSectionMarkdown: externalLegacy.apiSectionMarkdown,
          contextSectionMarkdown: externalLegacy.contextSectionMarkdown,
        })
      : undefined;

    let handoffItems: IntegrationHandoffItem[] = [];
    let newProjectMeta: { id: string; name: string } | undefined;
    if (project.projectType === "LEGACY" && stageId) {
      const stage = project.stages.find((s) => s.id === stageId);
      if (stage && stage.ordinal >= 2) {
        const snap = stage.handoffSnapshot as { items?: IntegrationHandoffItem[] } | null;
        if (snap?.items?.length) {
          handoffItems = snap.items;
          const npId = stage.linkedNewProjectId ?? project.linkedNewProjectId;
          if (npId) {
            const np = await this.prisma.project.findUnique({ where: { id: npId }, select: { id: true, name: true } });
            if (np) newProjectMeta = np;
          }
        }
      }
    }
    if (project.projectType === "NEW") {
      handoffItems = this.handoffFromProject(project).items;
    }

    return { externalBlock, handoffItems, newProjectMeta, handoffForNew: project.projectType === "NEW" ? handoffItems : [] };
  }

  assertHandoffGateForLegacyMdd(project: ProjectRow, stage: { ordinal: number; handoffImportedAt: Date | null }) {
    if (stage.ordinal < 2) return;
    if (process.env.LEGACY_INTEGRATION_HANDOFF_GATE !== "1") return;
    if (!project.linkedNewProjectId) return;
    if (stage.handoffImportedAt) return;
    throw new BadRequestException(
      "Importa el handoff del proyecto NEW en esta etapa antes de generate-mdd (LEGACY_INTEGRATION_HANDOFF_GATE=1).",
    );
  }

  async syncTracesFromUserStories(
    legacyProjectId: string,
    stageId: string,
    userStoriesMarkdown: string,
  ) {
    const project = await this.assertAccess(legacyProjectId);
    const newProjectId = project.linkedNewProjectId;
    if (!newProjectId) return;
    const links = parseSatisfiesLinksFromUserStories(userStoriesMarkdown);
    for (const [newLegId, legId] of links.entries()) {
      await this.prisma.integrationTrace.upsert({
        where: {
          newProjectId_legacyProjectId_newLegId: {
            newProjectId,
            legacyProjectId,
            newLegId,
          },
        },
        create: {
          newProjectId,
          legacyProjectId,
          newLegId,
          legacyStoryId: legId,
          legacyStageId: stageId,
          status: "ACCEPTED",
        },
        update: { legacyStoryId: legId, legacyStageId: stageId, status: "ACCEPTED" },
      });
      await this.graphMemory.syncHandoffSatisfies(newProjectId, legacyProjectId, newLegId, legId).catch(() => {});
    }
  }

  private async persistHandoff(projectId: string, handoff: IntegrationHandoff) {
    handoff.updatedAt = new Date().toISOString();
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        integrationHandoff: handoff as object,
        integrationHandoffUpdatedAt: new Date(),
      },
    });
    await this.changeLog.log(projectId, "integrationHandoff", JSON.stringify(handoff));
  }

  private async syncTracesFromHandoff(
    newProjectId: string,
    legacyProjectId: string,
    handoff: IntegrationHandoff,
    legacyStageId?: string,
  ) {
    for (const item of handoff.items) {
      await this.prisma.integrationTrace.upsert({
        where: {
          newProjectId_legacyProjectId_newLegId: { newProjectId, legacyProjectId, newLegId: item.id },
        },
        create: {
          newProjectId,
          legacyProjectId,
          newLegId: item.id,
          status: item.status === "sent" ? "SENT" : "DRAFT",
          legacyStageId: legacyStageId ?? undefined,
        },
        update: {
          status: item.status === "sent" ? "SENT" : undefined,
          ...(legacyStageId ? { legacyStageId } : {}),
        },
      });
    }
  }

  private async listTraceRows(projectId: string, handoff: IntegrationHandoff): Promise<IntegrationTraceRow[]> {
    const traces = await this.prisma.integrationTrace.findMany({
      where: { OR: [{ newProjectId: projectId }, { legacyProjectId: projectId }] },
      orderBy: { newLegId: "asc" },
    });
    const itemById = new Map(handoff.items.map((i) => [i.id, i]));
    return traces.map((t) => {
      const item = itemById.get(t.newLegId);
      return {
        id: t.id,
        newLegId: t.newLegId,
        legacyStoryId: t.legacyStoryId,
        legacyStageId: t.legacyStageId,
        screenOrEndpoint: t.screenOrEndpoint,
        status: t.status,
        title: item?.title ?? t.newLegId,
        description: item?.description ?? "",
        actor: item?.actor ?? null,
        acceptanceCriteria: item?.acceptanceCriteria ?? [],
      };
    });
  }
}
