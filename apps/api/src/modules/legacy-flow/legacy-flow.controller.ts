import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { generateCodebaseDocRequestSchema } from "@theforge/shared-types";
import { LegacyCoordinatorService } from "./legacy-coordinator.service.js";
import { ResolveChangeToFilesService } from "./resolve-change-to-files.service.js";
import { CheckNavigationImpactService } from "./check-navigation-impact.service.js";
import { LegacyTransitionService } from "./legacy-transition.service.js";

/**
 * Controlador REST del flujo legacy: inicio (AriadneSpecs MCP), respuestas, generación de MDD y de entregables en cascada.
 */
@Controller("projects/:projectId/legacy")
export class LegacyFlowController {
  constructor(
    private readonly coordinator: LegacyCoordinatorService,
    private readonly resolveChange: ResolveChangeToFilesService,
    private readonly navImpact: CheckNavigationImpactService,
    private readonly legacyTransition: LegacyTransitionService,
  ) {}

  /**
   * Resuelve los archivos a modificar a partir de una descripción de cambio.
   * Usa el navigation map del proyecto para hacer matching semántico.
   * @param projectId - ID del proyecto.
   * @param body.description - Descripción del cambio en lenguaje natural.
   * @param body.stageId - Etapa base opcional.
   * @returns suggestedFiles, affectedRoutes, sharedComponents, sddImpact.
   */
  @Post("resolve-change-to-files")
  async resolveChangeToFiles(
    @Param("projectId") projectId: string,
    @Body() body: { description?: string; stageId?: string },
  ) {
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!description) throw new BadRequestException("description is required");
    return this.resolveChange.resolve({ projectId, description, stageId: body.stageId });
  }

  /**
   * Evalúa el impacto de modificar un componente en el mapa de navegación.
   * Detecta si el componente es compartido y qué rutas afecta.
   * @param projectId - ID del proyecto.
   * @param body.componentPath - Ruta del componente a modificar.
   * @param body.stageId - Etapa base opcional.
   * @returns isShared, routesAffected, screenNames, warning.
   */
  @Post("check-navigation-impact")
  async checkNavigationImpact(
    @Param("projectId") projectId: string,
    @Body() body: { componentPath?: string; stageId?: string },
  ) {
    const componentPath = typeof body?.componentPath === "string" ? body.componentPath.trim() : "";
    if (!componentPath) throw new BadRequestException("componentPath is required");
    return this.navImpact.checkImpact(projectId, componentPath, body.stageId);
  }

  /**
   * Verifica si el proyecto puede transicionar a flujo legacy.
   * Consulta AriadneSpecs para saber si el código está indexado.
   */
  @Get("transition-status")
  async transitionStatus(@Param("projectId") projectId: string) {
    return this.legacyTransition.checkTransition(projectId);
  }

  /**
   * Ejecuta la transición a flujo legacy: crea stage baseline con navigation map.
   */
  @Post("execute-transition")
  async executeTransition(@Param("projectId") projectId: string) {
    return this.legacyTransition.executeTransition(projectId);
  }

  /**
   * Genera documentación de partida del codebase vía MCP (opcional, ideal como primer paso).
   * @param projectId - ID del proyecto (debe ser LEGACY con theforgeProjectId).
   * @returns { codebaseDoc: string } o null si TheForge no está configurado.
   */
  @Post("generate-codebase-doc")
  async generateCodebaseDoc(@Param("projectId") projectId: string, @Body() body: unknown) {
    const parsed = generateCodebaseDocRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const stageId = (body as Record<string, unknown>)?.stageId as string | undefined;
    return this.coordinator.generateCodebaseDoc(projectId, parsed.data, stageId);
  }

  /**
   * Tras 409 LEGACY_INDEX_SDD_MISMATCH: confirma si se confía en el índice MCP, en el SDD (Falkor) o continuar con advertencia.
   */
  @Post("resolve-index-sdd-conflict")
  async resolveIndexSddConflict(
    @Param("projectId") projectId: string,
    @Body() body: { choice?: "trust_index" | "trust_sdd" | "proceed_with_warnings"; stageId?: string },
  ) {
    const choice = body?.choice;
    if (choice !== "trust_index" && choice !== "trust_sdd" && choice !== "proceed_with_warnings") {
      throw new BadRequestException("body.choice debe ser trust_index | trust_sdd | proceed_with_warnings");
    }
    return this.coordinator.resolveIndexSddConflict(projectId, choice, body.stageId);
  }

  /**
   * Actualiza la documentación de partida del codebase (edición manual).
   * @param projectId - ID del proyecto.
   * @param body.codebaseDoc - Contenido Markdown de la documentación.
   * @returns { codebaseDoc: string }.
   */
  @Patch("codebase-doc")
  async updateCodebaseDoc(
    @Param("projectId") projectId: string,
    @Body() body: { codebaseDoc?: string; stageId?: string },
  ) {
    const codebaseDoc = typeof body?.codebaseDoc === "string" ? body.codebaseDoc : "";
    return this.coordinator.updateCodebaseDoc(projectId, codebaseDoc, body.stageId);
  }

  /**
   * Inicia el flujo legacy: envía la descripción al MCP AriadneSpecs y obtiene archivos a modificar y preguntas para afinar.
   * @param projectId - ID del proyecto (debe ser tipo LEGACY con theforgeProjectId).
   * @param body.description - Descripción de la modificación que quiere el usuario.
   * @returns Lista de archivos, preguntas y respuestas sugeridas (opcional).
   */
  @Post("start")
  async start(
    @Param("projectId") projectId: string,
    @Body() body: { description?: string; stageId?: string },
  ) {
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    return this.coordinator.start(projectId, description, body.stageId);
  }

  /**
   * Registra las respuestas del usuario a las preguntas del flujo. Persiste en legacyFlowState.answers.
   * @param projectId - ID del proyecto.
   * @param body.answers - Mapa índice → respuesta (p. ej. { "0": "10", "1": "30" }).
   * @returns { ok: true }.
   */
  @Post("answer")
  async answer(
    @Param("projectId") projectId: string,
    @Body() body: { answers?: Record<string, string>; stageId?: string },
  ) {
    const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};
    return this.coordinator.answer(projectId, answers, body.stageId);
  }

  /**
   * Genera el MDD de cambio a partir del estado del flujo (descripción, archivos, respuestas) y contexto AriadneSpecs. Persiste en mddContent.
   * Respuesta ligera por defecto (`ok`, `mddLength`, `wordCount`); `?includeContent=true` incluye el markdown (evitar en UI).
   */
  @Post("generate-mdd")
  async generateMdd(
    @Param("projectId") projectId: string,
    @Body() body: { stageId?: string } = {},
    @Query("includeContent") includeContent?: string,
  ) {
    return this.coordinator.generateMdd(projectId, body.stageId, {
      includeContent: includeContent === "true",
    });
  }

  /**
   * Genera borrador BRD desde `codebaseDoc` (legacy); To-Be y As-Is eliminados del sistema.
   */
  @Post("suggest-brd-from-codebase-doc")
  async suggestBrdFromCodebaseDoc(
    @Param("projectId") projectId: string,
    @Body() body: { stageId?: string },
  ) {
    return this.coordinator.suggestBrdFromCodebaseDoc(projectId, body.stageId);
  }

  /**
   * Genera en cascada todos los entregables (SPEC, Arquitectura, Casos de uso, Historias, Blueprint, Guía UX/UI, API, Flujos, Infra, Tasks) desde el MDD.
   * @param projectId - ID del proyecto (debe tener mddContent generado previamente).
   * @returns Confirmación de que la cascada terminó.
   */
  @Post("generate-deliverables")
  async generateDeliverables(
    @Param("projectId") projectId: string,
    @Body() body: { stageId?: string } = {},
  ) {
    return this.coordinator.generateDeliverables(projectId, body.stageId);
  }

  /**
   * Genera un entregable individual (documento técnico) a partir del codebaseDoc del proyecto legacy.
   * @param projectId - ID del proyecto.
   * @param body.documentType - Tipo de documento a generar: spec | architecture | use-cases | user-stories | blueprint | api-contracts | logic-flows | tasks | infra.
   * @param body.stageId - Etapa base opcional.
   * @returns { content: string; field: string }
   */
  @Post("generate-from-codebase")
  async generateFromCodebase(
    @Param("projectId") projectId: string,
    @Body() body: { documentType?: string; stageId?: string },
  ) {
    const VALID_TYPES = [
      "spec", "architecture", "use-cases", "user-stories",
      "blueprint", "api-contracts", "logic-flows", "tasks", "infra",
    ] as const;
    const docType = typeof body?.documentType === "string" ? body.documentType.trim() : "";
    if (!VALID_TYPES.includes(docType as any)) {
      throw new BadRequestException(
        `documentType debe ser uno de: ${VALID_TYPES.join(", ")}`,
      );
    }
    return this.coordinator.generateFromCodebase(projectId, docType, body.stageId);
  }
}
