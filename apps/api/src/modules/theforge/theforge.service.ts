import { Injectable, Logger } from "@nestjs/common";

/** Repo (root) dentro de un proyecto multi-repo. */
export interface TheForgeProjectRoot {
  id: string;
  name?: string;
  branch?: string;
}

export interface TheForgeProject {
  id: string;
  name: string;
  /** Repos del proyecto (multi-root). Cada root.id es válido como projectId en herramientas. */
  roots?: TheForgeProjectRoot[];
  /** @deprecated Usar roots[].id y roots[].name. Conservado para compatibilidad con respuestas MCP. */
  rootPath?: string;
  /** @deprecated Usar roots[].branch */
  branch?: string;
}

/** Un archivo a modificar con su repo (multi-repo). */
export interface TheForgeFileToModify {
  path: string;
  repoId: string;
}

/** Scope opcional para acotar multi-root (SPEC-MCP-001). */
export interface TheForgeScope {
  repoIds?: string[];
  includePathPrefixes?: string[];
  excludePathGlobs?: string[];
}

/** Opciones opcionales para get_modification_plan (SPEC-MCP-001). */
export interface GetModificationPlanOptions {
  scope?: TheForgeScope;
  currentFilePath?: string;
}

/** Opciones opcionales para ask_codebase (SPEC-MCP-001). */
export interface AskCodebaseOptions {
  scope?: TheForgeScope;
  twoPhase?: boolean;
  currentFilePath?: string;
}

/** Respuesta de get_modification_plan (SPEC-MCP-001): paths con repoId y preguntas de negocio. */
export interface TheForgeModificationPlan {
  filesToModify: TheForgeFileToModify[];
  questionsToRefine: string[];
}

/**
 * Parsea la respuesta del MCP: puede ser JSON directo o SSE (líneas event:/data:).
 * @param raw - Texto crudo de la respuesta HTTP del MCP.
 * @returns Objeto parseado o null si no se puede extraer JSON.
 */
function parseMcpResponse(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(raw) as unknown;
  }
  // SSE: buscar línea "data: {...}" y extraer el JSON
  for (const line of raw.split("\n")) {
    const dataLine = line.startsWith("data:") ? line.slice(5).trim() : null;
    if (dataLine && dataLine.startsWith("{")) {
      return JSON.parse(dataLine) as unknown;
    }
  }
  return null;
}

/**
 * Extrae el JSON del contenido de una herramienta MCP: puede ser JSON directo o markdown con bloque ```json ... ```.
 * @param text - Texto devuelto por la herramienta (p. ej. result.content[].text).
 * @returns Cadena JSON extraída.
 */
function extractJsonFromToolContent(text: string): string {
  const t = text.trim();
  if (t.startsWith("[")) return t;
  if (t.startsWith("{")) return t;
  const jsonBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  return jsonBlock ? jsonBlock[1].trim() : t;
}

/**
 * Servicio de integración con el MCP TheForge (FalkorSpecs).
 * Expone listado de proyectos (multi-root), plan de modificación, ask_codebase y herramientas de refactor seguro (SPEC-MCP-001).
 * Requiere THEFORGE_MCP_URL y MCP_AUTH_TOKEN en el entorno.
 */
@Injectable()
export class TheForgeService {
  private readonly logger = new Logger(TheForgeService.name);

  private get baseUrl(): string {
    const url = process.env.THEFORGE_MCP_URL?.trim();
    return url ?? "";
  }

  private get token(): string {
    return process.env.MCP_AUTH_TOKEN?.trim() ?? "";
  }

  /**
   * Timeout HTTP al **MCP externo de TheForge** (JSON-RPC). No confundir con un MCP servidor propio.
   * @see docs/MCP-ARQUITECTURA-THEFORGE.md
   */
  private theforgeMcpTimeoutMs(): number {
    const n = parseInt(process.env.THEFORGE_MCP_TIMEOUT_MS ?? "60000", 10);
    return Number.isFinite(n) && n > 0 ? n : 60000;
  }

  /** POST JSON-RPC al endpoint TheForge (MCP ajeno) con abort por timeout. */
  private async postTheForgeMcp(body: object): Promise<Response> {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this.theforgeMcpTimeoutMs());
    const tokenPreview = this.token ? `${this.token.slice(0, 4)}...${this.token.slice(-4)}` : "(vacío)";
    this.logger.log(`[TheForge] MCP POST ${this.baseUrl} | token length=${this.token.length} preview=${tokenPreview}`);
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
      this.logger.debug(`[TheForge] MCP HTTP ${response.status} ${Date.now() - t0}ms`);
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[TheForge] MCP fetch error after ${Date.now() - t0}ms: ${msg}`);
      throw err;
    } finally {
      clearTimeout(to);
    }
  }

  /** Llama a una herramienta MCP por nombre y argumentos; devuelve el text del result.content o null. */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: `theforge-${toolName}-${Date.now()}`,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      });
      if (!response.ok) return null;
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`[TheForge] ${toolName} error: ${data.error.message}`);
        return null;
      }
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? null;
      return typeof text === "string" ? text : null;
    } catch (err) {
      this.logger.error(`[TheForge] ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Indica si el cliente TheForge está configurado (URL y token presentes).
   * @returns true si THEFORGE_MCP_URL y MCP_AUTH_TOKEN están definidos.
   */
  isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.token.length > 0;
  }

  /**
   * Contexto amplio del codebase para generación de entregables (Blueprint, API, etc.).
   * Incluye modelos/rutas, arquitectura y stack + estructura real para no inventar plataformas.
   * @param projectId - ID de proyecto o repo en TheForge.
   */
  async getContextForDeliverables(projectId: string): Promise<string> {
    if (!this.isConfigured()) return "";
    const parts: string[] = [];
    const q1 = await this.askCodebase(
      "List exhaustively: all data models, entities, tables and their fields; all API routes and services; main UI components and screens; configuration and env. This is for documentation generation — be thorough.",
      projectId,
    );
    if (q1.trim()) parts.push("Modelos, rutas y configuración:\n" + q1.trim());
    const q2 = await this.askCodebase(
      "Describe architecture: folder structure, modules, how backend and frontend connect, existing patterns and conventions. Include file paths for key areas.",
      projectId,
    );
    if (q2.trim()) parts.push("Arquitectura y carpetas:\n" + q2.trim());
    const q3 = await this.askCodebase(
      "What is the EXACT tech stack and directory structure of this project? List only what exists in the codebase: backend runtime and framework (e.g. Node/Express, Node/NestJS, Python/Django), frontend framework (e.g. React, Vue), database, build tools. If the project has multiple repositories, list them and their main folders. Do NOT assume or invent; only state what the codebase contains.",
      projectId,
    );
    if (q3.trim()) parts.push("Stack y estructura real (solo lo que existe):\n" + q3.trim());
    return parts.join("\n\n---\n\n");
  }

  /**
   * Lista los proyectos indexados en TheForge (herramienta MCP list_known_projects).
   * Si TheForge no está configurado o falla, devuelve array vacío.
   * @returns Lista de proyectos con id, name, rootPath y branch (opcional).
   */
  async listKnownProjects(): Promise<TheForgeProject[]> {
    if (!this.isConfigured()) {
      this.logger.warn("[TheForge] listKnownProjects: no configurado (THEFORGE_MCP_URL o MCP_AUTH_TOKEN vacíos)");
      return [];
    }
    const hasToken = this.token.length > 0;
    this.logger.log(`[TheForge] listKnownProjects: llamando MCP en ${this.baseUrl}, Authorization Bearer present=${hasToken}`);
    try {
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: "list-projects-1",
        method: "tools/call",
        params: {
          name: "list_known_projects",
          arguments: {},
        },
      });
      this.logger.log(`[TheForge] listKnownProjects: respuesta HTTP ${response.status} ${response.statusText}`);
      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`[TheForge] listKnownProjects: body=${body.slice(0, 500)}`);
        return [];
      }
      const raw = await response.text();
      this.logger.log(`[TheForge] listKnownProjects: raw response (first 2000 chars): ${raw.slice(0, 2000)}`);
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message: string };
      };
      this.logger.log(`[TheForge] listKnownProjects: parsed data keys=${data ? Object.keys(data as object).join(",") : "null"}, hasResult=${!!data?.result}, hasError=${!!(data as { error?: unknown })?.error}`);
      if (!data) {
        this.logger.warn("[TheForge] listKnownProjects: no se pudo extraer JSON de la respuesta");
        return [];
      }
      if (data.error) {
        this.logger.warn(`[TheForge] listKnownProjects: MCP error=${data.error.message}`);
        return [];
      }
      const content = data.result?.content;
      this.logger.log(`[TheForge] listKnownProjects: result.content length=${content?.length ?? 0}, items=${content?.map((c) => c.type).join(",") ?? "none"}`);
      if (!content?.length) {
        this.logger.log("[TheForge] listKnownProjects: result.content vacío o ausente");
        return [];
      }
      const text = content.find((c) => c.type === "text")?.text;
      this.logger.log(`[TheForge] listKnownProjects: text length=${text?.length ?? 0}, preview=${(text ?? "").slice(0, 500)}`);
      if (!text) {
        this.logger.log("[TheForge] listKnownProjects: no hay content type=text en result");
        return [];
      }
      const jsonStr = extractJsonFromToolContent(text);
      this.logger.log(`[TheForge] listKnownProjects: extracted JSON (full): ${jsonStr}`);
      const parsed = JSON.parse(jsonStr) as unknown;
      if (!Array.isArray(parsed)) {
        this.logger.warn(`[TheForge] listKnownProjects: respuesta no es array (typeof=${typeof parsed}), preview=${String(parsed).slice(0, 200)}`);
        return [];
      }
      this.logger.log(`[TheForge] listKnownProjects: parsed array length=${parsed.length}, each item keys: ${parsed.map((p: unknown) => (p != null && typeof p === "object" ? Object.keys(p as object).join(",") : "?")).join(" | ")}`);
      const projects: TheForgeProject[] = parsed
        .filter((p): p is Record<string, unknown> => p != null && typeof p === "object" && typeof (p as { id?: unknown }).id === "string" && typeof (p as { name?: unknown }).name === "string")
        .map((p) => {
          const roots = (p as { roots?: unknown }).roots;
          const arr = Array.isArray(roots)
            ? roots
              .filter((r): r is TheForgeProjectRoot => r != null && typeof r === "object" && typeof (r as { id?: unknown }).id === "string")
              .map((r) => ({ id: (r as { id: string }).id, name: (r as { name?: string }).name, branch: (r as { branch?: string }).branch }))
            : undefined;
          return {
            id: p.id as string,
            name: p.name as string,
            roots: arr?.length ? arr : undefined,
            rootPath: (p as { rootPath?: string }).rootPath,
            branch: (p as { branch?: string }).branch,
          } as TheForgeProject;
        });
      this.logger.log(`[TheForge] listKnownProjects: OK, ${projects.length} proyecto(s). Full payload: ${JSON.stringify(projects)}`);
      return projects;
    } catch (err) {
      this.logger.error(`[TheForge] listKnownProjects failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Obtiene el plan de modificación basado solo en el grafo (herramienta MCP get_modification_plan).
   * Garantiza filesToModify = rutas reales del proyecto; questionsToRefine = solo preguntas de negocio.
   * @param userDescription - Descripción de la modificación que quiere el usuario.
   * @param projectId - ID del proyecto o repo en TheForge (theforgeProjectId; puede ser roots[].id).
   * @param opts - scope (repoIds, includePathPrefixes, excludePathGlobs), currentFilePath (SPEC-MCP-001).
   * @returns Plan con filesToModify y questionsToRefine, o null si TheForge no está configurado o la herramienta falla.
   */
  async getModificationPlan(
    userDescription: string,
    projectId: string,
    opts?: GetModificationPlanOptions,
  ): Promise<TheForgeModificationPlan | null> {
    if (!this.isConfigured()) return null;
    try {
      const args: Record<string, unknown> = { userDescription: userDescription.trim(), projectId };
      if (opts?.currentFilePath?.trim()) args.currentFilePath = opts.currentFilePath.trim();
      if (opts?.scope && Object.keys(opts.scope).length > 0) args.scope = opts.scope;
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: "get-modification-plan-1",
        method: "tools/call",
        params: { name: "get_modification_plan", arguments: args },
      });
      if (!response.ok) return null;
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`[TheForge] get_modification_plan error: ${data.error.message}`);
        return null;
      }
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? "";
      if (!text || typeof text !== "string") return null;
      const jsonStr = extractJsonFromToolContent(text);
      const parsed = JSON.parse(jsonStr) as { filesToModify?: unknown; questionsToRefine?: unknown };
      const rawFiles = Array.isArray(parsed?.filesToModify) ? parsed.filesToModify : [];
      const filesToModify: TheForgeFileToModify[] = rawFiles.map((f) => {
        if (typeof f === "object" && f != null && typeof (f as { path?: unknown }).path === "string") {
          const o = f as { path: string; repoId?: string };
          return { path: o.path, repoId: typeof o.repoId === "string" ? o.repoId : "" };
        }
        return { path: String(f), repoId: "" };
      }).filter((f) => f.path.length > 0);
      const questionsToRefine = Array.isArray(parsed?.questionsToRefine) ? parsed.questionsToRefine.filter((q) => typeof q === "string") : [];
      return { filesToModify, questionsToRefine };
    } catch (err) {
      this.logger.error(`[TheForge] getModificationPlan failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Realiza una pregunta en lenguaje natural sobre el código indexado (herramienta MCP ask_codebase).
   * @param question - Pregunta en texto libre sobre el codebase.
   * @param projectId - ID del proyecto o repo en TheForge.
   * @param opts - scope, twoPhase, currentFilePath (SPEC-MCP-001).
   * @returns Respuesta de texto del MCP o cadena vacía si falla.
   */
  async askCodebase(question: string, projectId: string, opts?: AskCodebaseOptions): Promise<string> {
    if (!this.isConfigured()) return "";
    try {
      const args: Record<string, unknown> = { question, projectId };
      if (opts?.currentFilePath?.trim()) args.currentFilePath = opts.currentFilePath.trim();
      if (opts?.scope && Object.keys(opts.scope).length > 0) args.scope = opts.scope;
      if (typeof opts?.twoPhase === "boolean") args.twoPhase = opts.twoPhase;
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: "ask-codebase-1",
        method: "tools/call",
        params: { name: "ask_codebase", arguments: args },
      });
      if (!response.ok) return "";
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`TheForge ask_codebase error: ${data.error.message}`);
        return "";
      }
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? "";
      return typeof text === "string" ? text : "";
    } catch (err) {
      this.logger.error(`TheForge askCodebase failed: ${err instanceof Error ? err.message : String(err)}`);
      return "";
    }
  }

  /**
   * Obtiene el contenido de un archivo del repo/proyecto (herramienta MCP get_file_content).
   * projectId puede ser ID de proyecto o de repo (roots[].id); el MCP resuelve automáticamente.
   */
  async getFileContent(
    path: string,
    projectId: string,
    ref?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { path: path.trim(), projectId };
    if (ref?.trim()) args.ref = ref.trim();
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callTool("get_file_content", args);
    return out ?? "";
  }

  /**
   * Analiza qué se rompería si se modifica un nodo (herramienta MCP get_legacy_impact).
   * Útil para incluir impacto en el contexto del MDD de cambio.
   */
  async getLegacyImpact(
    nodeName: string,
    projectId: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { nodeName: nodeName.trim(), projectId };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callTool("get_legacy_impact", args);
    return out ?? "";
  }

  /**
   * Validación obligatoria antes de editar (herramienta MCP validate_before_edit).
   * Devuelve impacto + contrato en un solo llamado. Usar antes de modificar un nodo/archivo.
   * @returns Texto con impacto y contrato, o vacío si la herramienta no está disponible.
   */
  async validateBeforeEdit(nodeName: string, projectId: string, currentFilePath?: string): Promise<string> {
    const args: Record<string, unknown> = { nodeName: nodeName.trim(), projectId };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callTool("validate_before_edit", args);
    return out ?? "";
  }

  /**
   * Extrae props y firma de un componente (herramienta MCP get_contract_specs).
   * Para que el MDD/código respete la estructura existente.
   */
  async getContractSpecs(
    componentName: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { componentName: componentName.trim() };
    if (projectId?.trim()) args.projectId = projectId.trim();
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callTool("get_contract_specs", args);
    return out ?? "";
  }

  /**
   * Recupera el árbol de dependencias de un componente (herramienta MCP get_component_graph).
   * depth por defecto 2. Evita asumir que un componente es aislado.
   */
  async getComponentGraph(
    componentName: string,
    projectId: string,
    depth: number = 2,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = {
      componentName: componentName.trim(),
      projectId,
      depth: Number.isFinite(depth) ? depth : 2,
    };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callTool("get_component_graph", args);
    return out ?? "";
  }
}
