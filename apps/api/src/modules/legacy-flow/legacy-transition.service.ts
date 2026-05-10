/**
 * @fileoverview **LegacyTransitionService** — Detecta cuando un proyecto NEW tiene
 * código indexado en AriadneSpecs y ofrece migrar al flujo legacy.
 *
 * Flujo:
 * 1. Al iniciar un cambio, la UI consulta si el proyecto puede migrar
 * 2. El sistema verifica si el proyecto tiene theforgeProjectId y repos indexados
 * 3. Si sí → ofrece migrar a flujo legacy
 * 4. Si el usuario acepta → genera navigation map inicial y configura stage baseline
 */
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";

export interface LegacyTransitionStatus {
  canTransition: boolean;
  /** Razón por la que NO puede migrar */
  reason?: string;
  /** Cantidad de repos indexados encontrados */
  indexedRepos?: number;
  /** Cantidad de rutas detectadas (si ya hay nav map) */
  detectedRoutes?: number;
}

export interface LegacyTransitionResult {
  success: boolean;
  stageId?: string;
  navigationRoutes?: number;
}

@Injectable()
export class LegacyTransitionService {
  private readonly logger = new Logger(LegacyTransitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Verifica si un proyecto NEW puede transicionar a flujo legacy.
   * @param projectId - ID del proyecto en TheForge.
   * @returns Status con información de la transición posible.
   */
  async checkTransition(projectId: string): Promise<LegacyTransitionStatus> {
    const project = await this.prisma.project
      .findFirst({ where: { id: projectId } })
      .catch(() => null);

    if (!project) {
      return { canTransition: false, reason: "Proyecto no encontrado." };
    }

    // Already legacy?
    if ((project as any).projectType === "LEGACY") {
      return { canTransition: false, reason: "El proyecto ya usa flujo legacy." };
    }

    // Check if it has a theforgeProjectId (link to Ariadne)
    const theforgeId = (project as any)?.theforgeProjectId;
    if (!theforgeId) {
      return {
        canTransition: false,
        reason: "El proyecto no tiene repositorio vinculado. Indexa el código en AriadneSpecs primero.",
      };
    }

    // Verify the Ariadne project exists and has indexed repos
    try {
      const mcpUrl = process.env.ARIADNE_MCP_URL ?? "http://ariadne-mcp:3101";
      const response = await fetch(`${mcpUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN ?? ""}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "generate_navigation_map",
            arguments: { projectId: theforgeId, scope: "full" },
          },
          id: 1,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return {
          canTransition: false,
          reason: "El repositorio vinculado no tiene código indexado en AriadneSpecs. Realiza un sync primero.",
        };
      }

      const data = await response.json() as any;
      const content = data?.result?.content?.[0]?.text ?? "";
      const routeCount = (content.match(/^##\s+\//gm) ?? []).length;

      return {
        canTransition: routeCount > 0,
        indexedRepos: 1,
        detectedRoutes: routeCount,
        reason: routeCount === 0
          ? "El repositorio está indexado pero no se detectaron rutas de navegación."
          : undefined,
      };
    } catch (err) {
      this.logger.warn(`Failed to check Ariadne status: ${err}`);
      return {
        canTransition: false,
        reason: "No se pudo contactar con AriadneSpecs. Verifica que el servicio esté disponible.",
      };
    }
  }

  /**
   * Ejecuta la transición: crea un stage baseline con navigation map.
   * @param projectId - ID del proyecto en TheForge.
   * @returns Resultado de la transición.
   */
  async executeTransition(projectId: string): Promise<LegacyTransitionResult> {
    const status = await this.checkTransition(projectId);
    if (!status.canTransition) {
      throw new BadRequestException(status.reason ?? "No se puede transicionar a legacy.");
    }

    const project = await this.prisma.project.findFirst({ where: { id: projectId } });
    if (!project) throw new BadRequestException("Proyecto no encontrado.");

    const theforgeId = (project as any).theforgeProjectId;

    // Fetch navigation map
    const navigationMap = await this.fetchNavigationMap(theforgeId);

    // Create an initial stage with the navigation map as baseline
    const stage = await this.prisma.stage.create({
      data: {
        projectId,
        ordinal: 0,
        name: "Baseline (código actual)",
        // Store navigation map as MDD for reference
        mddContent: navigationMap
          ? `# Línea Base - Código Existente\n\n> Este stage captura el estado actual del código antes de aplicar cambios.\n\n${navigationMap}`
          : "# Línea Base - Código Existente\n\n_No se pudo cargar el mapa de navegación._",
      },
    });

    // Update project type hint and legacy state
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        legacyFlowState: {
          status: "baseline_created",
          baselineStageId: stage.id,
          transitionedAt: new Date().toISOString(),
          hasNavigationMap: !!navigationMap,
          routeCount: navigationMap
            ? (navigationMap.match(/^##\s+\//gm) ?? []).length
            : 0,
        } as any,
      },
    });

    return {
      success: true,
      stageId: stage.id,
      navigationRoutes: navigationMap
        ? (navigationMap.match(/^##\s+\//gm) ?? []).length
        : 0,
    };
  }

  private async fetchNavigationMap(theforgeId: string): Promise<string | null> {
    try {
      const mcpUrl = process.env.ARIADNE_MCP_URL ?? "http://ariadne-mcp:3101";
      const response = await fetch(`${mcpUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN ?? ""}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "generate_navigation_map",
            arguments: { projectId: theforgeId, scope: "full" },
          },
          id: 1,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return null;
      const data = await response.json() as any;
      return data?.result?.content?.[0]?.text ?? null;
    } catch {
      return null;
    }
  }
}
