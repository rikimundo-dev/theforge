import type { TheForgeService } from "../theforge/theforge.service.js";

/**
 * Markdown inyectable en el system prompt del descubrimiento escalonado:
 * lista `roots[]` del proyecto Ariadne según `list_known_projects` (MCP).
 */
export async function buildAriadneRepositoriesCatalogMarkdown(
  theforge: TheForgeService,
  theforgeProjectId: string,
): Promise<string> {
  const pid = theforgeProjectId.trim();
  if (!theforge.isConfigured() || !pid) {
    return "_TheForge no configurado (`THEFORGE_MCP_URL`); no hay catálogo MCP._";
  }
  try {
    const projects = await theforge.listKnownProjects();
    if (!projects.length) {
      return "_`list_known_projects` devolvió vacío — revisa índice y sync en Ariadne._";
    }
    const asWorkspace = projects.find((p) => p.id === pid);
    const asRootChild = projects.find((p) => p.roots?.some((r) => r.id === pid));
    const project = asWorkspace ?? asRootChild;
    if (!project) {
      const names = projects.map((p) => `«${p.name}»`).join(", ");
      return `_El UUID \`${pid.slice(0, 8)}…\` no aparece en el catálogo MCP. Proyectos conocidos: ${names}._`;
    }

    const lines: string[] = [];
    lines.push(`**Proyecto Ariadne (workspace):** «${project.name}»`);
    lines.push(`- **\`projectId\` ingest (chat / modification-plan):** \`${project.id}\``);
    lines.push("");

    const roots = project.roots?.filter((r) => r.id?.trim());
    if (roots?.length) {
      lines.push("**Repositorios indexados (`roots[]`) — cada fila es un repo con su propio id en Falkor / ingest por repo:**");
      lines.push("");
      lines.push("| Repo id (`roots[].id`) | Nombre | Rama |");
      lines.push("| --- | --- | --- |");
      for (const r of roots) {
        lines.push(`| \`${r.id.trim()}\` | ${r.name?.trim() || "—"} | ${r.branch?.trim() || "—"} |`);
      }
    } else {
      lines.push(
        "_El catálogo no trae `roots[]`; asume **un único repositorio lógico** acoplado al workspace hasta que la evidencia diga lo contrario._",
      );
    }

    lines.push("");
    lines.push(
      "**Instrucción operativa:** tu **primera** salida razonada (antes de abusar de herramientas) debe **interpretar** esta tabla: qué rol tiene cada repo en el producto (API, BFF, web, mobile, paquetes compartidos, infra como código, etc.). Si falta contexto, como **mucho** una llamada breve a `ask_codebase` solo para *inventario de repos, responsabilidades y límites entre ellos* — sin pedir aún modelo de datos completo, ni todos los endpoints, ni todas las pantallas.",
    );

    return lines.join("\n");
  } catch (e) {
    return `_Error al consultar el catálogo MCP: ${e instanceof Error ? e.message : String(e)}._`;
  }
}
