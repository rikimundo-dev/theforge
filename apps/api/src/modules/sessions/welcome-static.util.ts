import type { ChatMessage } from "@theforge/shared-types";

export type WelcomeStaticContext = {
  projectName?: string;
  mddContent?: string | null;
  dbgaContent?: string | null;
  uxUiGuideContent?: string | null;
  brdContent?: string | null;
  chatLog?: ChatMessage[];
  activeTab?: string;
};

/**
 * Mensaje de bienvenida sin LLM cuando el tab no tiene historial de chat.
 * Ahorra tokens y evita rate limit al cambiar de pestaña (el contexto documental
 * ya está en el panel; no hace falta re-embeder fragmentos en el prompt).
 */
export function resolveStaticWelcomeMessage(
  context: WelcomeStaticContext,
  chatLogForTab: ChatMessage[],
): string | null {
  if (chatLogForTab.length > 0) return null;

  const at = (context.activeTab ?? "mdd").trim().toLowerCase();
  const name = context.projectName?.trim();
  const p = name ? ` **${name}**` : "";
  const dbga = (context.dbgaContent ?? "").trim();
  const ux = (context.uxUiGuideContent ?? "").trim();
  const brd = (context.brdContent ?? "").trim();

  if (at === "benchmark") {
    if (!dbga) return null;
    return `Hola${p}. Estás en **Paso 0 (Benchmark & Gap Analysis)**. Ya tienes un benchmark en el panel; aquí puedes revisar brechas, priorizar hallazgos o pedir ajustes antes de pasar al MDD. ¿Qué te gustaría refinar primero?`;
  }

  if (at === "ux-ui-guide") {
    if (ux) {
      return `Hola${p}. En **Guía UX/UI** ya hay documento en el panel; dime si quieres ajustar marca, colores, tipografía, accesibilidad o prioridades móvil/desktop.`;
    }
    return `Hola${p}. Vamos a armar la **Guía UX/UI**: ¿hay equipo UX o definís estilos con IA/dev? ¿Marca y paleta? ¿Accesibilidad o móvil primero?`;
  }

  if (at === "brd") {
    const mini =
      " El BRD de etapa vive en el panel (**Guardar** / **Aprobar BRD**); aquí lo refinamos por chat.";
    if (brd) {
      return `Hola${p}. Hay un **borrador BRD** en el panel.${mini} ¿Refinamos alcance, KPIs, actores o riesgos?`;
    }
    if (dbga) {
      return `Hola${p}. Tenemos **Benchmark** como insumo para el BRD (objetivos, alcance, exclusiones).${mini} ¿Empezamos por el problema de negocio o el alcance de la etapa?`;
    }
    return `Hola${p}. En esta pestaña construimos el **BRD de la etapa** (problema, objetivos, alcance, riesgos en markdown).${mini} ¿Cuál es el problema de negocio y cómo medirías el éxito?`;
  }

  return null;
}
