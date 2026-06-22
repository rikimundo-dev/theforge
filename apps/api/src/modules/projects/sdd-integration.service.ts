import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ComplexityLevel } from "@theforge/database";
import {
  buildNextTaskDocumentLayout,
  countClarificationMarkers,
  extractTaskCheckpoints,
  filterOpenTasks,
  getNextOpenTask,
  parseTasksMarkdown,
  sectionToIssueLabel,
  specHasPendingClarificationSection,
  specKitFeatureDir,
  type NextTaskDocumentLayout,
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
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import type { ClarifySpecBody } from "@theforge/shared-types";
import {
  analyzeAgentGovernanceSlice,
  buildHermesHandoffPayload,
  buildSpecKitFilesForProject,
  buildUnifiedHandoff,
  scaffoldToRepoHandoffGovernance,
} from "./handoff-export.util.js";

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
  mddSyncQueued?: boolean;
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

  buildBundleForProject(project: ProjectWithStages): SpecKitBundleFile[] {
    return buildSpecKitFilesForProject(project, loadConsumptionGuideMarkdown());
  }

  /** Payload SDD estructurado para webhook Hermes (hashes completos, sin truncar). */
  buildHermesSddPayload(project: ProjectWithStages) {
    const unified = buildUnifiedHandoff(project, loadConsumptionGuideMarkdown());
    return buildHermesHandoffPayload(unified);
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
    const unified = buildUnifiedHandoff(project, loadConsumptionGuideMarkdown());

    if (unified.governancePersisted && unified.serializedGovernance) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { agentGovernanceContent: unified.serializedGovernance },
      });
    }

    return {
      featureDir: unified.featureDir,
      projectName: unified.projectName,
      specKitFiles: unified.specKitFiles,
      agentGovernance: scaffoldToRepoHandoffGovernance(unified.agentGovernance),
    };
  }

  /**
   * Clarify Spec pre-MDD (`/speckit.clarify` equivalent). Works on specContent without full MDD pipeline.
   */
  async clarifySpec(projectId: string, body: ClarifySpecBody): Promise<ClarifySpecResult> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const spec = (project.specContent ?? "").trim();
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
    let mddSyncQueued = false;
    if (body.persist) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { specContent: clarified },
      });
      persisted = true;
    }

    if (body.syncMdd && persisted && markerCount === 0) {
      const stage = pickPrimaryStage(project.stages);
      if (stage?.mddContent?.trim()) {
        const syncNote =
          `\n\n<!-- clarify-spec-sync ${new Date().toISOString()} -->\n` +
          `> Spec aclarado sincronizado desde clarify-spec. Revisar ambigüedades resueltas.\n`;
        await this.prisma.stage.update({
          where: { id: stage.id },
          data: {
            mddContent: `${(stage.mddContent ?? "").trim()}${syncNote}`,
          },
        });
        mddSyncQueued = true;
      }
    }

    return {
      clarifiedSpec: clarified,
      clarificationMarkerCount: markerCount,
      persisted,
      mddSyncQueued,
    };
  }

  /**
   * Unified cross-artifact analyze report (`/speckit.analyze` + ConformanceService).
   */
  async analyzeArtifacts(projectId: string): Promise<SddAnalyzeReport> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const mdd = (stage?.mddContent ?? "").trim();
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

    const conformance = {
      blueprint: this.conformance.checkBlueprint(mdd, project.blueprintContent),
      blueprintDataModel: this.conformance.checkBlueprintDataModel(mdd, project.blueprintContent),
      api: this.conformance.checkApi(mdd, project.apiContractsContent),
      logicFlows: this.conformance.checkLogicFlows(mdd, project.logicFlowsContent),
      infra: this.conformance.checkInfra(mdd, project.infraContent),
    };

    const tasksMd = project.tasksContent ?? "";
    const parsed = parseTasksMarkdown(tasksMd);
    const open = filterOpenTasks(parsed);
    const spec = project.specContent ?? "";

    const wordCount = (s: string | null | undefined) =>
      (s ?? "").trim() ? (s ?? "").trim().split(/\s+/).length : 0;

    const crossArtifactGaps: string[] = [];
    if (!spec.trim()) crossArtifactGaps.push("Spec ausente — generar antes del plan");
    if (!project.blueprintContent?.trim()) crossArtifactGaps.push("Blueprint/plan ausente");
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

    const agentGov = analyzeAgentGovernanceSlice(project);
    if (!agentGov.present) {
      crossArtifactGaps.push("Gobernanza IA no generada — recomendada para handoff");
    } else {
      if (agentGov.missingRequiredPaths.length > 0) {
        crossArtifactGaps.push(
          ...agentGov.missingRequiredPaths.map((p) => `[Gobernanza] Falta ruta obligatoria: ${p}`),
        );
      }
      if (!agentGov.pathAlignmentOk) {
        crossArtifactGaps.push(
          "Gobernanza IA: espejos docs/sdd incompletos (ejecutar export reconciliado)",
        );
      }
    }

    const gapCount = crossArtifactGaps.length;
    let status: SddAnalyzeStatus = "ok";
    const complexity = project.complexity ?? ComplexityLevel.HIGH;
    const govBlockHigh =
      complexity === ComplexityLevel.HIGH &&
      agentGov.present &&
      agentGov.missingRequiredPaths.length > 0;

    if (!mdd || gapCount > 8 || govBlockHigh) status = "blocked";
    else if (gapCount > 0) status = "warnings";

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
          present: !!(project.blueprintContent ?? "").trim(),
          wordCount: wordCount(project.blueprintContent),
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
          present: !!(project.apiContractsContent ?? "").trim(),
          wordCount: wordCount(project.apiContractsContent),
        },
        logicFlows: {
          present: !!(project.logicFlowsContent ?? "").trim(),
          wordCount: wordCount(project.logicFlowsContent),
        },
        infra: {
          present: !!(project.infraContent ?? "").trim(),
          wordCount: wordCount(project.infraContent),
        },
        agentGovernance: agentGov,
      },
      conformance,
      crossArtifactGaps,
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
  } & NextTaskDocumentLayout> {
    const project = await this.loadProject(projectId);
    const stage = pickPrimaryStage(project.stages);
    const tasksMd = project.tasksContent ?? "";
    const { task, openCount } = this.getNextImplementationTask(tasksMd);
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);
    const governancePresent = !!(project.agentGovernanceContent?.trim());
    return {
      projectId: project.id,
      projectName: project.name,
      openCount,
      task,
      ...buildNextTaskDocumentLayout(featureDir, governancePresent),
      implementHint:
        "Lee IMPLEMENT.md → .specify/memory/constitution.md → tasks en specs/NNN-slug/tasks.md",
    };
  }

  async converge(projectId: string, persist = false): Promise<ConvergeResult> {
    const project = await this.loadProject(projectId);
    const tasksMd = (project.tasksContent ?? "").trim();
    if (!tasksMd) {
      throw new BadRequestException("Genera tasks.md antes de ejecutar converge");
    }

    const stage = pickPrimaryStage(project.stages);
    const mdd = (stage?.mddContent ?? "").trim();
    const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

    const openTasks = filterOpenTasks(parseTasksMarkdown(tasksMd));
    const conformanceGaps = this.collectConformanceGaps(mdd, project);

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
      await this.prisma.project.update({
        where: { id: project.id },
        data: { tasksContent: suggestedTasksMarkdown },
      });
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

  private collectConformanceGaps(mdd: string, project: Project): string[] {
    if (!mdd) return ["MDD vacío: no se puede verificar conformidad"];
    const gaps: string[] = [];
    const bp = this.conformance.checkBlueprint(mdd, project.blueprintContent);
    if (!bp.ok) gaps.push(...bp.gaps.map((g) => `[Blueprint] ${g}`));
    const api = this.conformance.checkApi(mdd, project.apiContractsContent);
    if (!api.ok) {
      gaps.push(...api.missingInApi.map((g) => `[API falta] ${g}`));
      gaps.push(...api.extraInApi.map((g) => `[API extra] ${g}`));
    }
    const lf = this.conformance.checkLogicFlows(mdd, project.logicFlowsContent);
    if (!lf.ok) gaps.push(...lf.gaps.map((g) => `[Flujos] ${g}`));
    const inf = this.conformance.checkInfra(mdd, project.infraContent);
    if (!inf.ok) gaps.push(...inf.gaps.map((g) => `[Infra] ${g}`));
    return gaps;
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
