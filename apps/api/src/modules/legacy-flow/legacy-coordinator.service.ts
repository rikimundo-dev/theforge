import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ComplexityLevel } from "@theforge/database";
import { DELIVERABLES_BY_COMPLEXITY, type DeliverableKind } from "@theforge/shared-types";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type { TheForgeFileToModify } from "../theforge/theforge.service.js";
import { TheForgeService } from "../theforge/theforge.service.js";
import { AiService } from "../ai/ai.service.js";
import { LegacyReviewerService } from "./legacy-reviewer.service.js";
import { loadLegacyKnowledgePack } from "./knowledge-loader.js";
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import { UX_UI_GUIDE_PROMPT } from "../ai/prompts/ux-ui-guide-prompt.js";

const KNOWLEDGE = loadLegacyKnowledgePack();

export interface LegacyFlowState {
  description?: string;
  /** Archivos a modificar; cada uno con path y repoId (multi-repo). Compatible con formato antiguo string[]. */
  filesToModify?: TheForgeFileToModify[] | string[];
  questions?: string[];
  /** Respuestas sugeridas por TheForge (codebase); el usuario puede editarlas */
  suggestedAnswers?: Record<string, string>;
  answers?: Record<string, string>;
  /** Documentación de partida del codebase (opcional, generada vía MCP antes del flujo de modificación). */
  codebaseDoc?: string;
}

const COORDINATOR_SYSTEM =
  "Eres el coordinador del flujo legacy. Orquestas análisis del código (TheForge), preguntas al usuario y generación de documentos (MDD, SPEC, etc.). " +
  "Usa el conocimiento base para mantener coherencia y cascada specification-driven.\n\nConocimiento base:\n---\n" +
  KNOWLEDGE +
  "\n---";

/**
 * Extrae una cadena JSON de un texto que puede ser JSON directo o markdown con bloque de código.
 * @param text - Texto que puede contener JSON o ```json ... ```.
 * @returns Cadena JSON extraída.
 */
function extractJsonFromText(text: string): string {
  const t = text.trim();
  if (t.startsWith("[")) return t;
  if (t.startsWith("{")) return t;
  const jsonBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  return jsonBlock ? jsonBlock[1].trim() : t;
}

/** Normaliza filesToModify del estado (puede ser string[] legacy) a TheForgeFileToModify[]. */
function normalizeFilesToModify(raw: LegacyFlowState["filesToModify"], defaultRepoId: string): TheForgeFileToModify[] {
  if (!raw?.length) return [];
  return raw.map((f) =>
    typeof f === "string" ? { path: f, repoId: defaultRepoId } : { path: f.path, repoId: f.repoId ?? "" },
  );
}

/**
 * Coordinador del flujo legacy: orquesta TheForge (archivos + preguntas), respuestas del usuario,
 * generación del MDD de cambio y cascada de entregables (SPEC → Arquitectura → … → Tasks).
 */
@Injectable()
export class LegacyCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly theforge: TheForgeService,
    private readonly ai: AiService,
    private readonly reviewer: LegacyReviewerService,
  ) {}

  /**
   * Obtiene el proyecto y valida que sea legacy y tenga theforgeProjectId.
   * @param projectId - ID del proyecto en TheForge.
   * @returns Proyecto y theforgeId; lanza si no existe, no es LEGACY o no tiene theforgeProjectId.
   */
  private async getLegacyProject(projectId: string) {
    const project = await this.projects.findOne(projectId);
    const pt = (project as { projectType?: string }).projectType;
    if (pt !== "LEGACY") {
      throw new BadRequestException("El flujo legacy solo aplica a proyectos con projectType LEGACY.");
    }
    const theforgeId = (project as { theforgeProjectId?: string | null }).theforgeProjectId;
    if (!theforgeId?.trim()) {
      throw new BadRequestException("El proyecto legacy debe tener theforgeProjectId configurado.");
    }
    return { project, theforgeId };
  }

  /**
   * Genera documentación de partida del codebase vía MCP (opcional, ideal como primer paso).
   * Consulta exhaustivamente modelos, arquitectura, stack, reglas de negocio y convenciones.
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown de la documentación o null si TheForge no está configurado.
   */
  async generateCodebaseDoc(projectId: string): Promise<{ codebaseDoc: string } | null> {
    const { theforgeId } = await this.getLegacyProject(projectId);
    if (!this.theforge.isConfigured()) return null;

    const parts: string[] = [];
    const q1 = await this.theforge.askCodebase(
      "List exhaustively: all data models, entities, tables and their fields; all API routes and services; main UI components and screens; configuration and env. This is for documentation generation — be thorough.",
      theforgeId,
    );
    if (q1.trim()) parts.push("## 1. Modelos, rutas y configuración\n\n" + q1.trim());

    const q2 = await this.theforge.askCodebase(
      "Describe architecture: folder structure, modules, how backend and frontend connect, existing patterns and conventions. Include file paths for key areas.",
      theforgeId,
    );
    if (q2.trim()) parts.push("## 2. Arquitectura y carpetas\n\n" + q2.trim());

    const q3 = await this.theforge.askCodebase(
      "What is the EXACT tech stack and directory structure of this project? List only what exists in the codebase: backend runtime and framework (e.g. Node/Express, Node/NestJS, Python/Django), frontend framework (e.g. React, Vue), database, build tools. If the project has multiple repositories, list them and their main folders. Do NOT assume or invent; only state what the codebase contains.",
      theforgeId,
    );
    if (q3.trim()) parts.push("## 3. Stack y estructura\n\n" + q3.trim());

    const q4 = await this.theforge.askCodebase(
      "What are the main business rules, validations, naming conventions, and key patterns used across the codebase? Include any domain-specific logic, constants, or shared utilities.",
      theforgeId,
    );
    if (q4.trim()) parts.push("## 4. Reglas de negocio y convenciones\n\n" + q4.trim());

    // Búsqueda semántica: enriquece con hits del grafo (componentes, funciones, archivos por término)
    const [searchModels, searchApi, searchUi] = await Promise.all([
      this.theforge.semanticSearch("data models entities database schema tables", theforgeId, 5),
      this.theforge.semanticSearch("API routes endpoints controllers services", theforgeId, 5),
      this.theforge.semanticSearch("UI components screens pages views", theforgeId, 5),
    ]);
    const searchParts: string[] = [];
    if (searchModels.trim()) searchParts.push("Modelos/entidades (búsqueda semántica):\n" + searchModels.trim());
    if (searchApi.trim()) searchParts.push("API/rutas (búsqueda semántica):\n" + searchApi.trim());
    if (searchUi.trim()) searchParts.push("Componentes/pantallas (búsqueda semántica):\n" + searchUi.trim());
    if (searchParts.length > 0) parts.push("## 5. Índice semántico del grafo\n\n" + searchParts.join("\n\n"));

    const codebaseDoc = parts.length > 0
      ? "# Documentación del Codebase (partida)\n\n" + parts.join("\n\n---\n\n")
      : "";

    const state = ((await this.projects.findOne(projectId)) as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {};
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: { ...state, codebaseDoc } as object },
    });
    return { codebaseDoc };
  }

  /**
   * Actualiza la documentación de partida del codebase (edición manual).
   * @param projectId - ID del proyecto.
   * @param codebaseDoc - Contenido Markdown.
   * @returns { codebaseDoc: string }.
   */
  async updateCodebaseDoc(projectId: string, codebaseDoc: string): Promise<{ codebaseDoc: string }> {
    await this.getLegacyProject(projectId);
    const state = ((await this.projects.findOne(projectId)) as { legacyFlowState?: LegacyFlowState | null })
      .legacyFlowState ?? {};
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: { ...state, codebaseDoc } as object },
    });
    return { codebaseDoc };
  }

  /**
   * Inicia el flujo legacy: consulta AriadneSpecs MCP (get_modification_plan o ask_codebase), obtiene archivos y preguntas,
   * pide sugerencias de respuestas al codebase y persiste todo en legacyFlowState.
   * @param projectId - ID del proyecto.
   * @param description - Descripción de la modificación que quiere el usuario.
   * @returns Lista de archivos a modificar, preguntas para afinar y respuestas sugeridas (opcional).
   */
  async start(projectId: string, description: string): Promise<{ filesToModify: TheForgeFileToModify[]; questions: string[]; suggestedAnswers?: Record<string, string> }> {
    const { theforgeId } = await this.getLegacyProject(projectId);
    const desc = (description ?? "").trim();
    if (!desc) throw new BadRequestException("description is required");

    let filesToModify: TheForgeFileToModify[] = [];
    let questions: string[] = [];

    const plan = await this.theforge.getModificationPlan(desc, theforgeId);
    if (plan) {
      filesToModify = plan.filesToModify;
      questions = plan.questionsToRefine;
    } else {
      // Fallback: cuando get_modification_plan no responde o devuelve error
      const question =
        `The user wants to make the following change to this codebase:\n\n"${desc}"\n\n` +
        `Analyze the ACTUAL indexed codebase (graph/files) for this project. Respond with a JSON object only: { "filesToModify": string[], "questions": string[] }.\n` +
        `- filesToModify: List ONLY real file paths that EXIST in this indexed project. Do NOT invent file names (e.g. no .java if the project has no Java).\n` +
        `- questions: ONLY business/functional clarifying questions. Do NOT ask "are there other components to consider?".`;
      const raw = await this.theforge.askCodebase(question, theforgeId);
      if (raw.trim()) {
        try {
          const jsonStr = extractJsonFromText(raw);
          const parsed = JSON.parse(jsonStr) as { filesToModify?: unknown; questions?: unknown };
          const paths = Array.isArray(parsed?.filesToModify) ? parsed.filesToModify.filter((f) => typeof f === "string") : [];
          filesToModify = paths.map((path) => ({ path: path as string, repoId: theforgeId }));
          questions = Array.isArray(parsed?.questions) ? parsed.questions.filter((q) => typeof q === "string") : [];
        } catch {
          questions = [raw.slice(0, 500)];
        }
      }
      questions = questions.filter((q) => !/otro(s)?\s+componente(s)?|componente(s)?\s+que\s+deba(n)?\s+considerar|other\s+component(s)?/i.test(q));
    }

    const reviewed = await this.reviewer.reviewStartResult(desc, filesToModify, questions);
    filesToModify = reviewed.filesToModify;
    questions = reviewed.questions;

    let suggestedAnswers: Record<string, string> = {};
    if (questions.length > 0) {
      const answerPrompt =
        `Change requested: "${desc.slice(0, 400)}"\n\n` +
        `Based ONLY on the codebase, answer these questions briefly (one short paragraph or bullet list per question). ` +
        `If the code does not contain the answer, use empty string for that key. ` +
        `Respond with a JSON object only, with string keys "0", "1", "2", ... (index of each question):\n\n` +
        questions.map((q, i) => `${i}. ${q}`).join("\n");
      const answerRaw = await this.theforge.askCodebase(answerPrompt, theforgeId);
      if (answerRaw.trim()) {
        try {
          const answerStr = extractJsonFromText(answerRaw);
          const parsed = JSON.parse(answerStr) as Record<string, unknown>;
          for (let i = 0; i < questions.length; i++) {
            const v = parsed[String(i)];
            if (typeof v === "string" && v.trim()) suggestedAnswers[String(i)] = v.trim();
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const state: LegacyFlowState = {
      description: desc,
      filesToModify,
      questions,
      suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined,
    };
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: state as object },
    });
    return { filesToModify, questions, suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined };
  }

  /**
   * Registra las respuestas del usuario a las preguntas del flujo. Persiste en legacyFlowState.answers.
   * @param projectId - ID del proyecto.
   * @param answers - Mapa índice de pregunta → respuesta (p. ej. { "0": "10", "1": "30" }).
   * @returns { ok: true } si se guardó correctamente.
   */
  async answer(projectId: string, answers: Record<string, string>): Promise<{ ok: boolean }> {
    const { project } = await this.getLegacyProject(projectId);
    const state = ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    const next: LegacyFlowState = { ...state, answers: answers && Object.keys(answers).length > 0 ? answers : undefined };
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: next as object },
    });
    return { ok: true };
  }

  /**
   * Genera el MDD de cambio a partir de la descripción, archivos, respuestas del usuario y contexto AriadneSpecs (múltiples ask_codebase).
   * Persiste el resultado en mddContent del proyecto.
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown del MDD generado.
   */
  async generateMdd(projectId: string): Promise<{ mddContent: string }> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const state = ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    const description = state.description ?? "";
    const files = normalizeFilesToModify(state.filesToModify, theforgeId);
    const answers = state.answers ?? {};
    const answersText = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    // Múltiples consultas a TheForge para contexto amplio (ask_codebase + semantic_search + refactor seguro)
    const theforgeParts: string[] = [];
    if (description) {
      // Búsqueda semántica con términos del cambio para descubrir archivos/símbolos relacionados
      const descTerms = description.slice(0, 200).replace(/[^\w\s]/g, " ");
      const searchRelated = await this.theforge.semanticSearch(descTerms, theforgeId, 5);
      if (searchRelated?.trim()) theforgeParts.push("Código relacionado (búsqueda semántica):\n" + searchRelated.trim());

      const q1 = await this.theforge.askCodebase(
        `For this change: "${description.slice(0, 400)}". List what ALREADY EXISTS in the codebase: data models/entities (tables, fields), API endpoints or services, and UI screens or components that touch clients, discounts, prices, price lists, campaigns, or profitability. Be exhaustive.`,
        theforgeId,
      );
      if (q1.trim()) theforgeParts.push("Existe en el codebase:\n" + q1.trim());
      const q2 = await this.theforge.askCodebase(
        `For the same change: "${description.slice(0, 400)}". What architecture patterns, module structure, and file organization does the app use in the areas affected? Which files import or depend on client, discount, or pricing logic?`,
        theforgeId,
      );
      if (q2.trim()) theforgeParts.push("Arquitectura y dependencias:\n" + q2.trim());
      const q3 = await this.theforge.askCodebase(
        `Summarize any business rules, validations, or edge cases already implemented in the codebase for: clients, discounts, price lists, campaigns, or profitability. Include where they live (file or module).`,
        theforgeId,
      );
      if (q3.trim()) theforgeParts.push("Reglas y edge cases existentes:\n" + q3.trim());
    }
    // Validación antes de editar (validate_before_edit = impacto + contrato); fallback a get_legacy_impact
    // + get_definitions (ubicación exacta) y get_functions_in_file (qué exporta el archivo)
    for (let i = 0; i < Math.min(3, files.length); i++) {
      const f = files[i]!;
      const nodeName = f.path.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "") || f.path;
      const repoId = f.repoId || theforgeId;
      const [impactBlock, defs, funcs] = await Promise.all([
        this.theforge.validateBeforeEdit(nodeName, repoId, f.path).then((b) => b || this.theforge.getLegacyImpact(nodeName, repoId, f.path)),
        this.theforge.getDefinitions(nodeName, repoId, f.path),
        this.theforge.getFunctionsInFile(f.path, repoId, f.path),
      ]);
      if (impactBlock?.trim()) theforgeParts.push(`Validación antes de editar "${f.path}":\n` + impactBlock.trim());
      if (defs?.trim()) theforgeParts.push(`Definición de "${nodeName}" (archivo:líneas):\n` + defs.trim());
      if (funcs?.trim()) theforgeParts.push(`Funciones/componentes en ${f.path}:\n` + funcs.trim());
    }
    // Contenido de los primeros 2 archivos a modificar (get_file_content) para contexto exacto
    for (let i = 0; i < Math.min(2, files.length); i++) {
      const f = files[i]!;
      const content = await this.theforge.getFileContent(f.path, f.repoId || theforgeId, undefined, f.path);
      if (content.trim()) theforgeParts.push(`Contenido de ${f.path}:\n` + content.slice(0, 3000) + (content.length > 3000 ? "\n…" : ""));
    }
    const theforgeContext = theforgeParts.join("\n\n---\n\n");
    const filesLine = files.length > 0
      ? "Archivos a modificar (path" + (files.some((x) => x.repoId) ? ", repoId" : "") + "):\n" +
        files.map((f) => (f.repoId ? `${f.path} (repoId: ${f.repoId})` : f.path)).join("\n") + "\n\n"
      : "";
    const prompt =
      "Genera un documento MDD de cambio (Markdown) para un proyecto legacy. Según Specification-Driven Development, el MDD es la **Constitución del cambio** y debe tener **exactamente 7 secciones** en este orden: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API, 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura. Aplica cada sección al **cambio** descrito (qué se modifica en contexto, stack, modelo, API, lógica, seguridad e infra).\n\n" +
      "**Prioridad:** Recupera y usa en su totalidad el conocimiento del codebase (TheForge) que se te proporciona antes de elaborar el documento. Usa TODO ese contexto; infiere todas las modificaciones necesarias en módulos, entidades, APIs y pantallas existentes que el cambio afecte; no te limites al requerimiento literal. El MDD debe reflejar el conocimiento real de la aplicación indexada (qué hay hoy y qué debe cambiar).\n\n" +
      "Descripción del cambio:\n---\n" +
      description +
      "\n---\n\n" +
      filesLine +
      (answersText ? "Respuestas del usuario:\n---\n" + answersText + "\n---\n\n" : "") +
      (theforgeContext ? "Contexto del codebase (TheForge) — incluye validaciones, definiciones exactas, funciones por archivo y búsqueda semántica. Usar TODO para inferir impacto completo:\n---\n" + theforgeContext.slice(0, 12000) + "\n---" : "");
    const mddDraft = await this.ai.generateResponse(prompt, [], { systemPrompt: COORDINATOR_SYSTEM });
    const mddContent = await this.reviewer.reviewMdd(description, mddDraft?.trim() ?? "");
    const cleaned = cleanDocumentContent(mddContent);
    await this.projects.update(projectId, { mddContent: cleaned });
    return { mddContent: cleaned };
  }

  /**
   * Genera entregables según `Project.complexity` y `DELIVERABLES_BY_COMPLEXITY` (despacho dinámico).
   * Legacy inyecta contexto AriadneSpecs en cada llamada. No ejecuta generadores fuera de la lista (ahorra tokens).
   */
  async generateDeliverables(projectId: string): Promise<{ ok: boolean }> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!row) throw new NotFoundException("Project not found");
    if (row.complexityPending != null) {
      throw new BadRequestException(
        "Hay una propuesta de complejidad pendiente de confirmación. Confirma o rechaza en el Workshop antes de generar entregables.",
      );
    }

    const codebaseDoc = String((project as { legacyFlowState?: LegacyFlowState }).legacyFlowState?.codebaseDoc ?? "").trim();
    const mddContent = String(project.mddContent ?? "").trim();
    const mdd =
      mddContent || (codebaseDoc ? `[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n${codebaseDoc}` : "");
    if (!mdd) throw new BadRequestException("Genera la documentación de partida (MDD Inicial) o el MDD de cambio antes de generar entregables.");

    const theforgeContext = await this.theforge.getContextForDeliverables(theforgeId);
    const legacyOpts = theforgeContext ? { theforgeContext } : undefined;

    const update = async (data: Record<string, unknown>) => {
      await this.prisma.project.update({ where: { id: projectId }, data: data as object });
    };

    const load = async () => {
      const p = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!p) throw new NotFoundException("Project not found");
      return p;
    };

    let p = await load();
    const isReverseEngineering = !mddContent && !!codebaseDoc;
    const complexity = isReverseEngineering ? ComplexityLevel.HIGH : (row.complexity ?? ComplexityLevel.HIGH);
    const deliverablesToRun = DELIVERABLES_BY_COMPLEXITY[complexity];

    const ensureBlueprint = async (): Promise<string> => {
      let bp = String(p.blueprintContent ?? "").trim();
      if (bp.length > 48) return bp;
      bp = await this.ai.generateBlueprint(mdd, undefined, legacyOpts);
      await update({ blueprintContent: cleanDocumentContent(bp) });
      p = await load();
      return String(p.blueprintContent ?? "").trim();
    };

    const runStep = async (kind: DeliverableKind): Promise<void> => {
      switch (kind) {
        case "mdd_canonical":
          return;
        case "spec": {
          const specContent = await this.ai.generateSpec(mdd, null, "mdd", legacyOpts);
          await update({ specContent: cleanDocumentContent(specContent) });
          p = await load();
          return;
        }
        case "architecture": {
          const architectureContent = await this.ai.generateArchitecture(
            mdd,
            p.blueprintContent ?? undefined,
            legacyOpts,
          );
          await update({ architectureContent: cleanDocumentContent(architectureContent) });
          p = await load();
          return;
        }
        case "use_cases": {
          const useCasesContent = await this.ai.generateUseCases(mdd, p.specContent, legacyOpts);
          await update({ useCasesContent: cleanDocumentContent(useCasesContent) });
          p = await load();
          return;
        }
        case "blueprint": {
          const blueprintContent = await this.ai.generateBlueprint(mdd, undefined, legacyOpts);
          await update({ blueprintContent: cleanDocumentContent(blueprintContent) });
          p = await load();
          return;
        }
        case "api_contracts": {
          const bp = await ensureBlueprint();
          const apiContractsContent = await this.ai.generateApiContracts(mdd, bp, undefined, legacyOpts);
          await update({ apiContractsContent: cleanDocumentContent(apiContractsContent) });
          p = await load();
          return;
        }
        case "logic_flows": {
          const logicFlowsContent = await this.ai.generateLogicFlows(mdd, undefined, legacyOpts);
          await update({ logicFlowsContent: cleanDocumentContent(logicFlowsContent) });
          p = await load();
          return;
        }
        case "ux_ui_guide": {
          const bp = String(p.blueprintContent ?? "").trim() || (await ensureBlueprint());
          let uxPrompt =
            "Genera la Guía UX/UI en markdown según el system prompt. MDD:\n---\n" +
            mdd.slice(0, 8000) +
            "\n---\n\nBlueprint:\n---\n" +
            bp.slice(0, 4000) +
            "\n---";
          if (theforgeContext) {
            uxPrompt =
              "**Contexto del codebase (TheForge) — priorizar y usar antes de elaborar:**\n---\n" +
              theforgeContext.slice(0, 12000) +
              "\n---\n\n**Regla obligatoria (legacy):** No inventes nada. Apégate al MDD y únicamente al conocimiento del codebase (TheForge) proporcionado arriba.\n\n**Instrucción:** Usa TODO el conocimiento anterior para alinear la guía con lo que ya existe. A continuación, MDD y Blueprint.\n\n" +
              uxPrompt;
          }
          const uxUiGuideContent = await this.ai.generateResponse(uxPrompt, [], { systemPrompt: UX_UI_GUIDE_PROMPT });
          const uxClean = (uxUiGuideContent ?? "").replace(/\n---FIN_UX_UI---.*/s, "").trim();
          await update({ uxUiGuideContent: cleanDocumentContent(uxClean) });
          p = await load();
          return;
        }
        case "user_stories": {
          const userStoriesContent = await this.ai.generateUserStories(
            mdd,
            p.specContent,
            p.useCasesContent,
            legacyOpts,
          );
          await update({ userStoriesContent: cleanDocumentContent(userStoriesContent) });
          p = await load();
          return;
        }
        case "tasks": {
          const bp = p.blueprintContent?.trim();
          const tasksContent = await this.ai.generateTasks(mdd, bp || undefined, legacyOpts);
          await update({ tasksContent: cleanDocumentContent(tasksContent) });
          p = await load();
          return;
        }
        case "infra": {
          const bp = await ensureBlueprint();
          const infraContent = await this.ai.generateInfra(mdd, bp, undefined, legacyOpts);
          await update({ infraContent: cleanDocumentContent(infraContent) });
          p = await load();
          return;
        }
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
    };

    for (const kind of deliverablesToRun) {
      await runStep(kind);
    }

    return { ok: true };
  }
}
