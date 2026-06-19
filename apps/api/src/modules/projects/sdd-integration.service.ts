import { createHmac } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  buildHandoffMicroSpecFiles,
  buildOpenSpecChangeExport,
  buildSpecKitBundleFiles,
  checkBrdObjectiveMentionHealth,
  countClarificationMarkers,
  extractTaskCheckpoints,
  filterOpenTasks,
  getNextOpenTask,
  parseAgentGovernanceScaffold,
  parseIntegrationHandoff,
  parseTasksMarkdown,
  sectionToIssueLabel,
  specHasPendingClarificationSection,
  specKitFeatureDir,
  type IntegrationHandoffItem,
  type SddAnalyzeReport,
  type SddAnalyzeStatus,
  type SpecKitBundleFile,
  type TasksToIssuesBody,
} from "@theforge/shared-types";
import type { Project, Stage } from "@theforge/database";
import { AiService } from "../ai/ai.service.js";
import { ConformanceService } from "../engine/conformance.service.js";
import { TheForgeService } from "../theforge/theforge.service.js";
import { CONVERGE_PROMPT } from "../ai/prompts/converge-prompt.js";
import { loadConsumptionGuideMarkdown } from "./consumption-guide.util.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { getRequestUserId } from "../../common/request-user.store.js";
import { pickPrimaryStage } from "./stage-helpers.js";
import { resolveStageDeliverables } from "./stage-deliverables.util.js";
import { persistStageAndProjectDeliverables } from "./stage-deliverable-persist.util.js";
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import { validateDocumentForPersist } from "../sessions/document-shrink.util.js";
import type { ClarifySpecBody, ConvergeTriggerBody, ProjectDeliverableSource } from "@theforge/shared-types";

type ProjectWithStages = Project & {
  stages: Array<Stage & { estimation?: unknown }>;
};

export interface ConvergeResult {
  featureDir: string;
  openTaskCount: number;
  conformanceGaps: string[];
  codebaseEvidence: string | null;
  convergeSection: string;
  suggestedTasksMarkdown: string;
  persisted: boolean;
}

export interface TasksToIssuesResult {
  dryRun: boolean;
  planned: Array<{ title: string; labels: string[]; body: string }>;
  created: Array<{ number: number; html_url: string; title: string }>;
  errors: string[];
}

export interface ClarifySpecResult {
  clarifiedSpec: string;
  clarificationMarkerCount: number;
  persisted: boolean;
}

export interface RepoHandoffExport {
  featureDir: string;
  projectName: string;
  specKitFiles: SpecKitBundleFile[];
  agentGovernance: {
    present: boolean;
    files: Array<{ path: string; content: string }>;
    manifest?: Record<string, unknown>;
  };
}

@Injectable()
export class SddIntegrationService {
  private readonly logger = new Logger(SddIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conformance: ConformanceService,
    private readonly ai: AiService,
    private readonly theforge: TheForgeService,
  ) {}

  buildBundleForProject(project: ProjectWithStages, stageOverride?: Stage | null): SpecKitBundleFile[] {
    const stage = stageOverride ?? pickPrimaryStage(project.stages);
    const mdd = stage?.mddContent ?? "";
    const deliverables = stage
      ? resolveStageDeliverables(project, stage, "analyze").deliverables
      : project;
    const spec = deliverables.specContent ?? project.specContent;
    const acceptanceLines = (spec ?? "")
      .split("\n")
      .filter((l) => /aceptación|acceptance|criterio/i.test(l))
      .slice(0, 12);
    return buildSpecKitBundleFiles({
      projectName: project.name,
      featureOrdinal: stage?.ordinal ?? 1,
      mddContent: mdd,
      specContent: spec,
      blueprintContent: deliverables.blueprintContent ?? project.blueprintContent,
      tasksContent: deliverables.tasksContent ?? project.tasksContent,
      apiContractsContent: deliverables.apiContractsContent ?? project.apiContractsContent,
      logicFlowsContent: deliverables.logicFlowsContent ?? project.logicFlowsContent,
      infraContent: deliverables.infraContent ?? project.infraContent,
      phase0SummaryContent: project.phase0SummaryContent,
      dbgaContent: project.dbgaContent,
      uxUiGuideContent: deliverables.uxUiGuideContent ?? project.uxUiGuideContent,
      consumptionGuideContent: loadConsumptionGuideMarkdown(),
      changeSpecContent: stage?.changeSpecContent ?? null,
      acceptanceCriteriaLines: acceptanceLines.length ? acceptanceLines : null,
    });
  }

  /** Payload SDD para webhook Hermes (truncado para límites de transporte). */
  buildHermesSddPayload(project: ProjectWithStages): {
    format: "spec-kit-compatible";
    featureDir: string;
    implementReadme: string;
    files: Array<{ path: string; contentPreview: string; size: number }>;
    agentGovernancePresent: boolean;
  } {
    const files = this.buildBundleForProject(project);
    const stage = pickPrimaryStage(project.stages);
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);
    const maxPreview = 12_000;
    return {
      format: "spec-kit-compatible",
      featureDir,
      implementReadme:
        "Exporta el bundle SDD local desde Workshop o usa los archivos en sddBundle.files. Lee IMPLEMENT.md y THEFORGE-DOC-CONSUMPTION-GUIDE.md antes de codificar.",
      files: files.map((f) => ({
        path: f.path,
        contentPreview: f.content.length > maxPreview ? `${f.content.slice(0, maxPreview)}\n\n… [truncado]` : f.content,
        size: f.content.length,
      })),
      agentGovernancePresent: !!(project.agentGovernanceContent?.trim()),
    };
  }

  async getExportBundle(projectId: string): Promise<{
    featureDir: string;
    projectName: string;
    files: SpecKitBundleFile[];
  }> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    return {
      featureDir: specKitFeatureDir(stage?.ordinal ?? 1, project.name),
      projectName: project.name,
      files: this.buildBundleForProject(project),
    };
  }

  /**
   * Bundle completo para "Llevar al repo": spec-kit + agent governance + IMPLEMENT.md + consumption guide.
   */
  async getRepoHandoffExport(projectId: string): Promise<RepoHandoffExport> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const specKitFiles = this.buildBundleForProject(project, stage);
    const rawGov = project.agentGovernanceContent?.trim() ?? "";
    const scaffold = rawGov ? parseAgentGovernanceScaffold(rawGov) : null;

    const handoffItems = this.readHandoffItemsForStage(project, stage);
    const legacyState = (stage?.legacyChangeState ?? null) as { description?: string } | null;
    const openSpecFiles =
      (stage?.ordinal ?? 1) >= 2
        ? buildOpenSpecChangeExport({
            stageOrdinal: stage?.ordinal ?? 1,
            projectName: project.name,
            changeSpecContent: stage?.changeSpecContent,
            legacyChangeDescription: legacyState?.description ?? null,
            handoffItems,
          })
        : [];
    const microSpecs = handoffItems.length ? buildHandoffMicroSpecFiles(handoffItems) : [];

    return {
      featureDir: specKitFeatureDir(stage?.ordinal ?? 1, project.name),
      projectName: project.name,
      specKitFiles: [...specKitFiles, ...openSpecFiles, ...microSpecs],
      agentGovernance: {
        present: !!(scaffold?.files?.length),
        files: (scaffold?.files ?? []).map((f) => ({ path: f.path, content: f.content })),
        manifest: scaffold?.manifest as Record<string, unknown> | undefined,
      },
    };
  }

  private readHandoffItemsForStage(
    project: ProjectWithStages,
    stage: Stage | null | undefined,
  ): IntegrationHandoffItem[] {
    if (!stage || stage.ordinal < 2) return [];
    const snap = stage.handoffSnapshot as { items?: IntegrationHandoffItem[] } | null;
    if (snap?.items?.length) return snap.items;
    if (project.projectType === "NEW") {
      return parseIntegrationHandoff(project.integrationHandoff).items;
    }
    return [];
  }

  /**
   * Clarify Spec pre-MDD (`/speckit.clarify` equivalent). Works on specContent without full MDD pipeline.
   */
  async clarifySpec(projectId: string, body: ClarifySpecBody): Promise<ClarifySpecResult> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const deliverables = stage
      ? resolveStageDeliverables(project, stage, "analyze").deliverables
      : {};
    const spec = (deliverables.specContent ?? project.specContent ?? "").trim();
    const dbga = (project.dbgaContent ?? project.phase0SummaryContent ?? "").trim();
    const brd = (stage?.brdContent ?? "").trim();

    if (!spec && !dbga && !brd) {
      throw new BadRequestException(
        "Genera Spec, DBGA o BRD antes de ejecutar clarify-spec",
      );
    }

    const clarified = cleanDocumentContent(
      await this.ai.clarifySpec(spec, {
        dbgaContent: dbga || null,
        brdContent: brd || null,
        notes: body.notes ?? null,
      }),
    );
    const markerCount = countClarificationMarkers(clarified);
    let persisted = false;
    if (body.persist) {
      const validation = validateDocumentForPersist(spec, clarified, {
        fieldLabel: "Spec",
        minBodyChars: spec.length > 0 ? 80 : 120,
      });
      if (!validation.ok) {
        throw new BadRequestException(validation.message);
      }
      if (stage?.id) {
        await persistStageAndProjectDeliverables(this.prisma, stage.id, project.id, {
          specContent: clarified,
        });
      } else {
        await this.prisma.project.update({
          where: { id: project.id },
          data: { specContent: clarified },
        });
      }
      persisted = true;
    }
    return { clarifiedSpec: clarified, clarificationMarkerCount: markerCount, persisted };
  }

  /**
   * Unified cross-artifact analyze report (`/speckit.analyze` + ConformanceService).
   */
  async analyzeArtifacts(projectId: string, stageId?: string): Promise<SddAnalyzeReport> {
    const project = await this.loadProject(projectId);
    const stage = this.resolveAnalysisStage(project, stageId);
    const deliverables = resolveStageDeliverables(project, stage, "analyze").deliverables;
    const mdd = (stage?.mddContent ?? "").trim();
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

    const conformance = {
      blueprint: this.conformance.checkBlueprint(mdd, deliverables.blueprintContent ?? null),
      blueprintDataModel: this.conformance.checkBlueprintDataModel(mdd, deliverables.blueprintContent ?? null),
      api: this.conformance.checkApi(mdd, deliverables.apiContractsContent ?? null),
      logicFlows: this.conformance.checkLogicFlows(mdd, deliverables.logicFlowsContent ?? null),
      infra: this.conformance.checkInfra(mdd, deliverables.infraContent ?? null),
    };

    const tasksMd = deliverables.tasksContent ?? "";
    const parsed = parseTasksMarkdown(tasksMd);
    const open = filterOpenTasks(parsed);
    const spec = deliverables.specContent ?? "";

    const wordCount = (s: string | null | undefined) =>
      (s ?? "").trim() ? (s ?? "").trim().split(/\s+/).length : 0;

    const crossArtifactGaps: string[] = [];
    if (!spec.trim()) crossArtifactGaps.push("Spec ausente — generar antes del plan");
    if (!deliverables.blueprintContent?.trim()) crossArtifactGaps.push("Blueprint/plan ausente");
    if (!tasksMd.trim()) crossArtifactGaps.push("Tasks ausente — requerido para implementación");
    if (countClarificationMarkers(spec) > 0) {
      crossArtifactGaps.push(
        `${countClarificationMarkers(spec)} marcador(es) [NEEDS CLARIFICATION] en Spec`,
      );
    }
    if (!conformance.blueprint.ok) {
      crossArtifactGaps.push(...conformance.blueprint.gaps.map((g) => `[Blueprint] ${g}`));
    }
    if (!conformance.blueprintDataModel.ok) {
      crossArtifactGaps.push(
        ...conformance.blueprintDataModel.gaps.map((g) => `[Blueprint §3] ${g}`),
      );
    }
    if (!conformance.api.ok) {
      crossArtifactGaps.push(...conformance.api.missingInApi.map((g) => `[API falta] ${g}`));
    }
    if (!conformance.logicFlows.ok) {
      crossArtifactGaps.push(...conformance.logicFlows.gaps.map((g) => `[Flujos] ${g}`));
    }
    if (!conformance.infra.ok) {
      crossArtifactGaps.push(...conformance.infra.gaps.map((g) => `[Infra] ${g}`));
    }

    const gapCount = crossArtifactGaps.length;
    let status: SddAnalyzeStatus = "ok";
    if (!mdd || gapCount > 8) status = "blocked";
    else if (gapCount > 0) status = "warnings";

    const brdHealth = checkBrdObjectiveMentionHealth(stage?.brdContent, mdd);
    if (!brdHealth.ok && brdHealth.warnings.length) {
      crossArtifactGaps.push(...brdHealth.warnings.map((w) => `[BRD health] ${w}`));
      if (status === "ok") status = "warnings";
    }

    const score = Math.max(0, Math.min(100, 100 - gapCount * 8));

    return {
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      projectName: project.name,
      featureDir,
      semaphore: (stage?.status as SddAnalyzeReport["semaphore"]) ?? null,
      artifacts: {
        mdd: { present: mdd.length > 0, wordCount: wordCount(mdd) },
        spec: {
          present: spec.trim().length > 0,
          wordCount: wordCount(spec),
          clarificationMarkerCount: countClarificationMarkers(spec),
          hasPendingClarificationSection: specHasPendingClarificationSection(spec),
        },
        blueprint: {
          present: !!(deliverables.blueprintContent ?? "").trim(),
          wordCount: wordCount(deliverables.blueprintContent),
        },
        tasks: {
          present: tasksMd.trim().length > 0,
          totalTasks: parsed.length,
          openTasks: open.length,
          doneTasks: parsed.length - open.length,
          parallelizableOpen: open.filter((t) => t.parallel).length,
          checkpoints: extractTaskCheckpoints(tasksMd),
        },
        apiContracts: {
          present: !!(deliverables.apiContractsContent ?? "").trim(),
          wordCount: wordCount(deliverables.apiContractsContent),
        },
        logicFlows: {
          present: !!(deliverables.logicFlowsContent ?? "").trim(),
          wordCount: wordCount(deliverables.logicFlowsContent),
        },
        infra: {
          present: !!(deliverables.infraContent ?? "").trim(),
          wordCount: wordCount(deliverables.infraContent),
        },
      },
      conformance,
      crossArtifactGaps,
      brdHealth,
      summary: {
        status,
        score,
        headline:
          status === "ok"
            ? "Artefactos alineados — listo para implementación"
            : status === "warnings"
              ? `${gapCount} hallazgo(s) de consistencia`
              : "Bloqueos críticos — resolver antes de implementar",
      },
    };
  }

  /** Next open task for MCP implement (lightweight `/speckit.implement` hint). */
  getNextImplementationTask(tasksMarkdown: string): {
    task: ReturnType<typeof getNextOpenTask>;
    openCount: number;
  } {
    const items = parseTasksMarkdown(tasksMarkdown);
    const open = filterOpenTasks(items);
    return { task: getNextOpenTask(items), openCount: open.length };
  }

  /** Next open task for a project (MCP / GET next-task). */
  async loadProjectForNextTask(projectId: string): Promise<{
    projectId: string;
    projectName: string;
    featureDir: string;
    openCount: number;
    task: ReturnType<typeof getNextOpenTask>;
  }> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const tasksMd = project.tasksContent ?? "";
    const { task, openCount } = this.getNextImplementationTask(tasksMd);
    return {
      projectId: project.id,
      projectName: project.name,
      featureDir: specKitFeatureDir(stage?.ordinal ?? 1, project.name),
      openCount,
      task,
    };
  }

  async converge(projectId: string, persist = false, stageId?: string): Promise<ConvergeResult> {
    const project = await this.loadProject(projectId);
    const stage = this.resolveAnalysisStage(project, stageId);
    const deliverables = resolveStageDeliverables(project, stage, "analyze").deliverables;
    const tasksMd = (deliverables.tasksContent ?? "").trim();
    if (!tasksMd) {
      throw new BadRequestException("Genera tasks.md antes de ejecutar converge");
    }

    const mdd = (stage?.mddContent ?? "").trim();
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

    const openTasks = filterOpenTasks(parseTasksMarkdown(tasksMd));
    const conformanceGaps = this.collectConformanceGaps(mdd, deliverables);

    let codebaseEvidence: string | null = null;
    const tfId = stage?.theforgeProjectId ?? project.theforgeProjectId;
    if (tfId && this.theforge.isConfigured() && openTasks.length > 0) {
      const sample = openTasks
        .slice(0, 15)
        .map((t, i) => `${i + 1}. [${t.section}] ${t.title}`)
        .join("\n");
      const question =
        `Para el proyecto legacy, indica qué tareas del plan parecen YA implementadas en el codebase ` +
        `y cuáles faltan. Responde en markdown con secciones "Implementado" y "Pendiente".\n\nTareas:\n${sample}`;
      try {
        const raw = await this.theforge.askCodebase(question, tfId, {
          responseMode: "raw_evidence",
          deterministicRetriever: true,
        });
        codebaseEvidence = raw.trim().slice(0, 16_000) || null;
      } catch (err) {
        this.logger.warn(
          `converge askCodebase failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const userPrompt = [
      "## Tareas abiertas del plan",
      openTasks.length > 0
        ? openTasks.map((t) => `- [ ] [${t.section}] ${t.title}`).join("\n")
        : "(ninguna — revisa gaps de conformidad)",
      "",
      "## Gaps de conformidad (MDD vs entregables)",
      conformanceGaps.length > 0 ? conformanceGaps.map((g) => `- ${g}`).join("\n") : "(sin gaps detectados)",
      "",
      "## Evidencia codebase (Ariadne)",
      codebaseEvidence ?? "(no disponible — THEFORGE_MCP_URL o theforgeProjectId ausente)",
    ].join("\n");

    const convergeSection = (
      await this.ai.generateResponse(userPrompt, [], { systemPrompt: CONVERGE_PROMPT })
    ).trim();

    const normalizedSection = convergeSection.startsWith("##")
      ? convergeSection
      : `## Tareas pendientes (converge)\n\n${convergeSection}`;

    let suggestedTasksMarkdown = tasksMd;
    if (!tasksMd.includes("## Tareas pendientes (converge)")) {
      suggestedTasksMarkdown = `${tasksMd.trim()}\n\n---\n\n${normalizedSection}\n`;
    } else {
      suggestedTasksMarkdown = tasksMd.replace(
        /## Tareas pendientes \(converge\)[\s\S]*$/m,
        normalizedSection,
      );
    }

    let persisted = false;
    if (persist) {
      if (stage?.id) {
        await persistStageAndProjectDeliverables(this.prisma, stage.id, project.id, {
          tasksContent: suggestedTasksMarkdown,
        });
      } else {
        await this.prisma.project.update({
          where: { id: project.id },
          data: { tasksContent: suggestedTasksMarkdown },
        });
      }
      persisted = true;
    }

    return {
      featureDir,
      openTaskCount: openTasks.length,
      conformanceGaps,
      codebaseEvidence,
      convergeSection: normalizedSection,
      suggestedTasksMarkdown,
      persisted,
    };
  }

  /**
   * Minimal CI hook: converge + optional webhook POST (env CONVERGE_WEBHOOK_URL or body override).
   */
  async triggerConverge(
    projectId: string,
    body: ConvergeTriggerBody,
    stageId?: string,
  ): Promise<ConvergeResult & { webhookSent: boolean; webhookUrl: string | null }> {
    const project = await this.loadProject(projectId);
    const result = await this.converge(projectId, body.persist, stageId);
    const webhookUrl =
      (body.webhookUrl ?? project.convergeWebhookUrl ?? process.env.CONVERGE_WEBHOOK_URL ?? "").trim() ||
      null;
    const webhookSecret = (project.convergeWebhookSecret ?? "").trim() || null;
    let webhookSent = false;
    if (webhookUrl) {
      try {
        const payload = JSON.stringify({
          event: "theforge.converge",
          projectId,
          stageId: stageId ?? null,
          ...result,
        });
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (webhookSecret) {
          const signature = createHmac("sha256", webhookSecret).update(payload).digest("hex");
          headers["X-TheForge-Signature"] = `sha256=${signature}`;
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: payload,
        });
        webhookSent = res.ok;
        if (!res.ok) {
          this.logger.warn(`converge webhook ${webhookUrl} responded ${res.status}`);
        }
      } catch (err) {
        this.logger.warn(
          `converge webhook failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { ...result, webhookSent, webhookUrl };
  }

  async tasksToIssues(projectId: string, body: TasksToIssuesBody): Promise<TasksToIssuesResult> {
    const project = await this.loadProject(projectId);
    const tasksMd = (project.tasksContent ?? "").trim();
    if (!tasksMd) {
      throw new BadRequestException("Genera tasks.md antes de exportar a GitHub Issues");
    }

    const token = process.env.GITHUB_TOKEN?.trim();
    if (!body.dryRun && !token) {
      throw new BadRequestException(
        "GITHUB_TOKEN no está configurado en el servidor para crear issues",
      );
    }

    const openTasks = filterOpenTasks(parseTasksMarkdown(tasksMd));
    if (openTasks.length === 0) {
      throw new BadRequestException("No hay tareas abiertas (- [ ]) en tasks.md");
    }

    const baseLabels = body.labels ?? ["theforge", "sdd"];
    const planned = openTasks.map((t) => {
      const labels = [...new Set([...baseLabels, sectionToIssueLabel(t.section)])];
      const pathsNote =
        t.filePaths.length > 0 ? `\n**Archivos:** ${t.filePaths.map((p) => `\`${p}\``).join(", ")}` : "";
      const parallelNote = t.parallel ? "\n**Paralelizable:** sí (`[P]`)" : "";
      const issueBody = [
        `**Sección:** ${t.section}`,
        t.checkpoint ? `**Checkpoint:** ${t.checkpoint}` : "",
        `**Proyecto The Forge:** ${project.name} (\`${project.id}\`)`,
        pathsNote,
        parallelNote,
        "",
        "Generado desde `tasks.md` vía The Forge.",
      ]
        .filter((line) => line !== "")
        .join("\n");
      return { title: (t.cleanTitle || t.title).slice(0, 240), labels, body: issueBody };
    });

    const created: TasksToIssuesResult["created"] = [];
    const errors: string[] = [];

    if (body.dryRun) {
      return { dryRun: true, planned, created, errors };
    }

    for (const item of planned) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues`,
          {
            method: "POST",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
              title: item.title,
              body: item.body,
              labels: item.labels,
              ...(body.milestone ? { milestone: body.milestone } : {}),
            }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errors.push(`${item.title}: HTTP ${res.status} ${text.slice(0, 200)}`);
          continue;
        }
        const json = (await res.json()) as { number: number; html_url: string; title: string };
        created.push({
          number: json.number,
          html_url: json.html_url,
          title: json.title,
        });
      } catch (err) {
        errors.push(`${item.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { dryRun: false, planned, created, errors };
  }

  private collectConformanceGaps(mdd: string, project: ProjectDeliverableSource): string[] {
    if (!mdd) return ["MDD vacío: no se puede verificar conformidad"];
    const gaps: string[] = [];
    const bp = this.conformance.checkBlueprint(mdd, project.blueprintContent ?? null);
    if (!bp.ok) gaps.push(...bp.gaps.map((g) => `[Blueprint] ${g}`));
    const api = this.conformance.checkApi(mdd, project.apiContractsContent ?? null);
    if (!api.ok) {
      gaps.push(...api.missingInApi.map((g) => `[API falta] ${g}`));
      gaps.push(...api.extraInApi.map((g) => `[API extra] ${g}`));
    }
    const lf = this.conformance.checkLogicFlows(mdd, project.logicFlowsContent ?? null);
    if (!lf.ok) gaps.push(...lf.gaps.map((g) => `[Flujos] ${g}`));
    const inf = this.conformance.checkInfra(mdd, project.infraContent ?? null);
    if (!inf.ok) gaps.push(...inf.gaps.map((g) => `[Infra] ${g}`));
    return gaps;
  }

  private resolveAnalysisStage(project: ProjectWithStages, stageId?: string) {
    if (stageId) {
      const found = project.stages.find((s) => s.id === stageId);
      if (!found) throw new NotFoundException("Etapa no encontrada");
      return found;
    }
    const primary = pickPrimaryStage(project.stages);
    if (!primary) throw new BadRequestException("El proyecto no tiene etapas");
    return primary;
  }

  private async loadProject(projectId: string): Promise<ProjectWithStages> {
    const userId = getRequestUserId();
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
      include: { stages: { orderBy: { ordinal: "asc" } } },
    });
    if (!project) throw new NotFoundException("Proyecto no encontrado");
    const isOwner = project.userId === userId;
    const isShared = project.visibility === "SHARED";
    if (!isOwner && !isShared) throw new NotFoundException("Proyecto no encontrado");
    return project as ProjectWithStages;
  }
}
