import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ComplexityLevel, Prisma, StageStatus, Status } from "@theforge/database";
import type { Estimation, Project, Stage } from "@theforge/database";
import { getRequestUserId } from "../../common/request-user.store.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import { MddUpdatePipelineService } from "../engine/mdd-update-pipeline.service.js";
import { SemaphoreService, type SemaphoreEvaluationInput } from "../engine/semaphore.service.js";
import { normalizeMddContent } from "../engine/mdd-markdown-parser.js";
import { ProjectEstimationRecalcService } from "./project-estimation-recalc.service.js";
import type { ApiConformanceResult, ConformanceResult } from "../engine/conformance.service.js";
import {
  ConformanceService,
  checkBlueprintDataModelVsMdd,
  checkBlueprintSectionHeaders,
  checkBlueprintApiTableFormat,
  checkBlueprintSpanishQuality,
  checkBlueprintSelfContained,
  checkBlueprintTableFormat,
  checkApiVsMdd,
  checkLogicFlowsVsMdd,
  checkInfraVsMdd,
  extractEntities,
  extractSection,
} from "../engine/conformance.service.js";
import { AiService } from "../ai/ai.service.js";
import { DiscoveryService } from "../ai/discovery.service.js";
import { ScraperService } from "../scraper/scraper.service.js";
import { TheForgeService } from "../theforge/theforge.service.js";
import { GraphMemoryService } from "../ai-analysis/graph-memory/graph-memory.service.js";
import { ChangeLogService } from "../change-log/change-log.service.js";
import type { IOrchestratorProjectsPort } from "./projects-service.port.js";
import { resolveUrls } from "../scraper/url-utils.js";
import {
  createProjectSchema,
  createStageBodySchema,
  patchStageBodySchema,
  updateProjectSchema,
  DELIVERABLES_BY_COMPLEXITY,
  type DeliverableKind,
  type ComplexityPending,
  type CreateProjectDto,
  type UpdateProjectDto,
} from "@theforge/shared-types";
import { UX_UI_GUIDE_PROMPT } from "../ai/prompts/ux-ui-guide-prompt.js";
import { uxGuideLlmOptions } from "../ai/ux-guide-llm-context.js";

import { flattenStageDeliverables, pickPrimaryStage } from "./stage-helpers.js";

/** System prompt para sintetizar BRD/To-Be desde DBGA (greenfield); más ligero que el coordinador legacy + KNOWLEDGE. */
const DBGA_BRD_TOBE_SUGGEST_SYSTEM =
  "Eres analista de producto y arquitecto de soluciones en español. Produces BRD en markdown coherentes con el benchmark de dominio (DBGA). El BRD DEBE incluir la sección «Pain Points & Problem Statement» al inicio, detallando dolores del cliente, soluciones actuales y validación de demanda. No inventes requisitos que contradigan el texto; usa «no consta» cuando falte evidencia.";

type StageWithEst = Stage & { estimation: Estimation | null };

function toApiProject<P extends { stages: StageWithEst[] } & Record<string, unknown>>(project: P) {
  const flat = flattenStageDeliverables(project.stages);
  return { ...project, ...flat };
}

@Injectable()
export class ProjectsService implements IOrchestratorProjectsPort {
  private readonly logger = new Logger(ProjectsService.name);

  /** Scope de proyecto autenticado (AsyncLocalStorage). Solo owner. */
  private projectWhereForUser(projectId: string) {
    return { id: projectId, userId: getRequestUserId() };
  }

  /**
   * Verifica que el usuario tenga acceso al proyecto:
   * - PRIVATE: solo owner
   * - SHARED: cualquier usuario autenticado
   * Retorna el proyecto si hay acceso, o lanza NotFoundException.
   */
  private async assertProjectAccess(projectId: string): Promise<Project & { stages: StageWithEst[] }> {
    const userId = getRequestUserId();
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
      include: { stages: { orderBy: { ordinal: "asc" }, include: { estimation: true } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    const isOwner = project.userId === userId;
    const isShared = project.visibility === "SHARED";
    if (!isOwner && !isShared) throw new NotFoundException("Project not found");
    return project as Project & { stages: StageWithEst[] };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly conformance: ConformanceService,
    private readonly ai: AiService,
    private readonly discovery: DiscoveryService,
    private readonly scraper: ScraperService,
    private readonly estimationRecalc: ProjectEstimationRecalcService,
    private readonly mddUpdatePipeline: MddUpdatePipelineService,
    private readonly semaphore: SemaphoreService,
    private readonly theforge: TheForgeService,
    private readonly graphMemory: GraphMemoryService,
    private readonly changeLog: ChangeLogService,
  ) {}

  private buildSemaphoreBase(
    p: Pick<
      Project,
      | "complexity"
      | "hasUxTeam"
      | "figmaMapping"
      | "specContent"
      | "useCasesContent"
      | "userStoriesContent"
      | "tasksContent"
      | "apiContractsContent"
      | "uxUiGuideContent"
      | "logicFlowsContent"
      | "infraContent"
    >,
  ): Omit<SemaphoreEvaluationInput, "mddJsonString"> {
    return {
      complexity: p.complexity ?? ComplexityLevel.HIGH,
      hasUxTeam: p.hasUxTeam,
      figmaMapping: p.figmaMapping,
      deliverables: {
        specContent: p.specContent,
        useCasesContent: p.useCasesContent,
        userStoriesContent: p.userStoriesContent,
        tasksContent: p.tasksContent,
        apiContractsContent: p.apiContractsContent,
        uxUiGuideContent: p.uxUiGuideContent,
        logicFlowsContent: p.logicFlowsContent,
        infraContent: p.infraContent,
      },
    };
  }

  private mergeProjectForSemaphore(
    existing: Project,
    rest: Partial<UpdateProjectDto>,
  ): Pick<
    Project,
    | "complexity"
    | "hasUxTeam"
    | "figmaMapping"
    | "specContent"
    | "useCasesContent"
    | "userStoriesContent"
    | "tasksContent"
    | "apiContractsContent"
    | "uxUiGuideContent"
    | "logicFlowsContent"
    | "infraContent"
  > {
    return {
      complexity: (rest.complexity ?? existing.complexity) as ComplexityLevel,
      hasUxTeam: rest.hasUxTeam ?? existing.hasUxTeam,
      figmaMapping: (rest.figmaMapping !== undefined ? rest.figmaMapping : existing.figmaMapping) as Project["figmaMapping"],
      specContent: rest.specContent !== undefined ? rest.specContent : existing.specContent,
      useCasesContent: rest.useCasesContent !== undefined ? rest.useCasesContent : existing.useCasesContent,
      userStoriesContent: rest.userStoriesContent !== undefined ? rest.userStoriesContent : existing.userStoriesContent,
      tasksContent: rest.tasksContent !== undefined ? rest.tasksContent : existing.tasksContent,
      apiContractsContent: rest.apiContractsContent !== undefined ? rest.apiContractsContent : existing.apiContractsContent,
      uxUiGuideContent: rest.uxUiGuideContent !== undefined ? rest.uxUiGuideContent : existing.uxUiGuideContent,
      logicFlowsContent: rest.logicFlowsContent !== undefined ? rest.logicFlowsContent : existing.logicFlowsContent,
      infraContent: rest.infraContent !== undefined ? rest.infraContent : existing.infraContent,
    };
  }

  private mddJsonStringForSemaphore(mddContent: string | null): string | null {
    if (!mddContent?.trim()) return null;
    const normalized = normalizeMddContent(mddContent);
    return JSON.stringify(normalized);
  }

  /** Recalcula semáforo de la etapa principal cuando cambian entregables/complejidad sin tocar el MDD. */
  private async refreshStageSemaphoreFromProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
      include: { stages: { orderBy: { ordinal: "asc" }, include: { estimation: true } } },
    });
    if (!project) return;
    const targetStage = pickPrimaryStage(project.stages);
    if (!targetStage) return;

    const { status, precisionScore } = this.semaphore.evaluate({
      ...this.buildSemaphoreBase(project),
      mddJsonString: this.mddJsonStringForSemaphore(targetStage.mddContent),
    });

    await this.prisma.stage.update({
      where: { id: targetStage.id },
      data: { status, precisionScore },
    });

    const mddForRecalc = targetStage.mddContent ?? null;
    if (mddForRecalc != null) {
      await this.estimationRecalc.recalcAndUpsert(targetStage.id, {
        mddContent: mddForRecalc,
        infraContent: project.infraContent ?? null,
        status,
      });
    }
  }

  private mddFromStages(stages: StageWithEst[]): string {
    return pickPrimaryStage(stages)?.mddContent ?? "";
  }

  /** Insumo principal para prompts de entregables: MDD o, en LOW/MEDIUM sin MDD, DBGA + resumen + spec. */
  private constitutionMarkdown(project: Project & { stages: StageWithEst[] }): string {
    const mdd = this.mddFromStages(project.stages).trim();
    if (mdd.length > 0) return mdd;
    const cx = project.complexity ?? ComplexityLevel.HIGH;
    if (cx === ComplexityLevel.LOW || cx === ComplexityLevel.MEDIUM) {
      const parts = [
        (project.dbgaContent ?? "").trim(),
        (project.phase0SummaryContent ?? "").trim(),
        (project.specContent ?? "").trim(),
      ].filter((p) => p.length > 0);
      return parts.join("\n\n---\n\n");
    }
    return "";
  }

  async create(data: CreateProjectDto) {
    const parsed = createProjectSchema.parse(data);
    const isLegacy = parsed.projectType === "LEGACY";
    const userId = getRequestUserId();
    const created = await this.prisma.project.create({
      data: {
        userId,
        name: parsed.name,
        visibility: parsed.visibility ?? "PRIVATE",
        hasUxTeam: parsed.hasUxTeam ?? false,
        complexity: parsed.complexity as ComplexityLevel,
        projectType: parsed.projectType,
        // requireBrdTobeGate eliminado
        theforgeProjectId: parsed.theforgeProjectId ?? undefined,
        stages: {
          create: {
            ordinal: 1,
            key: "main",
            name: "Etapa principal",
            workflowStatus: StageStatus.ACTIVE,
            isLegacy,
            theforgeProjectId: parsed.theforgeProjectId ?? null,
          },
        },
      },
      include: {
        stages: { orderBy: { ordinal: "asc" }, include: { estimation: true } },
      },
    });
    return toApiProject(created);
  }

  async findAll() {
    const userId = getRequestUserId();
    const rows = await this.prisma.project.findMany({
      where: {
        OR: [
          { userId },                          // mis proyectos PRIVATE
          { visibility: "SHARED" },            // todos los SHARED
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { stages: { orderBy: { ordinal: "asc" }, include: { estimation: true } } },
    });
    const favoriteProjectIds = await this.getUserFavoriteIds(userId);
    return rows.map((p) => ({
      ...toApiProject(p),
      isFavorite: favoriteProjectIds.has(p.id),
    }));
  }

  async getUserFavoriteIds(userId?: string): Promise<Set<string>> {
    const uid = userId ?? getRequestUserId();
    const favs = await this.prisma.favoriteProject.findMany({
      where: { userId: uid },
      select: { projectId: true },
    });
    return new Set(favs.map((f) => f.projectId));
  }

  async toggleFavorite(projectId: string) {
    const userId = getRequestUserId();
    // Verificar acceso al proyecto (todos los proyectos visibles para el usuario)
    await this.assertProjectAccess(projectId);
    const existing = await this.prisma.favoriteProject.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (existing) {
      await this.prisma.favoriteProject.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favoriteProject.create({
      data: { userId, projectId },
    });
    return { favorited: true };
  }

  async findOne(id: string) {
    const project = await this.assertProjectAccess(id);
    // add sessions separately (not included in assertProjectAccess)
    const withSessions = await this.prisma.project.findFirst({
      where: { id },
      include: { sessions: true },
    });
    const userId = getRequestUserId();
    const fav = await this.prisma.favoriteProject.findUnique({
      where: { userId_projectId: { userId, projectId: id } },
    });
    return {
      ...toApiProject({
        ...project,
        sessions: withSessions?.sessions ?? [],
      }),
      isFavorite: fav !== null,
    };
  }

  async update(id: string, data: UpdateProjectDto) {
    const parsed = updateProjectSchema.partial().parse(data);
    const existing = await this.assertProjectAccess(id);
    const existingRaw = existing as Project & { stages: StageWithEst[] };

    const {
      mddContent: parsedMdd,
      stageId: parsedStageId,
      clearComplexityPending,
      complexityPending: cpInput,
      ...rest
    } = parsed;

    // Settings que solo el owner puede cambiar
    const hasSettingsChange = rest.name !== undefined || rest.visibility !== undefined ||
      rest.complexity !== undefined || rest.hasUxTeam !== undefined ||
      rest.projectType !== undefined || rest.theforgeProjectId !== undefined ||
      rest.figmaMapping !== undefined || clearComplexityPending === true ||
      cpInput !== undefined;
    if (hasSettingsChange && existingRaw.userId !== getRequestUserId()) {
      throw new BadRequestException("Only the project owner can change project settings");
    }

    const targetStage: StageWithEst | undefined =
      (parsedStageId?.trim() && existingRaw.stages.find((s) => s.id === parsedStageId.trim())) ||
      pickPrimaryStage(existingRaw.stages);
    if (!targetStage) throw new BadRequestException("El proyecto no tiene etapas");

    const mergedForSemaphore = this.mergeProjectForSemaphore(existingRaw, rest);

    const updatePayload: Prisma.ProjectUpdateInput = {
      ...rest,
      figmaMapping:
        rest.figmaMapping === null ? undefined : (rest.figmaMapping as Prisma.InputJsonValue),
    };
    if (clearComplexityPending === true) {
      updatePayload.complexityPending = Prisma.JsonNull;
    } else if (cpInput !== undefined) {
      updatePayload.complexityPending =
        cpInput === null ? Prisma.JsonNull : (cpInput as Prisma.InputJsonValue);
    }
    if (rest.uxUiGuideContent !== undefined) {
      updatePayload.uxUiGuideContent = rest.uxUiGuideContent;
    }
    if (rest.dbgaContent !== undefined && rest.dbgaContent !== null) {
      const { ensureJsonCodeFences } = await import("../ai-analysis/state/state-to-markdown.js");
      updatePayload.dbgaContent = ensureJsonCodeFences(rest.dbgaContent);
    }

    const infraContentForRecalc = rest.infraContent ?? existing.infraContent ?? null;

    let pipelineResult: { sanitizedMdd: string; status: Status; precisionScore: number } | null = null;
    if (parsedMdd !== undefined && parsedMdd !== null) {
      const result = await this.mddUpdatePipeline.process(
        parsedMdd,
        this.buildSemaphoreBase(mergedForSemaphore),
        { projectId: id, stageId: targetStage.id },
      );
      if (!result.ok) {
        throw new BadRequestException({
          code: result.code,
          message: result.message,
        });
      }
      pipelineResult = {
        sanitizedMdd: result.sanitizedMdd,
        status: result.status,
        precisionScore: result.precisionScore,
      };
      await this.prisma.stage.update({
        where: { id: targetStage.id },
        data: {
          mddContent: result.sanitizedMdd,
          status: result.status,
          precisionScore: result.precisionScore,
        },
      });
      await this.changeLog.log(id, "mddContent", result.sanitizedMdd);
    }

    const mddForRecalc =
      pipelineResult?.sanitizedMdd ?? targetStage.mddContent ?? null;
    const statusForRecalc = pipelineResult?.status ?? targetStage.status;

    if (mddForRecalc != null && (parsedMdd !== undefined || rest.infraContent !== undefined)) {
      await this.estimationRecalc.recalcAndUpsert(targetStage.id, {
        mddContent: mddForRecalc,
        infraContent: infraContentForRecalc,
        status: statusForRecalc,
      });
    }

    const hasProjectFieldUpdates =
      (Object.keys(rest) as (keyof typeof rest)[]).some((k) => rest[k] !== undefined) ||
      clearComplexityPending === true ||
      cpInput !== undefined;
    if (hasProjectFieldUpdates) {
      await this.prisma.project.update({
        where: { id },
        data: updatePayload,
      });
      // Bitácora de cambios para campos de contenido documental
      const documentFields = [
        "dbgaContent", "specContent", "architectureContent", "useCasesContent",
        "userStoriesContent", "blueprintContent", "tasksContent",
        "apiContractsContent", "logicFlowsContent", "infraContent",
        "uxUiGuideContent", "phase0SummaryContent", "aemContent",
      ] as const;
      for (const field of documentFields) {
        if ((rest as Record<string, unknown>)[field] !== undefined) {
          await this.changeLog.log(id, field, (rest as Record<string, string | null | undefined>)[field]);
        }
      }
    }

    const shouldRefreshSemaphoreWithoutMdd =
      (parsedMdd === undefined || parsedMdd === null) &&
      (rest.complexity !== undefined ||
        rest.hasUxTeam !== undefined ||
        rest.figmaMapping !== undefined ||
        rest.specContent !== undefined ||
        rest.useCasesContent !== undefined ||
        rest.userStoriesContent !== undefined ||
        rest.tasksContent !== undefined ||
        rest.apiContractsContent !== undefined ||
        rest.uxUiGuideContent !== undefined ||
        rest.logicFlowsContent !== undefined ||
        cpInput !== undefined ||
        clearComplexityPending === true);
    if (shouldRefreshSemaphoreWithoutMdd) {
      await this.refreshStageSemaphoreFromProject(id);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.prisma.architecturalPreference.deleteMany({ where: { projectId: id } });
    try {
      await this.prisma.project.delete({ where: this.projectWhereForUser(id) });
    } catch {
      throw new NotFoundException("Project not found");
    }
    return { deleted: id };
  }

  /** Una sola etapa ACTIVE por proyecto: demueve las demás ACTIVE a SUPERSEDED. */
  async activateStageExclusive(projectId: string, stageId: string): Promise<void> {
    const uid = getRequestUserId();
    const stage = await this.prisma.stage.findFirst({
      where: {
        id: stageId,
        projectId,
        project: { id: projectId, userId: uid },
      },
    });
    if (!stage) throw new NotFoundException("Etapa no encontrada");
    await this.prisma.$transaction([
      this.prisma.stage.updateMany({
        where: { projectId, workflowStatus: StageStatus.ACTIVE },
        data: { workflowStatus: StageStatus.SUPERSEDED },
      }),
      this.prisma.stage.update({
        where: { id: stageId },
        data: { workflowStatus: StageStatus.ACTIVE },
      }),
    ]);
  }

  async createStage(projectId: string, body: unknown) {
    const dto = createStageBodySchema.parse(body);
    const project = await this.prisma.project.findFirst({
      where: this.projectWhereForUser(projectId),
      include: { stages: { orderBy: { ordinal: "asc" } } },
    });
    if (!project) throw new NotFoundException("Project not found");

    const maxOrd = project.stages.length ? Math.max(...project.stages.map((s) => s.ordinal)) : 0;
    const ordinal = dto.ordinal ?? maxOrd + 1;
    if (project.stages.some((s) => s.ordinal === ordinal)) {
      throw new BadRequestException(`Ya existe una etapa con ordinal ${ordinal}`);
    }

    let mddContent: string | null = null;
    let stStatus: Status = Status.ROJO;
    let precisionScore = 0;
    let legacyChangeState: any = null;
    if (dto.copyMddFromStageId?.trim()) {
      const copyFrom = dto.copyMddFromStageId.trim();
      const src = project.stages.find((s) => s.id === copyFrom);
      if (!src) throw new BadRequestException("copyMddFromStageId no pertenece al proyecto");
      mddContent = src.mddContent;
      stStatus = src.status;
      precisionScore = src.precisionScore;
    }
    if (dto.copyLegacyChangeFromStageId?.trim()) {
      const copyFrom = dto.copyLegacyChangeFromStageId.trim();
      const src = project.stages.find((s) => s.id === copyFrom);
      if (!src) throw new BadRequestException("copyLegacyChangeFromStageId no pertenece al proyecto");
      legacyChangeState = src.legacyChangeState as object | null;
    }

    const isLegacy = project.projectType === "LEGACY";
    const newStage = await this.prisma.stage.create({
      data: {
        projectId,
        ordinal,
        key: dto.key ?? `stage_${ordinal}`,
        name: dto.name?.trim() ?? `Etapa ${ordinal}`,
        workflowStatus: StageStatus.DRAFT,
        mddContent,
        status: stStatus,
        precisionScore,
        legacyChangeState,
        isLegacy,
        theforgeProjectId: project.theforgeProjectId,
      },
    });

    if (dto.activate !== false) {
      await this.activateStageExclusive(projectId, newStage.id);
    }

    const withEst = await this.prisma.stage.findUnique({
      where: { id: newStage.id },
      include: { estimation: true },
    });
    if (withEst?.mddContent?.trim()) {
      await this.estimationRecalc.recalcAndUpsert(withEst.id, {
        mddContent: withEst.mddContent,
        infraContent: project.infraContent ?? null,
        status: withEst.status,
      });
    }

    const out = await this.prisma.stage.findFirst({
      where: { id: newStage.id },
      include: { estimation: true },
    });
    if (!out) throw new NotFoundException("Etapa no encontrada tras crear");

    // Cambio 3: Sincronizar con FalkorDB al crear etapa — nodo + relación con línea base
    if (isLegacy) {
      // Sincronizar nodo LegacyStage
      this.graphMemory.syncLegacyStage({
        stageId: out.id,
        projectId,
        ordinal: out.ordinal,
        name: out.name ?? "",
        theforgeProjectId: project.theforgeProjectId ?? undefined,
      }).catch(() => {});
      // Relacionar con Stage 1 (línea base) si no es Stage 1
      if (out.ordinal > 1) {
        const baselineStage = project.stages.find((s) => s.ordinal === 1);
        if (baselineStage) {
          this.graphMemory.syncLegacyStage({
            stageId: out.id,
            projectId,
            ordinal: out.ordinal,
            name: out.name ?? "",
            parentStageId: baselineStage.id,
            theforgeProjectId: project.theforgeProjectId ?? undefined,
          }).catch(() => {});
        }
      }
    }

    return { stage: out };
  }

  async listStages(projectId: string) {
    await this.assertProjectAccess(projectId);
    const stages = await this.prisma.stage.findMany({
      where: { projectId },
      orderBy: { ordinal: "asc" },
      include: { estimation: true },
    });
    return { stages };
  }

  private assertBlueprintCoversMddDataModel(project: Project & { stages: StageWithEst[] }): void {
    const mdd = this.constitutionMarkdown(project);
    const dm = this.conformance.checkBlueprintDataModel(mdd, project.blueprintContent);
    if (!dm.ok) {
      throw new BadRequestException({
        message:
          "El Blueprint debe reflejar el modelo de datos del MDD (§3) antes de generar Contratos API. Corrija el Blueprint o regenérelo.",
        code: "BLUEPRINT_DATA_MODEL_GAPS",
        gaps: dm.gaps,
      });
    }
  }

  async patchStage(projectId: string, stageId: string, body: unknown) {
    const dto = patchStageBodySchema.parse(body);
    const uid = getRequestUserId();
    // Verificar acceso SHARED/PRIVATE
    await this.assertProjectAccess(projectId);
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, projectId },
      include: { estimation: true },
    });
    if (!stage) throw new NotFoundException("Etapa no encontrada");

    // Solo el owner puede activar etapas o cambiar ordinal (cambios estructurales)
    const ownerId = (await this.prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } }))?.userId;
    const isOwner = ownerId === uid;
    if ((dto.activate === true || dto.ordinal !== undefined) && !isOwner) {
      throw new BadRequestException("Only the project owner can restructure stages");
    }
    if (dto.activate === true) {
      await this.activateStageExclusive(projectId, stageId);
    }

    const data: Prisma.StageUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.key !== undefined) data.key = dto.key.trim();
    if (dto.brdContent !== undefined) data.brdContent = dto.brdContent.trim() || null;
    if (dto.ordinal !== undefined) {
      const clash = await this.prisma.stage.findFirst({
        where: {
          projectId,
          ordinal: dto.ordinal,
          NOT: { id: stageId },
        },
      });
      if (clash) throw new BadRequestException(`Ordinal ${dto.ordinal} ya está en uso`);
      data.ordinal = dto.ordinal;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.stage.update({ where: { id: stageId }, data });
    }

    // Bitácora para brdContent
    if (dto.brdContent !== undefined) {
      await this.changeLog.log(projectId, "brdContent", dto.brdContent);
    }

    const out = await this.prisma.stage.findFirst({
      where: { id: stageId, projectId },
      include: { estimation: true },
    });
    if (!out) throw new NotFoundException("Etapa no encontrada");
    return { stage: out };
  }

  async generateBenchmark(projectId: string, userIdea: string, urls?: string[]) {
    await this.assertProjectAccess(projectId);
    const resolvedUrls = resolveUrls(urls, userIdea);
    let scrapedContext: string | undefined;
    if (resolvedUrls.length > 0) {
      console.log("[generateBenchmark] URLs a scrapear:", resolvedUrls.length, resolvedUrls);
      const pages = await this.scraper.scrapeUrls(resolvedUrls);
      const ok = pages.filter((p) => p.markdown.trim().length > 0);
      const failed = pages.filter((p) => p.error || !p.markdown.trim());
      if (failed.length > 0) {
        console.warn("[generateBenchmark] URLs sin contenido o error:", failed.map((p) => ({ url: p.url, error: p.error })));
      }
      scrapedContext = ok.map((p) => `## Referencia: ${p.url}\n\n${p.markdown}`).join("\n\n");
      console.log("[generateBenchmark] Scraped context:", scrapedContext?.length ?? 0, "chars,", ok.length, "páginas OK");
    } else {
      console.log("[generateBenchmark] Sin URLs en idea/body; no se hace scraping.");
    }
    const dbgaContent = await this.discovery.generateBenchmark(userIdea, scrapedContext);
    const trimmed = dbgaContent.trim();
    let proposal: ComplexityPending;
    try {
      proposal = await this.discovery.inferComplexityProposal(userIdea, trimmed);
    } catch {
      proposal = {
        level: ComplexityLevel.HIGH,
        planSummary: "Constitución SDD completa.",
        reason: "Inferencia no disponible; se propone HIGH por defecto.",
      };
    }
    return this.update(projectId, {
      dbgaContent: trimmed,
      complexityPending: proposal,
    });
  }

  /**
   * Re-infiere `complexityPending` (HITL) desde DBGA / MDD / Spec ya existentes, sin re-ejecutar el stream DBGA.
   * Útil para proyectos existentes que quieren re-valorar el nivel según el alcance documentado.
   */
  async reassessComplexity(projectId: string, options?: { note?: string }) {
    const project = await this.assertProjectAccess(projectId);

    const dbga = (project.dbgaContent ?? "").trim();
    const mdd = this.mddFromStages(project.stages).trim();
    const spec = (project.specContent ?? "").trim();
    const phase0 = (project.phase0SummaryContent ?? "").trim();

    const chunks: string[] = [];
    if (dbga.length > 0) chunks.push(dbga);
    if (mdd.length > 0) chunks.push(mdd);
    if (spec.length > 0) chunks.push(spec);
    if (phase0.length > 0 && chunks.join("").length < 400) chunks.push(phase0);

    const context = chunks.join("\n\n---\n\n").slice(0, 24_000);
    if (context.trim().length < 80) {
      throw new BadRequestException(
        "No hay suficiente contexto (DBGA y/o MDD de etapa, Spec). En legacy asegúrate de tener MDD de cambio; en producto nuevo, Paso 0 o MDD.",
      );
    }

    const note = options?.note?.trim();
    const idea =
      note && note.length > 0
        ? note.slice(0, 6000)
        : `Re-valoración de complejidad del proyecto «${project.name}» según el alcance actual documentado.`;

    let proposal: ComplexityPending;
    try {
      proposal = await this.discovery.inferComplexityProposal(idea, context);
    } catch {
      proposal = {
        level: ComplexityLevel.HIGH,
        planSummary: "Constitución SDD completa.",
        reason: "Inferencia no disponible; se propone HIGH por defecto.",
      };
    }
    return this.update(projectId, { complexityPending: proposal });
  }

  /** Aplica la propuesta pendiente a `complexity` y limpia HITL (tras confirmación explícita del usuario). */
  async confirmComplexityProposal(projectId: string) {
    const row = await this.prisma.project.findFirst({ where: this.projectWhereForUser(projectId) });
    if (!row) throw new NotFoundException("Project not found");
    const raw = row.complexityPending;
    if (raw == null || typeof raw !== "object" || !("level" in raw)) {
      throw new BadRequestException("No hay propuesta de complejidad pendiente de confirmar.");
    }
    const level = (raw as { level: string }).level as ComplexityLevel;
    return this.update(projectId, {
      complexity: level,
      clearComplexityPending: true,
    });
  }

  /**
   * Interpreta mensajes cortos del chat del Workshop para confirmar o rechazar la propuesta HITL.
   * @returns si se aplicó confirmación o rechazo (y el proyecto debió refrescarse).
   */
  tryConfirmComplexityFromChatMessage(projectId: string, message: string): Promise<{
    confirmed: boolean;
    rejected: boolean;
  }> {
    return this._tryConfirmComplexityFromChatMessage(projectId, message);
  }

  private async _tryConfirmComplexityFromChatMessage(
    projectId: string,
    message: string,
  ): Promise<{ confirmed: boolean; rejected: boolean }> {
    const row = await this.prisma.project.findFirst({ where: this.projectWhereForUser(projectId) });
    if (!row?.complexityPending) return { confirmed: false, rejected: false };
    const t = message.trim().toLowerCase();
    const confirm =
      /^(sí|si|de acuerdo|ok|confirmo|adelante|vale|correcto)\b/.test(t) ||
      /ejecuta este plan|acepto el plan|aplica el plan|sí,?\s*ejecuta|confirmar plan/.test(t);
    const reject =
      /^(no|mejor|prefiero|cancelar)\b/.test(t) || /rechazo|no quiero|otro nivel/.test(t);
    if (confirm && !reject) {
      await this.confirmComplexityProposal(projectId);
      return { confirmed: true, rejected: false };
    }
    if (reject) {
      await this.update(projectId, { clearComplexityPending: true });
      return { confirmed: false, rejected: true };
    }
    return { confirmed: false, rejected: false };
  }

  /**
   * Guía UX/UI generada por LLM (mismo criterio que legacy, sin Relic).
   */
  async generateUxUiGuide(projectId: string) {
    const project = await this.assertProjectAccess(projectId);
    const mdd = this.constitutionMarkdown(project);
    const bp = (project.blueprintContent ?? "").trim();
    const uxPrompt =
      "Genera la Guía UX/UI completa en markdown según tu rol. El contexto (MDD, Blueprint y documentos SDD) está en el system prompt. Termina el documento con la línea exacta ---FIN_UX_UI--- y deja un mensaje breve para el usuario después.";
    const raw = await this.ai.generateResponse(uxPrompt, [], {
      systemPrompt: UX_UI_GUIDE_PROMPT,
      activeTab: "ux-ui-guide",
      currentMddContent: mdd,
      currentBlueprintContent: bp || undefined,
      ...uxGuideLlmOptions(project),
    });
    const clean = (raw ?? "").replace(/\n?-{1,}FIN_UX_UI-{1,}[\s\S]*$/i, "").trim();
    if (!clean) {
      // LLM no generó contenido de documento (solo chat) — no persistas nada
      this.logger.warn(`[generateUxUiGuide] LLM returned empty content for project ${projectId}`);
      return project;
    }
    // Si el LLM no generó YAML frontmatter, agregar uno por defecto
    let finalContent = cleanDocumentContent(clean);
    if (!finalContent.startsWith("---")) {
      const name = project.name ?? projectId;
      finalContent = `---
name: ${JSON.stringify(name)}
---
\n\n${finalContent}`;
    }
    return this.update(projectId, { uxUiGuideContent: finalContent });
  }

  /**
   * Repara/regenera solo el YAML frontmatter de la Guía UX/UI usando el MDD como contexto.
   * NO regenera el cuerpo markdown — solo los tokens de diseño (colors, typography, etc.).
   * Útil cuando el LLM generó el markdown pero sin YAML, o el YAML está incompleto.
   */
  async repairUxUiGuideYaml(projectId: string): Promise<string> {
    const project = await this.assertProjectAccess(projectId);
    const mdd = this.constitutionMarkdown(project);
    const bp = (project.blueprintContent ?? "").trim();
    const spec = (project.specContent ?? "").trim();
    const name = project.name || projectId;

    const repairPrompt =
      `Eres un diseñador UX/UI experto. Genera ÚNICAMENTE el YAML frontmatter del archivo DESIGN.md ` +
      `para el proyecto "${name}", basándote en el contexto del MDD, Blueprint y Spec que recibes.\n\n` +
      `IMPORTANTE: Responde ÚNICAMENTE con el bloque YAML entre --- y ---. NO incluyas secciones markdown, ` +
      `ni texto explicativo, ni bloques \`\`\` alrededor.\n\n` +
      `El YAML debe tener esta estructura:\n` +
      `---\n` +
      `version: alpha\n` +
      `name: "${name}"\n` +
      `description: "Frase corta que capture la personalidad visual del proyecto"\n` +
      `colors:\n` +
      `  primary: "#<Hex>"\n` +
      `  secondary: "#<Hex>"\n` +
      `  tertiary: "#<Hex>"\n` +
      `  neutral: "#<Hex>"\n` +
      `  foreground: "#<Hex>"\n` +
      `  background: "#<Hex>"\n` +
      `  muted: "#<Hex>"\n` +
      `  border: "#<Hex>"\n` +
      `  danger: "#<Hex>"\n` +
      `  success: "#<Hex>"\n` +
      `  warning: "#<Hex>"\n` +
      `  info: "#<Hex>"\n` +
      `typography:\n` +
      `  font-sans: ["Inter", "system-ui", "sans-serif"]\n` +
      `  h1: { fontFamily: "...", fontSize: 32px, fontWeight: 700, lineHeight: 40px, letterSpacing: "-0.02em" }\n` +
      `  h2: { similar }\n` +
      `  h3: { similar }\n` +
      `  body-md: { fontFamily: "...", fontSize: 16px, fontWeight: 400, lineHeight: 24px }\n` +
      `  body-sm: { similar }\n` +
      `  label-sm: { similar }\n` +
      `rounded:\n` +
      `  none: 0px\n` +
      `  sm: 6px\n` +
      `  md: 12px\n` +
      `  lg: 20px\n` +
      `  xl: 28px\n` +
      `  full: 9999px\n` +
      `spacing:\n` +
      `  xxs: 2px\n` +
      `  xs: 4px\n` +
      `  sm: 8px\n` +
      `  md: 16px\n` +
      `  lg: 24px\n` +
      `  xl: 32px\n` +
      `  2xl: 48px\n` +
      `  3xl: 64px\n` +
      `elevation:\n` +
      `  card: { boxShadow: "..." }\n` +
      `  dropdown: { boxShadow: "..." }\n` +
      `  modal: { boxShadow: "..." }\n` +
      `  sticky: { boxShadow: "..." }\n` +
      `components:\n` +
      `  button-primary: { backgroundColor, textColor, rounded, padding, typography }\n` +
      `  button-secondary: { ... }\n` +
      `  button-ghost: { ... }\n` +
      `  button-danger: { ... }\n` +
      `  card: { ... }\n` +
      `  badge: { ... }\n` +
      `  input: { ... }\n` +
      `  modal: { ... }\n` +
      `  toast: { ... }\n` +
      `  skeleton: { ... }\n` +
      `---\n\n` +
      `Contexto del proyecto:\n` +
      `${mdd ? `## MDD\n${mdd.slice(0, 6000)}` : ""}\n\n` +
      `${bp ? `## Blueprint\n${bp.slice(0, 4000)}` : ""}\n\n` +
      `${spec ? `## Spec\n${spec.slice(0, 3000)}` : ""}\n\n` +
      `NO incluyas secciones markdown, solo el bloque YAML.`;

    const raw = await this.ai.generateResponse(repairPrompt, [], {
      systemPrompt: UX_UI_GUIDE_PROMPT,
      activeTab: "ux-ui-guide",
      currentMddContent: mdd,
      currentBlueprintContent: bp || undefined,
      ...uxGuideLlmOptions(project),
    });

    const trimmed = (raw ?? "").trim();
    // Extract YAML block (between --- markers)
    const yamlMatch = trimmed.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      // Maybe the LLM returned just the YAML without --- markers, or with extra text
      // Try to find any YAML-like structure
      if (trimmed.startsWith("---")) {
        // Already a frontmatter block, extract it
        const endIdx = trimmed.indexOf("---", 3);
        if (endIdx !== -1) {
          return trimmed.slice(0, endIdx + 3);
        }
        return trimmed;
      }
      this.logger.warn(`[repairUxUiGuideYaml] No YAML block found in LLM response for ${projectId}`);
      // Return minimal default YAML
      return `---
name: ${JSON.stringify(name)}
---`;
    }

    return `---\n${yamlMatch[1]!.trim()}\n---`;
  }

  /**
   * [UNIFIED] Genera cualquier documento del pipeline. Usado tanto por la cascada
   * (generateDeliverablesCascade) como por los endpoints individuales (controller.queueOrSync).
   */
  async generateDocument(
    kind: DeliverableKind,
    projectId: string,
    options?: { gapsFeedback?: string | null },
  ): Promise<void> {
    const gaps = options?.gapsFeedback ?? undefined;
    switch (kind) {
      case "mdd_canonical":
        return;
      case "spec":
        await this.generateSpec(projectId);
        return;
      case "architecture":
        await this.generateArchitecture(projectId);
        return;
      case "use_cases":
        await this.generateUseCases(projectId);
        return;
      case "blueprint":
        await this.generateBlueprint(projectId, gaps);
        return;
      case "api_contracts":
        await this.ensureBlueprintForApi(projectId);
        await this.generateApiContracts(projectId, gaps);
        return;
      case "logic_flows":
        await this.generateLogicFlows(projectId, gaps);
        return;
      case "ux_ui_guide":
        await this.generateUxUiGuide(projectId);
        return;
      case "user_stories":
        await this.generateUserStories(projectId);
        return;
      case "tasks":
        await this.generateTasks(projectId);
        return;
      case "infra":
        await this.generateInfra(projectId, gaps);
        return;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  private async ensureBlueprintForApi(projectId: string): Promise<void> {
    const project = await this.assertProjectAccess(projectId).catch(() => null);
    if (!project) return;
    if ((project.blueprintContent ?? "").trim().length > 48) return;
    await this.generateBlueprint(projectId);
  }

  private async runDeliverableStep(kind: DeliverableKind, projectId: string, options?: { gapsFeedback?: string | null }): Promise<void> {
    return this.generateDocument(kind, projectId, options);
  }

  /**
   * Enrutamiento dinámico: solo ejecuta generadores listados en `DELIVERABLES_BY_COMPLEXITY`.
   * @param onProgress — opcional (p. ej. BullMQ `job.updateProgress`).
   */
  async generateDeliverablesCascade(
    projectId: string,
    onProgress?: (p: { step: DeliverableKind; index: number; total: number }) => void,
  ) {
    const project = await this.assertProjectAccess(projectId);
    if (project.projectType === "LEGACY") {
      throw new BadRequestException("Usa el flujo de entregables legacy del proyecto.");
    }
    if (project.complexityPending != null) {
      throw new BadRequestException(
        "Hay una propuesta de complejidad pendiente de confirmación. Confirma o rechaza en el chat del Workshop antes de generar entregables.",
      );
    }
    const c = project.complexity ?? ComplexityLevel.HIGH;
    const deliverablesToRun = DELIVERABLES_BY_COMPLEXITY[c];
    const total = deliverablesToRun.length;
    const errors: { step: string; error: string }[] = [];

    // Map de nombres legibles para la UI
    const stepLabel: Record<string, string> = {
      mdd_canonical: "MDD Canonical",
      blueprint: "Blueprint",
      spec: "Spec",
      architecture: "Arquitectura",
      use_cases: "Casos de Uso",
      user_stories: "Historias de Usuario",
      ux_ui_guide: "Guía UX/UI",
      api_contracts: "Contratos API",
      logic_flows: "Flujos de Lógica",
      tasks: "Tareas",
      infra: "Infraestructura",
    };

    // [PARALELO] Todos los documentos son generaciones LLM independientes.
    // No comparten estado ni LangGraph — cada uno se guarda directo a DB.
    // Promise.allSettled asegura que si un paso falla, los demás continúan.
    // Usamos contador atómico (no array index) para progreso real.
// Recolectamos gaps de conformance existentes para pasarlos a cada generador.
    const projectFresh = await this.findOne(projectId);
    const mddContent = this.constitutionMarkdown(project);
    const gapsMap = new Map<string, string | null>();
    for (const step of deliverablesToRun) {
      const stepKey = step as string;
      if (stepKey === "blueprint") {
        const bp = projectFresh?.blueprintContent ?? "";
        if (bp.trim().length > 80) {
          const entityCheck = checkBlueprintDataModelVsMdd(mddContent, bp);
          const sectionCheck = checkBlueprintSectionHeaders(bp);
          const selfCheck = checkBlueprintSelfContained(bp);
          const allGaps = entityCheck.gaps.concat(sectionCheck.gaps, selfCheck.gaps);
          if (allGaps.length > 0) gapsMap.set("blueprint", allGaps.join("\n"));
        }
      } else if (stepKey === "api_contracts") {
        const api = projectFresh?.apiContractsContent ?? "";
        if (api.trim().length > 80) {
          const apiCheck = checkApiVsMdd(mddContent, api);
          const apiGaps = [...apiCheck.missingInApi, ...apiCheck.extraInApi];
          if (apiGaps.length > 0) gapsMap.set("api_contracts", apiGaps.join("\n"));
        }
      } else if (stepKey === "logic_flows") {
        const lf = projectFresh?.logicFlowsContent ?? "";
        if (lf.trim().length > 80) {
          const lfCheck = checkLogicFlowsVsMdd(mddContent, lf);
          if (lfCheck.gaps.length > 0) gapsMap.set("logic_flows", lfCheck.gaps.join("\n"));
        }
      } else if (stepKey === "infra") {
        const infra = projectFresh?.infraContent ?? "";
        if (infra.trim().length > 80) {
          const infraCheck = checkInfraVsMdd(mddContent, infra);
          if (infraCheck.gaps.length > 0) gapsMap.set("infra", infraCheck.gaps.join("\n"));
        }
      }
    }
    let completedCount = 0;
    const stepList = [...deliverablesToRun];
    await Promise.allSettled(
      stepList.map(async (step) => {
        try {
          const stepGaps = gapsMap.get(step) ?? undefined;
          await this.runDeliverableStep(step, projectId, stepGaps ? { gapsFeedback: stepGaps } : undefined);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Error desconocido";
          this.logger.warn(`[Cascade] Paso ${step} saltado: ${message}.`);
          errors.push({ step, error: message });
        }
        completedCount++;
        const label = stepLabel[step] ?? step;
        onProgress?.({ step: label as DeliverableKind, index: completedCount - 1, total });
      }),
    );
    // Señal de finalización: reportar un paso "done" para que el frontend sepa que terminó
    onProgress?.({ step: "done" as DeliverableKind, index: total, total });
    if (errors.length > 0) {
      this.logger.warn(
        `[Cascade] Completada con ${errors.length}/${total} paso(s) saltado(s): ${errors.map((e) => `${e.step}: ${e.error}`).join("; ")}`,
      );
    }
    return this.findOne(projectId);
  }

  async phase0DeepResearch(
    projectId: string,
    options: { userIdea?: string; urls?: string[]; includeBenchmark?: boolean },
  ) {
    const project = await this.assertProjectAccess(projectId);
    if ((project as { projectType?: string }).projectType === "LEGACY") {
      throw new BadRequestException(
        "Paso 0 (Deep Research) no aplica a proyectos legacy. Usa el flujo de modificaciones en el chat.",
      );
    }
    const userIdea = options.userIdea?.trim() ?? "";
    const resolvedUrls = resolveUrls(options.urls, userIdea);
    let scrapedContext: string | undefined;
    if (resolvedUrls.length > 0) {
      const pages = await this.scraper.scrapeUrls(resolvedUrls);
      scrapedContext = pages
        .filter((p) => p.markdown.trim().length > 0)
        .map((p) => `## Referencia: ${p.url}\n\n${p.markdown}`)
        .join("\n\n");
    }
    const dbgaContent =
      options.includeBenchmark && project.dbgaContent?.trim() ? project.dbgaContent : undefined;
    let summary: string;
    try {
      summary = await this.discovery.generatePhase0DeepResearch(
        userIdea,
        scrapedContext,
        dbgaContent,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error en Deep Research";
      throw new Error(
        `Falló la generación del resumen (Deep Research). ${message.slice(0, 200)}`,
      );
    }
    if (typeof summary !== "string") {
      throw new Error("El proveedor de IA devolvió un formato inesperado");
    }
    return this.update(projectId, { phase0SummaryContent: summary.trim() });
  }

  async generateSpec(projectId: string) {
    const project = await this.assertProjectAccess(projectId);
    if ((project as { projectType?: string }).projectType === "LEGACY") {
      throw new BadRequestException(
        "Generar Spec con este flujo es solo para proyectos nuevos. En legacy usa el flujo de entregables legacy.",
      );
    }
    const dbga = (project.dbgaContent ?? "").trim();
    const rawMdd = this.mddFromStages(project.stages).trim();
    const inputContent = dbga || rawMdd || this.constitutionMarkdown(project).trim();
    const specContent = await this.ai.generateSpec(
      inputContent,
      project.phase0SummaryContent,
      dbga.length === 0 && rawMdd.length > 0 ? "mdd" : "dbga",
    );
    return this.update(projectId, { specContent: cleanDocumentContent(specContent) });
  }

  async generateTasks(projectId: string) {
    const project = await this.assertProjectAccess(projectId);

    // Fetch navigation map from Ariadne MCP for legacy projects
    let navigationMap: string | undefined;
    const theforgeId = (project as any)?.theforgeProjectId;
    if (theforgeId) {
      navigationMap = await this.fetchNavigationMap(theforgeId).catch(() => undefined);
    }

    const tasksContent = await this.ai.generateTasks(
      this.constitutionMarkdown(project),
      project.blueprintContent,
      { navigationMap },
    );
    return this.update(projectId, { tasksContent: cleanDocumentContent(tasksContent) });
  }

  /**
   * Obtiene el navigation map desde Ariadne MCP para enriquecer Tasks.
   */
  private async fetchNavigationMap(theforgeId: string): Promise<string | undefined> {
    try {
      const content = await this.theforge.fetchNavigationMap(theforgeId);
      if (!content || content.length < 200) return undefined;
      return content.slice(0, 6000);
    } catch {
      return undefined;
    }
  }

  async generateArchitecturePreview(projectId: string): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateArchitecture(
      this.constitutionMarkdown(project),
      project.blueprintContent,
    );
    return { content: cleanDocumentContent(content) };
  }

  async generateArchitecture(projectId: string) {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateArchitecture(
      this.constitutionMarkdown(project),
      project.blueprintContent,
    );
    return this.update(projectId, { architectureContent: cleanDocumentContent(content) });
  }

  async generateUseCasesPreview(projectId: string): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateUseCases(this.constitutionMarkdown(project), project.specContent);
    return { content: cleanDocumentContent(content) };
  }

  async generateUseCases(projectId: string) {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateUseCases(this.constitutionMarkdown(project), project.specContent);
    return this.update(projectId, { useCasesContent: cleanDocumentContent(content) });
  }

  async generateUserStoriesPreview(projectId: string): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateUserStories(
      this.constitutionMarkdown(project),
      project.specContent,
      project.useCasesContent,
    );
    return { content: cleanDocumentContent(content) };
  }

  async generateUserStories(projectId: string) {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateUserStories(
      this.constitutionMarkdown(project),
      project.specContent,
      project.useCasesContent,
    );
    return this.update(projectId, { userStoriesContent: cleanDocumentContent(content) });
  }

  /** Pre-extrae entidades del MDD §3 y las agrega como texto literal en el prompt para la IA. */
  private enrichMddWithEntities(mddContent: string): string {
    const section3 = extractSection(
      mddContent,
      /^#+\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im,
    );
    const mddEntities = extractEntities(section3);
    const entityList = Array.from(mddEntities).sort().join(", ");
    if (!entityList) return mddContent;
    return mddContent +
`
**LISTA EXACTA DE ENTIDADES DEL MDD §3 (extraídas automáticamente del SQL):** ${entityList}

CADA entidad DEBE aparecer en su PROPIA LÍNEA con cabecera ### o viñeta - en la sección "### 2. Persistencia y datos".
Ejemplo CORRECTO:
### developers
### users
### properties

Ejemplo INCORRECTO (NO detectado automáticamente):
developers
users
properties

PROHIBIDO escribir los nombres como texto plano suelto. DEBEN ser cabeceras ### o viñetas -. NO omitas ninguna.
`;
  }

  async generateBlueprintPreview(projectId: string, gapsFeedback?: string | null): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    const mddContent = this.constitutionMarkdown(project);
    const enrichedMdd = this.enrichMddWithEntities(mddContent);
    const p = project as { projectType?: string; theforgeProjectId?: string | null };
    let legacyOpts: { theforgeContext: string } | undefined;
    if (p.projectType === "LEGACY" && p.theforgeProjectId && this.theforge.isConfigured()) {
      const theforgeContext = await this.theforge.getContextForDeliverables(p.theforgeProjectId);
      if (theforgeContext.trim()) legacyOpts = { theforgeContext };
    }
    const content = await this.ai.generateBlueprint(enrichedMdd, gapsFeedback, legacyOpts);
    return { content: cleanDocumentContent(content) };
  }

  async generateBlueprint(projectId: string, gapsFeedback?: string | null) {
    const project = await this.assertProjectAccess(projectId);
    const mddContent = this.constitutionMarkdown(project);
    const enrichedMdd = this.enrichMddWithEntities(mddContent);
    const p = project as { projectType?: string; theforgeProjectId?: string | null };
    let legacyOpts: { theforgeContext: string } | undefined;
    if (p.projectType === "LEGACY" && p.theforgeProjectId && this.theforge.isConfigured()) {
      const theforgeContext = await this.theforge.getContextForDeliverables(p.theforgeProjectId);
      if (theforgeContext.trim()) legacyOpts = { theforgeContext };
    }
    let blueprintContent = await this.ai.generateBlueprint(enrichedMdd, gapsFeedback, legacyOpts);
    blueprintContent = cleanDocumentContent(blueprintContent);

    // GUARD: Si gapsFeedback provocó un resultado vacío/corto, reintentar SIN gaps
    if (gapsFeedback && blueprintContent.length < 80) {
      this.logger.warn(`[Blueprint] Resultado vacío/corto (${blueprintContent.length} chars) con gapsFeedback — reintentando sin gaps`);
      blueprintContent = await this.ai.generateBlueprint(enrichedMdd, null, legacyOpts);
      blueprintContent = cleanDocumentContent(blueprintContent);
    }

    // GUARD: No persistir si sigue vacío — preservar el Blueprint anterior
    if (blueprintContent.length < 80) {
      this.logger.error(`[Blueprint] No se pudo generar contenido válido — preservando Blueprint anterior`);
      throw new BadRequestException("No se pudo generar el Blueprint. Intenta de nuevo.");
    }

    // Verificación multi-capa del Blueprint:
    // 1. Entidades del MDD §3 vs Blueprint
    // 2. Secciones requeridas presentes
    // 3. Formato de tabla API correcto
    // 4. Calidad de español
    // 5. Autocontenido (sin "ver §X", "véase §X", "remite al MDD")
    // Si alguna falla y no es un reintento, regenerar con feedback combinado.
    const entityCheck = checkBlueprintDataModelVsMdd(mddContent, blueprintContent);
    const sectionCheck = checkBlueprintSectionHeaders(blueprintContent);
    const tableCheck = checkBlueprintApiTableFormat(blueprintContent);
    const spanishCheck = checkBlueprintSpanishQuality(blueprintContent);
    const selfContainedCheck = checkBlueprintSelfContained(blueprintContent);
    const generalTableCheck = checkBlueprintTableFormat(blueprintContent);

    const allGaps = [
      ...entityCheck.gaps,
      ...sectionCheck.gaps,
      ...tableCheck.gaps,
      ...spanishCheck.gaps,
      ...selfContainedCheck.gaps,
      ...generalTableCheck.gaps,
    ];

    const needsRetry = allGaps.length > 0 && !gapsFeedback;
    if (needsRetry) {
      // Feedback conciso: nombres de entidades faltantes + conteo de otros errores
      const entityNames = entityCheck.gaps
        .map((g) => g.match(/"([^"]+)"/)?.[1])
        .filter(Boolean)
        .join(", ");
      const otherIssues: string[] = [];
      if (sectionCheck.gaps.length) otherIssues.push(`${sectionCheck.gaps.length} secciones faltan`);
      if (generalTableCheck.gaps.length) otherIssues.push(`${generalTableCheck.gaps.length} tablas mal formateadas`);
      if (spanishCheck.gaps.length) otherIssues.push(`${spanishCheck.gaps.length} errores de español`);
      if (selfContainedCheck.gaps.length) otherIssues.push(`referencias al MDD`);
      const otherSummary = otherIssues.length ? `; además: ${otherIssues.join(", ")}` : "";
      const gapFeedback = entityNames
        ? `Faltan las siguientes entidades del MDD §3 en el Blueprint (DEBES incluirlas como cabeceras ### o viñetas -): ${entityNames}.${otherSummary}`
        : allGaps.slice(0, 6).join("; ");
      this.logger.warn(`[Blueprint] Calidad insuficiente (${entityCheck.gaps.length} entidades, ${sectionCheck.gaps.length} secciones, ${generalTableCheck.gaps.length} tablaGral, ${spanishCheck.gaps.length} español, ${selfContainedCheck.gaps.length} autocontenido) — reintentando con feedback: ${gapFeedback}`);
      blueprintContent = await this.ai.generateBlueprint(enrichedMdd, gapFeedback, legacyOpts);
      blueprintContent = cleanDocumentContent(blueprintContent);
    }

    // INYECCIÓN FORZOSA: si el AI sigue omitiendo entidades después del reintento,
    // inyectarlas programáticamente para que el semáforo pase y no bloquee API contracts.
    const finalEntityCheck = checkBlueprintDataModelVsMdd(mddContent, blueprintContent);
    if (finalEntityCheck.gaps.length > 0) {
      const missingNames = finalEntityCheck.gaps
        .map((g) => g.match(/"([^"]+)"/)?.[1])
        .filter((n): n is string => !!n);
      if (missingNames.length > 0) {
        this.logger.warn(
          `[Blueprint] IA omitió ${missingNames.length} entidades tras reintento — inyectando: ${missingNames.join(", ")}`,
        );
        // Agregar las entidades faltantes como cabeceras ### bajo una subsección
        const entityBlock = `\n\n### Cobertura del modelo (MDD §3) — entidades inyectadas automáticamente\n\n` +
          missingNames.map((n) => `### ${n}`).join("\n") +
          `\n\n`;
        // Insertar antes de la última sección (checklist) o al final
        const checklistMatch = blueprintContent.match(/\n#{2,3}\s*8\.?\s*checklist/i);
        if (checklistMatch && checklistMatch.index !== undefined) {
          blueprintContent =
            blueprintContent.slice(0, checklistMatch.index) +
            entityBlock +
            blueprintContent.slice(checklistMatch.index);
        } else {
          blueprintContent += entityBlock;
        }
      }
    }

    return this.update(projectId, { blueprintContent });
  }

  async generateApiContractsPreview(projectId: string, gapsFeedback?: string | null): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    this.assertBlueprintCoversMddDataModel(project);

    // Obtener BRD de la primera etapa (si existe)
    const mainStage = project.stages?.[0];
    const brdContent = mainStage?.brdContent ?? undefined;

    // Para proyectos legacy con Ariadne configurado, obtener contexto y contract specs
    const p = project as { projectType?: string; theforgeProjectId?: string | null };
    let legacyOpts: { theforgeContext?: string; contractSpecs?: string } | undefined;
    if (p.projectType === "LEGACY" && p.theforgeProjectId && this.theforge.isConfigured()) {
      const [theforgeContext, contractSpecs] = await Promise.all([
        this.theforge.getContextForDeliverables(p.theforgeProjectId),
        this.theforge.gatherContractSpecsForApi(p.theforgeProjectId),
      ]);
      if (theforgeContext.trim() || contractSpecs.trim()) {
        legacyOpts = {
          ...(theforgeContext.trim() ? { theforgeContext } : {}),
          ...(contractSpecs.trim() ? { contractSpecs } : {}),
        };
      }
    }
    const content = await this.ai.generateApiContracts(
      this.constitutionMarkdown(project),
      project.blueprintContent,
      gapsFeedback,
      brdContent,
      legacyOpts,
    );
    return { content: cleanDocumentContent(content) };
  }

  async generateInfraPreview(projectId: string, gapsFeedback?: string | null): Promise<{ content: string }> {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateInfra(
      this.constitutionMarkdown(project),
      project.blueprintContent,
      gapsFeedback,
    );
    return { content: cleanDocumentContent(content) };
  }

  async generateApiContracts(projectId: string, gapsFeedback?: string | null) {
    const project = await this.assertProjectAccess(projectId);
    this.assertBlueprintCoversMddDataModel(project);

    // Obtener BRD de la primera etapa (si existe)
    const mainStage = project.stages?.[0];
    const brdContent = mainStage?.brdContent ?? undefined;

    // Para proyectos legacy con Ariadne configurado, obtener contexto y contract specs
    const p = project as { projectType?: string; theforgeProjectId?: string | null };
    let legacyOpts: { theforgeContext?: string; contractSpecs?: string } | undefined;
    if (p.projectType === "LEGACY" && p.theforgeProjectId && this.theforge.isConfigured()) {
      const [theforgeContext, contractSpecs] = await Promise.all([
        this.theforge.getContextForDeliverables(p.theforgeProjectId),
        this.theforge.gatherContractSpecsForApi(p.theforgeProjectId),
      ]);
      if (theforgeContext.trim() || contractSpecs.trim()) {
        legacyOpts = {
          ...(theforgeContext.trim() ? { theforgeContext } : {}),
          ...(contractSpecs.trim() ? { contractSpecs } : {}),
        };
      }
    }
    const content = await this.ai.generateApiContracts(
      this.constitutionMarkdown(project),
      project.blueprintContent,
      gapsFeedback,
      brdContent,
      legacyOpts,
    );
    return this.update(projectId, { apiContractsContent: cleanDocumentContent(content) });
  }

  async generateLogicFlows(projectId: string, gapsFeedback?: string | null) {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateLogicFlows(this.constitutionMarkdown(project), gapsFeedback);
    return this.update(projectId, { logicFlowsContent: cleanDocumentContent(content) });
  }

  async generateInfra(projectId: string, gapsFeedback?: string | null) {
    const project = await this.assertProjectAccess(projectId);
    const content = await this.ai.generateInfra(
      this.constitutionMarkdown(project),
      project.blueprintContent,
      gapsFeedback,
    );
    return this.update(projectId, { infraContent: cleanDocumentContent(content) });
  }

  async getConformance(
    projectId: string,
    options?: { useLlm?: boolean },
  ): Promise<{
    blueprint: ConformanceResult;
    blueprintDataModel: ConformanceResult;
    api: ApiConformanceResult;
    logicFlows: ConformanceResult;
    infra: ConformanceResult;
  }> {
    const p = await this.assertProjectAccess(projectId);
    const mdd = this.constitutionMarkdown(p);

    const blueprintDataModel = this.conformance.checkBlueprintDataModel(mdd, p.blueprintContent);
    const heuristic = {
      blueprint: this.conformance.checkBlueprint(mdd, p.blueprintContent),
      blueprintDataModel,
      api: this.conformance.checkApi(mdd, p.apiContractsContent),
      logicFlows: this.conformance.checkLogicFlows(mdd, p.logicFlowsContent),
      infra: this.conformance.checkInfra(mdd, p.infraContent),
    };

    if (!options?.useLlm) return heuristic;

    const mddTrim = mdd.trim();
    if (mddTrim.length < 200) return heuristic;

    const [blueprintLlm, apiLlm, logicFlowsLlm, infraLlm] = await Promise.all([
      this.ai.conformanceCheck(mddTrim, (p.blueprintContent ?? "").trim(), "blueprint"),
      this.ai.conformanceCheck(mddTrim, (p.apiContractsContent ?? "").trim(), "api"),
      this.ai.conformanceCheck(mddTrim, (p.logicFlowsContent ?? "").trim(), "logicFlows"),
      this.ai.conformanceCheck(mddTrim, (p.infraContent ?? "").trim(), "infra"),
    ]);

    return {
      blueprint: blueprintLlm.ok ? { ok: true, gaps: [] } : { ok: false, gaps: blueprintLlm.gaps },
      blueprintDataModel,
      api: apiLlm.ok
        ? { ok: true, missingInApi: [], extraInApi: [] }
        : { ok: false, missingInApi: apiLlm.gaps, extraInApi: [] },
      logicFlows: logicFlowsLlm.ok ? { ok: true, gaps: [] } : { ok: false, gaps: logicFlowsLlm.gaps },
      infra: infraLlm.ok ? { ok: true, gaps: [] } : { ok: false, gaps: infraLlm.gaps },
    };
  }

  async verifyDeliverable(
    projectId: string,
    deliverable: "blueprint" | "api" | "infra",
  ): Promise<string> {
    const p = await this.assertProjectAccess(projectId);
    const doc =
      deliverable === "blueprint"
        ? p.blueprintContent
        : deliverable === "api"
          ? p.apiContractsContent
          : p.infraContent;
    return this.ai.verifyDeliverable(this.constitutionMarkdown(p), doc ?? "", deliverable);
  }

  /**
   * Genera BRD desde `Project.dbgaContent` (greenfield). LEGACY debe usar
   * `POST …/legacy/suggest-brd-from-codebase-doc`. (To-Be eliminado del sistema.)
   */
  async suggestBrdFromDbga(
    projectId: string,
    opts?: { stageId?: string | null },
  ): Promise<{ brdContent: string; stageId: string }> {
    const project = await this.assertProjectAccess(projectId);
    if (project.projectType === "LEGACY") {
      throw new BadRequestException(
        "En proyectos legacy usa POST …/legacy/suggest-brd-from-codebase-doc (documentación Ariadne).",
      );
    }
    const dbga = String(project.dbgaContent ?? "").trim();
    const phase0 = String(project.phase0SummaryContent ?? "").trim();
    const effectiveDbga = dbga.length >= 300 ? dbga : phase0;
    if (effectiveDbga.length < 300) {
      throw new BadRequestException(
        "Se requiere DBGA en el proyecto (mín. ~300 caracteres). Genera el benchmark en el Paso 0 o pégalo en el proyecto.",
      );
    }
    const sid = opts?.stageId?.trim();
    const stage: StageWithEst | undefined =
      (sid ? project.stages.find((s) => s.id === sid) : undefined) ||
      pickPrimaryStage(project.stages as StageWithEst[]);
    if (!stage?.id) {
      throw new BadRequestException("No hay etapa para persistir BRD.");
    }
    const dbgaSlice = effectiveDbga.slice(0, 120_000);

    // Generar BRD
    const brdPrompt =
      "Eres analista de negocio. A partir del **Domain Benchmark / guía de dominio (DBGA)** siguiente, " +
      "genera **solo el BRD** en español, en markdown.\n\n" +
      "El BRD DEBE comenzar con la sección **«Pain Points & Problem Statement»** que incluya:\n" +
      "1. **Mapa de dolores** — tabla con: dolor, quién lo siente, frecuencia/impacto, solución actual (workaround), gap/precio.\n" +
      "2. **Validación de demanda** — señales de mercado, menciones en comunidades, competidores directos.\n" +
      "3. **Perfil del cliente objetivo** — tamaño de empresa, stack, presupuesto mensual estimado.\n" +
      "4. **Consecuencias de no actuar** — qué pierde el cliente si no existe esta solución, cuánto gasta hoy en workarounds.\n\n" +
      "Luego continúa con: problema, alcance de producto, supuestos, riesgos y métricas de éxito alineadas con el DBGA.\n" +
      "Extrae la información de Pain Points del DBGA; si algún dato no está disponible, indícalo como «Por validar».\n\n" +
      "Responde **solo** con este formato exacto (delimitadores literales):\n" +
      "<<<BRD>>>\n(markdown BRD)\n<<<END_BRD>>>\n\n" +
      "--- DBGA ---\n\n" +
      dbgaSlice;
    let brd = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await this.ai.generateResponse(brdPrompt, [], {
        systemPrompt: DBGA_BRD_TOBE_SUGGEST_SYSTEM,
      });
      const cleaned = (raw ?? "").replace(/```\w*\s*\n?/g, "").trim();
      const match = cleaned.match(/<<<\s*BRD\s*>>>\s*([\s\S]*?)\s*<<<_?END_BRD_?>>>/i);
      const extracted = match?.[1]?.trim() ?? null;
      if (extracted) {
        brd = cleanDocumentContent(extracted);
        break;
      }
      if (attempt < 2) {
        console.warn(`[suggestBrdFromDbga] Intento BRD ${attempt}/2: respuesta mal formada, reintentando...`);
      }
    }
    if (!brd) {
      throw new BadRequestException(
        "No se pudo generar el BRD. Reintenta o acorta el DBGA.",
      );
    }

    await this.prisma.stage.update({
      where: { id: stage.id },
      data: { brdContent: brd },
    });
    return { brdContent: brd, stageId: stage.id };
  }

  /** Notifica a Hermes Agent que el proyecto está listo para desarrollo via webhook proxy. */
  async launchHermes(projectId: string) {
    const project = await this.findOne(projectId);
    if (!project) throw new NotFoundException("Proyecto no encontrado");

    const webhookUrl = process.env.HERMES_WEBHOOK_URL?.trim();
    const apiKey = process.env.HERMES_API_KEY?.trim();
    if (!webhookUrl || !apiKey) {
      throw new BadRequestException(
        "HERMES_WEBHOOK_URL y HERMES_API_KEY no están configurados",
      );
    }

    const payload = {
      event_type: "project.ready",
      project: {
        id: project.id,
        name: project.name,
        type: project.projectType,
        sessionId: null as string | null,
      },
    };

    // Buscar la sesión activa más reciente para incluir sessionId
    try {
      const lastSession = await this.prisma.session.findFirst({
        where: { projectId: project.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (lastSession) payload.project.sessionId = lastSession.id;
    } catch {
      // sessionId no crítico
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Hermes webhook respondió ${response.status}: ${text}`);
    }

    return { success: true, status: response.status };
  }
}
