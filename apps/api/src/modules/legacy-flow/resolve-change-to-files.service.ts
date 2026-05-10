/**
 * @fileoverview **ResolveChangeToFilesService** — Dada una descripción de cambio y un
 * navigation map, devuelve una lista de archivos sugeridos a modificar, las rutas
 * afectadas y los componentes compartidos involucrados.
 *
 * Puente entre la entrevista conversacional y el staged discovery.
 * Puede usarse como herramienta independiente o integrada en ChangeInterviewService.
 */
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AiService } from "../ai/ai.service.js";
import { ProjectsService } from "../projects/projects.service.js";

export interface ResolveChangeResult {
  suggestedFiles: string[];
  affectedRoutes: string[];
  sharedComponents: string[];
  sddImpact: {
    safe: boolean;
    warnings: string[];
  };
}

export interface ResolveChangeOptions {
  projectId: string;
  description: string;
  stageId?: string;
  /** Navigation map JSON (opcional — si no se pasa, se carga del proyecto) */
  navigationMapJson?: string;
}

@Injectable()
export class ResolveChangeToFilesService {
  private readonly logger = new Logger(ResolveChangeToFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Dada una descripción de cambio, resuelve los archivos a modificar.
   */
  async resolve(options: ResolveChangeOptions): Promise<ResolveChangeResult> {
    const desc = (options.description ?? "").trim();
    if (!desc) throw new BadRequestException("description is required");

    // 1. Load navigation map
    const navMap = options.navigationMapJson
      ? this.parseNavMap(options.navigationMapJson)
      : await this.fetchNavigationMap(options.projectId);

    if (!navMap?.routes?.length) {
      return {
        suggestedFiles: [],
        affectedRoutes: [],
        sharedComponents: [],
        sddImpact: { safe: true, warnings: ["No se pudo cargar el mapa de navegación del proyecto."] },
      };
    }

    // 2. Find matching routes + files
    const matches = this.findMatchScores(desc, navMap);
    const topRoutes = matches.slice(0, 5);

    const affectedRoutes = [...new Set(topRoutes.map((m) => m.url))];
    const suggestedFiles = [...new Set(topRoutes.flatMap((m) => m.files))];
    const sharedComponents = this.findSharedComponents(navMap, affectedRoutes);

    // 3. Check SDD impact (via Ariadne MCP)
    const sddImpact = await this.checkSddImpact(suggestedFiles, options.projectId);

    return { suggestedFiles, affectedRoutes, sharedComponents, sddImpact };
  }

  /**
   * Encuentra las rutas con mayor score de coincidencia semántica.
   */
  private findMatchScores(description: string, navMap: any): Array<{ url: string; screen: string; files: string[]; score: number }> {
    const descLower = description.toLowerCase();
    const keywords = descLower
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .filter((w) => !["para", "con", "que", "por", "las", "los", "del", "una", "este", "esta"].includes(w));

    const results: Array<{ url: string; screen: string; files: string[]; score: number }> = [];

    for (const route of navMap.routes ?? []) {
      const url = (route.url ?? "").toLowerCase();
      const screen = (route.screenName ?? "").toLowerCase();
      const component = (route.componentPath ?? "").toLowerCase();

      // Keyword matching
      let score = keywords.reduce((s, kw) => {
        if (url.includes(kw) || screen.includes(kw) || component.includes(kw)) return s + 3;
        return s;
      }, 0);

      // Form field matching
      for (const form of route.forms ?? []) {
        for (const field of form.fields ?? []) {
          const fieldName = (field.name ?? "").toLowerCase();
          if (descLower.includes(fieldName) || fieldName.includes(descLower)) {
            score += 2;
          }
        }
      }

      // Endpoint matching
      for (const ep of route.endpoints ?? []) {
        const path = (ep.path ?? "").toLowerCase();
        if (descLower.split(/\s+/).some((w) => path.includes(w))) {
          score += 1;
        }
      }

      if (score > 0) {
        // Collect files
        const files = [route.componentPath ?? ""];
        for (const sc of route.subComponents ?? []) {
          files.push(sc.path ?? sc.name ?? "");
        }
        results.push({
          url: route.url ?? "",
          screen: route.screenName ?? "",
          files: files.filter(Boolean),
          score,
        });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Encuentra componentes compartidos que afectan las rutas seleccionadas.
   */
  private findSharedComponents(navMap: any, affectedRoutes: string[]): string[] {
    const routeSet = new Set(affectedRoutes);
    const shared: string[] = [];

    for (const sc of navMap.sharedComponents ?? []) {
      const overlaps = (sc.usedInRoutes ?? []).some((url: string) => routeSet.has(url));
      if (overlaps) {
        shared.push(sc.name ?? sc.path ?? "unknown");
      }
    }
    return shared;
  }

  /**
   * Consulta SDD (Spec-Driven Development) via Ariadne MCP para ver impacto.
   */
  private async checkSddImpact(
    files: string[],
    projectId: string,
  ): Promise<{ safe: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    if (files.length === 0) {
      return { safe: true, warnings: [] };
    }

    // Try to validate each file via Ariadne MCP
    const theforgeProject = await this.projects.findOne(projectId).catch(() => null);
    const theforgeId = (theforgeProject as any)?.theforgeProjectId;

    if (!theforgeId) {
      return { safe: true, warnings: [] };
    }

    for (const file of files.slice(0, 3)) {
      try {
        const componentName = file.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/, "") ?? "";

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
              name: "validate_before_edit",
              arguments: { projectId: theforgeId, nodeName: componentName },
            },
            id: 1,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          const data = await response.json() as any;
          const text = data?.result?.content?.[0]?.text ?? "";
          if (text.includes("⚠️") || text.includes("WARNING") || text.includes("shared")) {
            warnings.push(`${file}: ${text.slice(0, 200)}`);
          }
        }
      } catch {
        this.logger.warn(`SDD check failed for ${file}`);
      }
    }

    return {
      safe: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Carga el navigation map desde Ariadne MCP.
   */
  private async fetchNavigationMap(projectId: string): Promise<any | null> {
    try {
      const theforgeProject = await this.projects.findOne(projectId).catch(() => null);
      const theforgeId = (theforgeProject as any)?.theforgeProjectId;
      if (!theforgeId) return null;

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
      const content = data?.result?.content?.[0]?.text;
      if (!content) return null;

      return this.parseNavMap(content);
    } catch (err) {
      this.logger.warn(`Failed to fetch navigation map: ${err}`);
      return null;
    }
  }

  /**
   * Parsea navigation map desde Markdown (formato del MCP tool).
   */
  private parseNavMap(markdown: string): any {
    const routes: any[] = [];
    const sharedComponents: any[] = [];
    let currentRoute: any = null;
    let parsingShared = false;

    for (const line of markdown.split("\n")) {
      if (line.startsWith("## ") && !line.startsWith("## Advertencias") && !line.startsWith("## Componentes Compartidos")) {
        const url = line.replace(/^## /, "").replace(/[🟢🟡🔴]\s*$/, "").trim();
        currentRoute = { url, params: [], screenName: "", componentPath: "", subComponents: [], forms: [], endpoints: [] };
        routes.push(currentRoute);
        parsingShared = false;
      }

      if (line.startsWith("## Componentes Compartidos")) { parsingShared = true; continue; }

      if (parsingShared && line.startsWith("### ")) {
        sharedComponents.push({ name: line.replace(/^### /, "").trim(), path: "", usedInRoutes: [] });
      }

      if (!currentRoute) continue;

      const s = line.match(/Pantalla:\s*(.+)/);
      if (s) currentRoute.screenName = s[1].trim();

      const r = line.match(/Renderiza:\s*(.+)/);
      if (r) currentRoute.componentPath = r[1].trim();
    }

    return { routes, sharedComponents };
  }
}
