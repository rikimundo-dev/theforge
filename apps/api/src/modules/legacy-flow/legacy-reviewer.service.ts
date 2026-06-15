import { Injectable } from "@nestjs/common";
import { AIFactory } from "../ai/ai.factory.js";
import { getRequestUserId } from "../../common/request-user.store.js";
import type { TheForgeFileToModify } from "../theforge/theforge.service.js";
import { countMddCodePathReferences } from "../theforge/theforge-evidence-context.util.js";
import { loadLegacyKnowledgePack } from "./knowledge-loader.js";

const KNOWLEDGE = loadLegacyKnowledgePack();

const REVIEWER_SYSTEM =
  "Eres un revisor del flujo legacy. Tu rol es validar salidas antes de presentarlas al usuario: coherencia, completitud, alineación con el contrato. " +
  "Responde solo con el contenido aprobado (sin comentarios meta), o con correcciones mínimas si algo es ambiguo o incompleto.\n\nConocimiento base:\n---\n" +
  KNOWLEDGE +
  "\n---";

/**
 * Revisor del flujo legacy: valida y opcionalmente corrige la lista de archivos y preguntas (start)
 * y el borrador del MDD antes de presentarlos al usuario o persistirlos.
 */
@Injectable()
export class LegacyReviewerService {
  constructor(private readonly aiFactory: AIFactory) {}

  /**
   * Revisa la lista de archivos a modificar y preguntas antes de devolverlas al usuario.
   * Elimina rutas inventadas y preguntas que no sean de negocio. Conserva repoId por path.
   * @param description - Descripción de la modificación.
   * @param filesToModify - Lista de archivos (path + repoId).
   * @param questions - Preguntas para afinar.
   * @returns Lista revisada de archivos (path + repoId) y preguntas.
   */
  async reviewStartResult(
    description: string,
    filesToModify: TheForgeFileToModify[],
    questions: string[],
  ): Promise<{ filesToModify: TheForgeFileToModify[]; questions: string[] }> {
    const paths = filesToModify.map((f) => f.path);
    const pathToRepoId = new Map(paths.map((_, i) => [filesToModify[i]!.path, filesToModify[i]!.repoId]));
    const input = JSON.stringify({ description, filesToModify: paths, questions });
    const prompt =
      "Revisa que la lista de archivos a modificar y las preguntas sean coherentes. " +
      "filesToModify: solo rutas REALES que existan en el proyecto indexado (no inventar nombres; si el proyecto no tiene .java no devolver archivos .java). " +
      "questions: solo preguntas de negocio/funcionalidad; NO incluyas '¿hay otros componentes a considerar?'. " +
      "Responde ÚNICAMENTE con un JSON válido: {\"filesToModify\": string[], \"questions\": string[]}. " +
      "Elimina de filesToModify cualquier ruta que parezca inventada o que no corresponda al stack real del proyecto.\n\n" +
      input;
    try {
      const provider = await this.aiFactory.createForUser(getRequestUserId());
      const out = await provider.generateResponse(prompt, [], { systemPrompt: REVIEWER_SYSTEM });
      const trimmed = out.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(trimmed) as { filesToModify?: string[]; questions?: string[] };
      const keptPaths = Array.isArray(parsed?.filesToModify) ? parsed.filesToModify.filter((f) => typeof f === "string") : paths;
      const files: TheForgeFileToModify[] = keptPaths.map((path) => ({
        path,
        repoId: pathToRepoId.get(path) ?? "",
      }));
      const qs = Array.isArray(parsed?.questions) ? parsed.questions.filter((q) => typeof q === "string") : questions;
      return { filesToModify: files, questions: qs };
    } catch {
      return { filesToModify, questions };
    }
  }

  /**
   * Revisa el borrador del MDD de cambio para coherencia y completitud. Devuelve el markdown revisado o el mismo si no hay cambios.
   * @param description - Descripción del cambio.
   * @param mddDraft - Borrador del MDD en Markdown.
   * @returns Contenido del MDD revisado.
   */
  async reviewMdd(
    description: string,
    mddDraft: string,
    options?: { asIsBaseline?: boolean },
  ): Promise<string> {
    const refHint =
      countMddCodePathReferences(mddDraft) < 3
        ? "ADVERTENCIA SDD: el borrador casi no cita rutas de archivo (`ruta/archivo.ts`). Enriquece cada sección aplicable con paths concretos alineados al contexto del cambio y al índice TheForge.\n\n"
        : "";
    const prompt = options?.asIsBaseline
      ? refHint +
        "Revisa el MDD **AS-IS** (etapa inicial legacy — sistema existente, sin proyecto de modificación). " +
        "Asegura coherencia y completitud con la evidencia del codebase. " +
        "**§1 Contexto:** propósito y alcance = describir el sistema **en su estado actual**. " +
        "PROHIBIDO lenguaje de modificación, MVP pendiente, «incorporar funcionalidades del BRD» o delta de cambio. " +
        "Responde ÚNICAMENTE con el markdown del MDD revisado (sin comentarios adicionales).\n\nMDD borrador:\n---\n" +
        mddDraft +
        "\n---"
      : refHint +
        "Revisa el siguiente MDD de cambio para un proyecto legacy. Asegura que sea coherente con la descripción del cambio y completo. " +
        "Responde ÚNICAMENTE con el markdown del MDD revisado (sin comentarios adicionales).\n\nDescripción del cambio:\n---\n" +
        description +
        "\n---\n\nMDD borrador:\n---\n" +
        mddDraft +
        "\n---";
    try {
      const provider = await this.aiFactory.createForUser(getRequestUserId());
      const out = await provider.generateResponse(prompt, [], { systemPrompt: REVIEWER_SYSTEM });
      return out?.trim() ?? mddDraft;
    } catch {
      return mddDraft;
    }
  }
}
