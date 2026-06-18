import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  buildSpecKitBundleFiles,
  filterOpenTasks,
  parseTasksMarkdown,
  sectionToIssueLabel,
  specKitFeatureDir,
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
    const stage = pickPrimaryStage(project.stages);
    const mdd = stage?.mddContent ?? "";
    return buildSpecKitBundleFiles({
      projectName: project.name,
      featureOrdinal: stage?.ordinal ?? 1,
      mddContent: mdd,
      specContent: project.specContent,
      blueprintContent: project.blueprintContent,
      tasksContent: project.tasksContent,
      apiContractsContent: project.apiContractsContent,
      logicFlowsContent: project.logicFlowsContent,
      infraContent: project.infraContent,
      phase0SummaryContent: project.phase0SummaryContent,
      dbgaContent: project.dbgaContent,
      uxUiGuideContent: project.uxUiGuideContent,
      consumptionGuideContent: loadConsumptionGuideMarkdown(),
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
      const issueBody = [
        `**Sección:** ${t.section}`,
        `**Proyecto The Forge:** ${project.name} (\`${project.id}\`)`,
        "",
        "Generado desde `tasks.md` vía The Forge.",
      ].join("\n");
      return { title: t.title.slice(0, 240), labels, body: issueBody };
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
