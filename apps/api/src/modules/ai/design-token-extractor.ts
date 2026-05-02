/**
 * Extractor de tokens de diseño desde el codebase (Tailwind, CSS custom props, temas).
 * Se ejecuta como parte del flujo legacy para enriquecer la Guía UX/UI con tokens reales.
 */

interface DesignTokenFindings {
  foundTailwind: boolean;
  foundCssCustomProps: boolean;
  foundThemeFile: boolean;
  tailwindConfigSample: string;
  cssCustomPropsSample: string;
  themeSample: string;
  summary: string;
}

/**
 * Busca tokens de diseño en el contexto TheForge (ask_codebase) sobre archivos de estilo.
 */
export async function extractDesignTokensFromTheForgeContext(
  askCodebase: (query: string) => Promise<string>,
  theforgeProjectId: string,
): Promise<DesignTokenFindings> {
  const empty: DesignTokenFindings = {
    foundTailwind: false,
    foundCssCustomProps: false,
    foundThemeFile: false,
    tailwindConfigSample: "",
    cssCustomPropsSample: "",
    themeSample: "",
    summary: "",
  };

  const queries = [
    {
      key: "tailwind" as const,
      query: `Busca en el codebase archivos de configuración de Tailwind CSS (tailwind.config.*) o archivos que definan la paleta de colores, tipografía y espaciado del frontend. Si encuentras, extrae el theme (colors, fontFamily, spacing, borderRadius, etc.) tal cual del config. Responde solo con el contenido relevante, sin comentarios. Si no hay, responde "NO_TAILWIND".`,
    },
    {
      key: "css" as const,
      query: `Busca en el codebase archivos CSS con custom properties (--color-*, --font-*, --spacing-*, --radius-*) o variables de diseño. Extrae las definiciones completas de las custom properties relacionadas con diseño visual (colores, tipografía, sombras, bordes, spacing). Responde solo con las definiciones encontradas. Si no hay, responde "NO_CSS_PROPS".`,
    },
    {
      key: "theme" as const,
      query: `Busca en el codebase archivos de tema, tokens de diseño, tokens.json, theme.json, o cualquier archivo que defina valores de diseño estructurados (colores, fuentes, tamaños). Extrae el contenido relevante. Si no hay, responde "NO_THEME".`,
    },
  ];

  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        return { key: q.key, result: await askCodebase(q.query) };
      } catch {
        return { key: q.key, result: "" };
      }
    }),
  );

  const byKey = Object.fromEntries(results.map((r) => [r.key, r.result]));

  const tailwindRaw = byKey.tailwind ?? "";
  const cssRaw = byKey.css ?? "";
  const themeRaw = byKey.theme ?? "";

  const foundTailwind = tailwindRaw.length > 0 && !tailwindRaw.includes("NO_TAILWIND");
  const foundCssCustomProps = cssRaw.length > 0 && !cssRaw.includes("NO_CSS_PROPS");
  const foundThemeFile = themeRaw.length > 0 && !themeRaw.includes("NO_THEME");

  // Truncar cada muestra a 4000 chars
  const trunc = (s: string, max = 4000) => (s.length > max ? s.slice(0, max) + "\n… (truncado)" : s);

  const parts: string[] = [];
  if (foundTailwind) {
    parts.push("=== Tailwind Config Tokens ===\n" + trunc(tailwindRaw));
  }
  if (foundCssCustomProps) {
    parts.push("=== CSS Custom Properties ===\n" + trunc(cssRaw));
  }
  if (foundThemeFile) {
    parts.push("=== Theme / Token Files ===\n" + trunc(themeRaw));
  }

  const summary = parts.length > 0
    ? parts.join("\n\n")
    : "[El codebase no expone tokens de diseño detectables (Tailwind config, CSS custom props ni archivos de tema). La guía UX/UI se basará en el MDD, el contexto general del código y las mejores prácticas del dominio.]";

  return {
    foundTailwind,
    foundCssCustomProps,
    foundThemeFile,
    tailwindConfigSample: foundTailwind ? trunc(tailwindRaw) : "",
    cssCustomPropsSample: foundCssCustomProps ? trunc(cssRaw) : "",
    themeSample: foundThemeFile ? trunc(themeRaw) : "",
    summary,
  };
}

/**
 * Formatea los hallazgos de tokens de diseño como contexto para inyectar en el prompt de Guía UX/UI.
 */
export function formatDesignTokensForUxGuide(findings: DesignTokenFindings): string {
  if (!findings.foundTailwind && !findings.foundCssCustomProps && !findings.foundThemeFile) {
    return "";
  }

  let block = "## Tokens de Diseño Extraídos del Codebase\n\n";
  block += "Estos son tokens reales encontrados en el código existente. La Guía UX/UI debe priorizar esta información sobre valores por defecto:\n\n";
  block += findings.summary;
  block += "\n\n**Instrucción:** Al generar los tokens YAML del DESIGN.md, usa estos valores reales del codebase como base. Si hay conflicto entre el MDD y los tokens extraídos, prioriza los tokens extraídos (son lo que realmente existe en el código).";

  return block;
}
