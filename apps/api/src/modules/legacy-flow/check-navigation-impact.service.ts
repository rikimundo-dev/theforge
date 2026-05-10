/**
 * @fileoverview **CheckNavigationImpactService** — Extiende validate_before_edit (SDD)
 * para que también consulte el navigation map y advierta si modificar un componente
 * afecta otras rutas.
 *
 * Input: projectId, componentPath
 * Output: isShared, routesAffected, screenNames, warning
 */
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ProjectsService } from "../projects/projects.service.js";

export interface NavigationImpactResult {
  isShared: boolean;
  routesAffected: string[];
  screenNames: string[];
  warning: string | null;
}

@Injectable()
export class CheckNavigationImpactService {
  private readonly logger = new Logger(CheckNavigationImpactService.name);

  constructor(private readonly projects: ProjectsService) {}

  /**
   * Evalúa el impacto de modificar un componente en el navigation map.
   */
  async checkImpact(
    projectId: string,
    componentPath: string,
    stageId?: string,
  ): Promise<NavigationImpactResult> {
    const comp = (componentPath ?? "").trim();
    if (!comp) throw new BadRequestException("componentPath is required");

    // 1. Load navigation map
    const navMap = await this.fetchNavigationMap(projectId);

    if (!navMap?.routes?.length) {
      return {
        isShared: false,
        routesAffected: [],
        screenNames: [],
        warning: "No se pudo cargar el mapa de navegación del proyecto.",
      };
    }

    // 2. Find component usage across routes
    const usage: Array<{ url: string; screen: string }> = [];

    const componentName = comp.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/, "") ?? "";
    const componentPathNorm = comp.replace(/\/+$/, "");

    for (const route of navMap.routes) {
      const routeComponent = (route.componentPath ?? "").replace(/\/+$/, "");
      const routeName = routeComponent.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/, "") ?? "";

      // Check if the component is the main component of this route
      if (routeComponent === componentPathNorm || routeName === componentName) {
        usage.push({ url: route.url ?? "", screen: route.screenName ?? "" });
        continue;
      }

      // Check if the component is a subcomponent of this route
      for (const sc of route.subComponents ?? []) {
        const scPath = (sc.path ?? "").replace(/\/+$/, "");
        const scName = (sc.name ?? "").replace(/\.(tsx|ts|jsx|js)$/, "");
        if (scPath === componentPathNorm || scName === componentName || scName === componentName) {
          usage.push({ url: route.url ?? "", screen: route.screenName ?? "" });
          break;
        }
      }
    }

    // 3. Check shared components section
    for (const sc of navMap.sharedComponents ?? []) {
      const scName = (sc.name ?? "").replace(/\.(tsx|ts|jsx|js)$/, "");
      const scPath = (sc.path ?? "").replace(/\/+$/, "");

      if (scPath === componentPathNorm || scName === componentName || (sc.usedInRoutes ?? []).length > 0) {
        for (const url of sc.usedInRoutes ?? []) {
          const route = navMap.routes.find((r: any) => r.url === url);
          if (route && !usage.some((u) => u.url === url)) {
            usage.push({ url, screen: route.screenName ?? "" });
          }
        }
      }
    }

    // 4. Deduplicate
    const unique = new Map<string, { url: string; screen: string }>();
    for (const u of usage) {
      unique.set(u.url, u);
    }

    const routesAffected = [...unique.keys()];
    const screenNames = [...unique.values()].map((u) => u.screen);
    const isShared = routesAffected.length >= 2;
    const warning = isShared
      ? `⚠️ El componente se usa en ${routesAffected.length} rutas. Verificar que el cambio sea compatible con todas: ${routesAffected.join(", ")}.`
      : null;

    return { isShared, routesAffected, screenNames, warning };
  }

  /**
   * Carga navigation map desde Ariadne MCP.
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
