import { BadRequestException, Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { generateCodebaseDocRequestSchema } from "@theforge/shared-types";
import { LegacyCoordinatorService } from "./legacy-coordinator.service.js";

/**
 * Controlador REST del flujo legacy: inicio (AriadneSpecs MCP), respuestas, generación de MDD y de entregables en cascada.
 */
@Controller("projects/:projectId/legacy")
export class LegacyFlowController {
  constructor(private readonly coordinator: LegacyCoordinatorService) {}

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
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown del MDD generado.
   */
  @Post("generate-mdd")
  async generateMdd(
    @Param("projectId") projectId: string,
    @Body() body: { stageId?: string } = {},
  ) {
    return this.coordinator.generateMdd(projectId, body.stageId);
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
}
