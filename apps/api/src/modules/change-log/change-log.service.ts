import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { getRequestUserId } from "../../common/request-user.store.js";

/**
 * Bitácora de cambios en documentos de proyecto.
 * Cada entrada registra qué campo se modificó, quién lo hizo y cuándo.
 */
@Injectable()
export class ChangeLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un cambio en la bitácora.
   * El `summary` se genera automáticamente como un resumen del contenido.
   */
  async log(
    projectId: string,
    field: string,
    content: string | null | undefined,
  ): Promise<void> {
    const userId = getRequestUserId();
    const summary = this.summarizeChange(field, content);

    await this.prisma.changeLog.create({
      data: { projectId, userId, field, summary },
    });
  }

  /**
   * Lista los cambios recientes de un proyecto, más recientes primero.
   */
  async listByProject(
    projectId: string,
    options?: { limit?: number },
  ) {
    const limit = options?.limit ?? 50;
    return this.prisma.changeLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Genera un resumen legible del cambio según el campo y contenido.
   */
  private summarizeChange(field: string, content: string | null | undefined): string {
    if (!content?.trim()) {
      return `Limpió ${this.fieldLabel(field)}`;
    }

    const trimmed = content.trim();
    const preview = trimmed.length > 120 ? trimmed.slice(0, 120) + "…" : trimmed;
    return `Actualizó ${this.fieldLabel(field)}: ${preview}`;
  }

  private fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      mddContent: "MDD",
      uxUiGuideContent: "Guía UX/UI",
      dbgaContent: "DBGA",
      specContent: "Spec",
      architectureContent: "Arquitectura",
      blueprintContent: "Blueprint",
      apiContractsContent: "Contratos API",
      useCasesContent: "Casos de Uso",
      userStoriesContent: "Historias de Usuario",
      logicFlowsContent: "Flujos de Lógica",
      tasksContent: "Tasks",
      agentGovernanceContent: "Gobernanza Agentes IA",
      infraContent: "Infraestructura",
      phase0SummaryContent: "Resumen Fase 0",
      aemContent: "AEM",
      brdContent: "BRD",
      integrationHandoff: "Handoff integración",
      handoffSnapshot: "Handoff importado",
    };
    return labels[field] ?? field;
  }
}
