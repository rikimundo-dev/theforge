import { Injectable, Logger } from "@nestjs/common";
import type {
  GenerateResponseOptions,
  ChatMessage as LlmChatMessage,
} from "./interfaces/llm-provider.interface.js";
import { AIFactory } from "./ai.factory.js";
import { getRequestUserId } from "../../common/request-user.store.js";
import type { ChatImagePart } from "@theforge/shared-types";
import { MASTER_PROMPT } from "./prompts/master-prompt.js";

/** System corto solo para bienvenidas: evita ~6k+ chars de MASTER en cada `POST …/welcome`. */
const WELCOME_BRIEF_SYSTEM_PROMPT = `Eres el asistente del Workshop **The Forge** (especificación: MDD, BRD por etapa, Manual To-Be, Spec, Benchmark, etc.).
- Responde en **español**, tono profesional y **breve**.
- No inventes requisitos que contradigan el texto del **mensaje de usuario** (puede traer fragmentos de Benchmark, BRD u otros documentos).
- Si el mensaje pide **un solo** mensaje de bienvenida u orientación inicial, cumple sin divagar ni copiar el enunciado entero.`;
import { UX_UI_GUIDE_PROMPT } from "./prompts/ux-ui-guide-prompt.js";
import { BENCHMARK_REFINE_PROMPT } from "./prompts/phase0-benchmark-refine-prompt.js";
import { BLUEPRINT_PROMPT } from "./prompts/blueprint-prompt.js";
import { API_CONTRACTS_PROMPT } from "./prompts/api-contracts-prompt.js";
import { LOGIC_FLOWS_PROMPT } from "./prompts/logic-flows-prompt.js";
import { INFRA_PROMPT } from "./prompts/infra-prompt.js";
import { SPEC_PROMPT } from "./prompts/spec-prompt.js";
import { ARCHITECTURE_PROMPT } from "./prompts/architecture-prompt.js";
import { USE_CASES_PROMPT } from "./prompts/use-cases-prompt.js";
import { USER_STORIES_PROMPT } from "./prompts/user-stories-prompt.js";
import { TASKS_PROMPT } from "./prompts/tasks-prompt.js";
import { VERIFY_DELIVERABLE_PROMPT } from "./prompts/verify-deliverable-prompt.js";
import { CONFORMANCE_CHECK_PROMPT } from "./prompts/conformance-check-prompt.js";
import { DOCUMENT_CHANGELOG_CHAT_INSTRUCTION } from "./prompts/with-document-changelog-instructions.js";

/** Instrucción fija para que ningún documento generado use "militar" (se añade al system prompt en generación de docs). */
const NO_MILITAR_INSTRUCTION =
  "\n\n**Regla obligatoria:** En toda tu respuesta no uses nunca las palabras \"militar\", \"grado militar\" ni variantes; usa \"alta criticidad\", \"misión crítica\" o \"robustez industrial\" en su lugar.";

/** Opciones para generación legacy: contexto TheForge para priorizar conocimiento del codebase. */
export interface LegacyGenerateOptions {
  /** Contexto del codebase (TheForge). Cuando está presente, se inyecta al inicio del prompt y se instruye a priorizarlo. */
  theforgeContext?: string;
  /** Contratos de API reales obtenidos vía get_contract_specs del MCP de Ariadne. Props/firmas reales de componentes para alinear endpoints. */
  contractSpecs?: string;
}

/** Instrucción fija para toda documentación legacy: complementar sin inventar. */
const LEGACY_NO_INVENTAR =
  "**Regla obligatoria (legacy):** Cumple estrictamente con lo que especifican los documentos. No inventes funcionalidades nuevas ni cambies el alcance. Sin embargo, puedes y debes complementar con lo necesario para que lo especificado funcione correctamente: validaciones, manejo de errores, estados de UI, casos edge obvios, autenticación donde aplique, migraciones de DB requeridas, y cualquier boilerplate indispensable. Si algo es ambiguo o hay múltiples formas válidas de implementarlo, pregunta.";

function trimTheForgeContextBlock(theforgeContext: string): string {
  const max = parseInt(process.env.THEFORGE_CONTEXT_PREPEND_MAX_CHARS ?? "16000", 10);
  const cap = Number.isFinite(max) && max > 2000 ? max : 16000;
  return (theforgeContext ?? "").trim().slice(0, cap);
}

function prependTheForgePrompt(prompt: string, theforgeContext: string): string {
  const block = trimTheForgeContextBlock(theforgeContext);
  if (!block) return prompt;
  return (
    "**Contexto del codebase (índice vía TheForge MCP) — priorizar y usar en su totalidad antes de elaborar el documento:**\n" +
    "**Nota:** «TheForge» aquí es la herramienta de indexado, **no** el nombre del producto ni del sistema que documentas (ese nombre sale del MDD).\n---\n" +
    block +
    "\n---\n\n" +
    LEGACY_NO_INVENTAR +
    "\n\n**Instrucción:** Usa TODO el conocimiento anterior para alinear el documento con lo que ya existe en el proyecto. A continuación, el MDD u otros insumos.\n\n" +
    prompt
  );
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly aiFactory: AIFactory) {}

  private async provider() {
    return this.aiFactory.createForUser(getRequestUserId());
  }

  private static readonly ACTIVE_TAB_LABELS: Record<string, string> = {
    spec: "Spec (SDD: what/why)",
    brd: "BRD (etapa)",
    mdd: "MDD",
    architecture: "Arquitectura del sistema",
    "use-cases": "Casos de Uso",
    "user-stories": "Historias de Usuario",
    "ux-ui-guide": "Guía UX/UI",
    blueprint: "Blueprint",
    "api-contracts": "Contratos de API",
    "logic-flows": "Flujos de lógica",
    infra: "Infraestructura",
    tasks: "Tareas (Breakdown)",
  };

  /** Política Google Stitch + fragmentos SDD para Guía UX/UI (según projectType). */
  private appendUxGuideStitchPolicy(
    systemPrompt: string,
    options: GenerateResponseOptions | undefined,
  ): string {
    const pt = options?.projectTypeForUxGuide;
    if (!pt) return systemPrompt;
    if (options?.activeTab?.trim() !== "ux-ui-guide") return systemPrompt;
    let s = systemPrompt;
    if (pt === "LEGACY") {
      return (
        s +
        "\n\n**[Tipo de proyecto: LEGACY]** Cambio sobre sistema existente. **Prohibido** incluir en la Guía UX/UI ninguna sección titulada **«Prompt para Google Stitch»** ni brief para herramientas de diseño generativo (p. ej. Google Stitch) orientado a un producto greenfield desde cero. La guía debe alinearse con lo ya existente descrito en el MDD y el contexto del proyecto."
      );
    }
    if (pt === "NEW") {
      s +=
        "\n\n**[Tipo de proyecto: NEW]** Al generar o actualizar la **Guía UX/UI completa**, **incluye obligatoriamente** al final del documento markdown (antes de la línea `---FIN_UX_UI---`) la sección **## Prompt para Google Stitch (producto)** con **un único bloque de texto** listo para copiar y pegar en Google Stitch. Ese prompt debe describir **el producto que estamos especificando en este proyecto** (el sistema del cliente según el MDD y los documentos del contexto), **no** la aplicación interna The Forge ni su Workshop. Incluye: (1) nombre provisional del producto y propuesta de valor en una frase; (2) usuarios objetivo y contexto de uso; (3) inventario de **pantallas, vistas o flujos** inferidos de MDD, Blueprint, Spec, casos de uso, historias, flujos de lógica y arquitectura que recibes en el contexto; (4) dirección visual, stack de UI (p. ej. React, Tailwind, shadcn) y criterios de accesibilidad alineados a las secciones anteriores de esta guía; (5) si el producto es web, pedir **variantes desktop y móvil**; (6) estados vacío, carga y error en flujos críticos. Si faltan datos, **infórelos** y declara **supuestos explícitos** dentro del bloque Stitch.";
      const docs = options.uxGuideAdditionalDocs;
      if (docs) {
        const blocks: [string, string | undefined][] = [
          ["Spec (SDD what/why)", docs.spec],
          ["Casos de uso", docs.useCases],
          ["Historias de usuario", docs.userStories],
          ["Flujos de lógica / interacción", docs.logicFlows],
          ["Arquitectura del sistema (impacto UI)", docs.architecture],
          ["Contratos de API (datos y pantallas)", docs.apiContracts],
          ["Benchmark & Gap Analysis (dominio)", docs.dbga],
          ["Resumen fase 0", docs.phase0],
        ];
        for (const [title, body] of blocks) {
          if (body?.trim()) {
            s += `\n\n[${title} — contexto para Guía UX/UI y Prompt Stitch del producto]\n---\n${body.trim()}\n---`;
          }
        }
      }
    }
    // Design Reference: inyectar tokens de diseño seleccionado
    const designRefSlug = options?.uxGuideDesignRef;
    const designRefBlock = options?.uxGuideDesignRefPromptBlock;
    if (designRefSlug && designRefBlock) {
      s += `\n\n## [Design Reference activo: ${designRefSlug}]\n${designRefBlock}\n\n### Instrucciones para el Design Reference\n1. Los tokens anteriores son REFERENCIALES — adapta colores, tipografía y componentes al dominio del proyecto descrito en el MDD.\n2. No copies los valores exactos — transpórtalos al contexto del producto.\n3. Si el proyecto tiene un codebase existente (LEGACY), prioriza los tokens reales del código sobre los de referencia.\n4. Mantén la personalidad general del design system de referencia pero hazla propia del producto.\n5. Conserva obligatoriamente WCAG AA (contraste ≥4.5:1) en todos los componentes.`;
    } else if (designRefSlug === "auto") {
      // Matching automático: el LLM debe inferir el estilo del MDD
      s += "\n\n**[Modo: Auto-match de diseño]** Analiza el MDD y el dominio del proyecto para seleccionar automáticamente una personalidad visual coherente. No generes una paleta genérica — busca una dirección de diseño específica que refleje el dominio (fintech → elegante, seguro; creativo → vibrante, expresivo; SaaS → limpio, profesional; salud → cálido, tranquilo).";
    }
    return s;
  }

  async generateResponse(
    prompt: string,
    history: LlmChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<string> {
    try {
      const isUxUiGuide = options?.activeTab?.trim() === "ux-ui-guide";
      const isBenchmarkRefine =
        options?.activeTab?.trim() === "benchmark" && (options?.currentDbgaContent?.trim() ?? "").length > 0;
      let systemPrompt =
        options?.systemPrompt ??
        (options?.welcomeBrief
          ? WELCOME_BRIEF_SYSTEM_PROMPT
          : isBenchmarkRefine
            ? BENCHMARK_REFINE_PROMPT
            : isUxUiGuide
              ? UX_UI_GUIDE_PROMPT
              : MASTER_PROMPT);
      if (options?.activeTab?.trim()) {
        const at = options.activeTab.trim();
        const label = AiService.ACTIVE_TAB_LABELS[at] ?? at;
        systemPrompt += `\n\n[Contexto de documento activo:] El usuario está trabajando en: **${label}**. Adapta tu respuesta a ese documento (preguntas, sugerencias o ediciones relevantes para ese contexto).\n\n**INSTRUCCIÓN CRÍTICA — DETECCIÓN DE CAMBIOS:** Cualquier afirmación del usuario sobre lo que el proyecto **debe incluir, tener, usar o cambiar** (ej. "necesitamos X", "queremos Y", "falta Z", "usa W", "debe tener V", "agrega", "cambia", "modifica", "actualiza", "corrige", "elimina") es una **solicitud de modificación del documento actual**. **NO** preguntes si es consulta o cambio — el usuario ya lo dijo. Si hay ambigüedad genuina (que no sea sobre el documento actual), pregunta UNA VEZ. Cuando el usuario responda "sí", "dale", "aplica", "correcto" o similar a una pregunta tuya, **_DEBES_ devolver el documento actualizado con su delimitador ---FIN_TAG--- inmediatamente.** Nunca respondas solo "Hecho" o "MDD generado" sin el contenido del documento antes del delimitador.`;

        // Instrucción para delimitadores universales en el chat (aplicar cambios al documento)
        const tagMap: Record<string, string> = {
          mdd: "MDD",
          benchmark: "DBGA",
          spec: "SPEC",
          brd: "BRD",
          architecture: "ARCH",
          "use-cases": "USECASES",
          "user-stories": "STORIES",
          blueprint: "BLUEPRINT",
          "api-contracts": "API",
          "logic-flows": "FLOWS",
          tasks: "TASKS",
          infra: "INFRA",
          phase0: "PHASE0",
          "ux-ui-guide": "UX_UI",
        };
        const tag = tagMap[at];
        if (tag && !options?.welcomeBrief) {
          systemPrompt += `\n\n**Instrucción DE delimitador (OBLIGATORIO):** Cuando generes o actualices el documento de ${label} (completo o solo una sección), DEBES escribir el contenido y TERMINAR con la línea exacta \`---FIN_${tag}---\`. Lo que vaya después se mostrará como mensaje en el chat. Sin ese delimitador, el sistema NO persiste ningún cambio y el usuario no ve nada en el panel del documento.`;
          if (at === "benchmark") {
            systemPrompt +=
              "\n\n**OBLIGATORIO — Benchmark (DBGA):** Si el usuario pide **añadir, modificar o corregir** el análisis, devuelve el **DBGA COMPLETO** (todo lo que ya existía en el contexto más tus cambios), no solo el párrafo nuevo. Termina con `---FIN_DBGA---` y un mensaje breve después. **Nunca** respondas solo \"He añadido…\" sin el markdown completo antes del delimitador.";
          }
          if (at === "mdd") {
            systemPrompt +=
              "\n\n**\u26a0\ufe0f REGLA ABSOLUTA \u2014 MDD:\n1. **No eval\u00faes si un cambio es \"ya est\u00e1 cubierto\" o \"impacto m\u00ednimo\".** Si el usuario expresa un requisito expl\u00edcito (\"necesitamos X\", \"queremos Y\", \"usa Z\", \"agrega\", \"cambia\", \"modifica\", \"actualiza\", \"corrige\", \"elimina\"), es una orden, no una sugerencia. **El requerimiento del usuario siempre tiene prioridad sobre tu inferencia.**\n2. **NO respondas \"El MDD actual ya especifica...\" y te saltes el cambio.** Si el usuario pide algo, actualiza el documento para reflejarlo expl\u00edcitamente.\n3. Cada vez que el usuario pida agregar, cambiar, modificar, actualizar, corregir o eliminar algo del MDD, o cuando despu\u00e9s de preguntar confirme (\"s\u00ed\", \"dale\", \"aplica\", \"correcto\"), **DEBES** devolver el **MDD COMPLETO ACTUALIZADO** (conservando TODO el contenido existente m\u00e1s los cambios) terminando con `---FIN_MDD---`.\n4. **NUNCA** respondas solo con un mensaje como \"MDD actualizado\" o \"Hecho\" \u2014 si lo haces, el sistema NO persiste ning\u00fan cambio y el usuario cree que se aplic\u00f3 cuando no es as\u00ed. Siempre incluye un mensaje breve resumiendo el cambio DESPU\u00c9S de `---FIN_MDD---`.";
          }
          if (at === "spec") {
            systemPrompt +=
              "\n\n**Cuando el usuario confirme que integre o aplique cambios al Spec** (ej. \"sí ingrésalo\", \"integralo\", \"aplica\", \"confirma\", \"actualiza el spec\"), **debes** devolver el **documento Spec completo** actualizado (incluyendo lo que ya existía más la nueva sección o cambios), terminando con \`---FIN_SPEC---\`. Nunca respondas solo con un mensaje tipo \"El documento Spec ha sido actualizado con éxito\": el sistema solo persiste cuando encuentra el contenido del documento seguido de ---FIN_SPEC---.";
          }
          if (at === "brd") {
            systemPrompt +=
              "\n\n**OBLIGATORIO - BRD (formato exacto obligatorio):**\n\n**NO preguntes ni pidas confirmaci\u00f3n**. Cuando el usuario pida agregar, modificar o eliminar algo del BRD, **Aplica el cambio inmediatamente** siguiendo este formato:\n\n```\n[BRD completo actualizado con el cambio incorporado, conservando TODO el contenido existente]\n---FIN_BRD---\n[breve mensaje de chat resumiendo lo que cambiaste]\n```\n\nEJEMPLO:\n```\n# Business Requirements Document: CRM Inmobiliario\n\n## Alcance\n### Funcional\nRF-1: ...\nRF-15: ...\n---FIN_BRD---\nAgregado RF-15 al alcance.\n```\n\n**IMPORTANTE:** Sin ``---FIN_BRD---`` no se persiste NADA. El contenido del BRD va ANTES del delimitador. El mensaje de chat va DESPU\u00c9S.";
          }
          if (at === "blueprint") {
            systemPrompt +=
              "\n\n**OBLIGATORIO - Blueprint:** Cuando el usuario pida **agregar, modificar o eliminar** algo del Blueprint, **debes** devolver el **Blueprint completo actualizado** (conservando TODO el contenido existente) terminando con `---FIN_BLUEPRINT---`. Si solo envías una sección, el sistema la **fusiona** automáticamente con el contenido actual. Nunca respondas solo con un mensaje tipo \"El Blueprint ha sido actualizado\" — el sistema solo persiste cuando encuentra el contenido del documento seguido de `---FIN_BLUEPRINT---`.";
          }
          if (at === "ux-ui-guide") {
            systemPrompt +=
              "\n\n**OBLIGATORIO - Guía UX/UI:** Cuando el usuario pida **agregar, modificar o regenerar** la Guía UX/UI, **debes** devolver la **Guía UX/UI completa actualizada** (conservando TODO el contenido existente) terminando con `---FIN_UX_UI---`. Si solo envías un fragmento sin el documento completo, el sistema ignora el cambio y el usuario no ve nada. **Siempre incluye la guía COMPLETA antes del delimitador.**";
          }
          systemPrompt += `\n\n${DOCUMENT_CHANGELOG_CHAT_INSTRUCTION}`;
        }
      }
      if (!options?.welcomeBrief) {
        if (options?.currentDbgaContent?.trim()) {
          if (isBenchmarkRefine) {
            systemPrompt +=
              "\n\n[Contenido actual del Benchmark & Gap Analysis del proyecto (a refinar según la petición del usuario)]\n---\n" +
              options.currentDbgaContent.trim() +
              "\n---";
          } else if (!options?.currentMddContent?.trim()) {
            systemPrompt +=
              "\n\n[Contexto base: Domain Benchmark & Gap Analysis del usuario. Úsalo como referencia para guiar la entrevista y redactar el MDD.]\n---\n" +
              options.currentDbgaContent.trim().slice(0, 4000) +
              "\n---";
          }
        }
        if (options?.currentMddContent?.trim()) {
          systemPrompt +=
            "\n\n[Contenido actual del MDD del proyecto (puede incluir ediciones del usuario)]\n---\n" +
            options.currentMddContent.trim() +
            "\n---";
        }
        if (isUxUiGuide && options?.currentBlueprintContent?.trim()) {
          systemPrompt +=
            "\n\n[Blueprint del proyecto: estructura, pantallas y módulos. Úsalo para alinear la Guía UX/UI con las pantallas y flujos descritos.]\n---\n" +
            options.currentBlueprintContent.trim().slice(0, 6000) +
            "\n---";
        }
        if (options?.currentUxUiGuideContent?.trim()) {
          systemPrompt +=
            "\n\n[Contenido actual de la Guía UX/UI del proyecto (puede incluir ediciones del usuario)]\n---\n" +
            options.currentUxUiGuideContent.trim().slice(0, 6000) +
            "\n---";
        }
        if (options?.activeTab?.trim() === "spec" && options?.currentSpecContent?.trim()) {
          systemPrompt +=
            "\n\n[Contenido actual del Spec del proyecto. Al integrar o actualizar, incluye todo esto más la nueva sección o cambios, y termina con ---FIN_SPEC---.]\n---\n" +
            options.currentSpecContent.trim().slice(0, 12000) +
            "\n---";
        }
        if (options?.activeTab?.trim() === "brd" && options?.currentBrdContent?.trim()) {
          systemPrompt +=
            "\n\n[BRD actual de la etapa del Workshop. Al actualizar, conserva lo acordado y fusiona cambios; termina con ---FIN_BRD---.]\n---\n" +
            options.currentBrdContent.trim().slice(0, 8000) +
            "\n---";
        }
        if (options?.learningHistory?.trim()) {
          systemPrompt +=
            "\n\n**HISTORIAL_DE_APRENDIZAJE (proyectos previos del usuario):**\n---\n" +
            options.learningHistory.trim().slice(0, 6000) +
            "\n---";
        }
        if (options?.complexityInterviewContext?.trim()) {
          systemPrompt +=
            "\n\n**[Política de complejidad / entrevista Fase 0 — aplicar en esta conversación]**\n" +
            options.complexityInterviewContext.trim().slice(0, 8000);
        }
      }
      systemPrompt = this.appendUxGuideStitchPolicy(systemPrompt, options);
      if (
        (options?.userMessageImages?.length ?? 0) > 0 ||
        history.some((h) => h.role === "user" && (h.images?.length ?? 0) > 0)
      ) {
        systemPrompt +=
          "\n\n**Entrada multimodal:** Puede haber imágenes en el historial o en este mensaje. Interprétalas en el contexto del documento activo y la conversación (modelo de datos, UI, flujos); no inventes detalles no visibles.";
        if (
          options?.activeTab?.trim() === "mdd" &&
          (options?.currentMddContent?.trim().length ?? 0) > 400
        ) {
          systemPrompt +=
            "\n\n**MDD no destructivo (obligatorio si ya hay MDD en contexto):** El bloque \"Contenido actual del MDD\" incluye **todas** las secciones. Si el usuario pide revisar, alinear o ampliar (p. ej. tras un diagrama), **no sustituyas el proyecto por un solo fragmento**: devuelve el **MDD completo** actualizado (copia el contenido existente y aplica cambios), terminando con `---FIN_MDD---`. Si optas por enviar **solo una sección**, debe empezar por el **mismo patrón de encabezado** que ya usa el documento para esa sección (`## N.` recomendado, mismo `N` que corresponda). Nunca envíes solo tablas o JSON sueltos sin el título de sección reconocible.";
        }
      }
      const ts = () => new Date().toISOString();
      console.log(`[AiService] ${ts()} → Enviando al LLM:`, {
        activeTab: options?.activeTab,
        welcomeBrief: options?.welcomeBrief === true,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 120) + (prompt.length > 120 ? "…" : ""),
        systemPromptLength: systemPrompt.length,
        approxTotalChars: systemPrompt.length + prompt.length,
        historyLength: history.length,
      });
      const out = await (await this.provider()).generateResponse(prompt, history, {
        systemPrompt,
        userMessageImages: options?.userMessageImages,
      });
      console.log(`[AiService] ${ts()} ← Respuesta del LLM recibida:`, {
        length: out?.length ?? 0,
        preview: (out ?? "").slice(0, 200) + ((out?.length ?? 0) > 200 ? "…" : ""),
      });
      return out;
    } catch (err) {
      console.error("[AiService] generateResponse error", err);
      throw err;
    }
  }

  /**
   * Streaming: same system prompt as generateResponse, yields chunks from the provider.
   */
  async generateResponseStream(
    prompt: string,
    history: LlmChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>> {
    const isUxUiGuide = options?.activeTab?.trim() === "ux-ui-guide";
    const isBenchmarkRefine =
      options?.activeTab?.trim() === "benchmark" && (options?.currentDbgaContent?.trim() ?? "").length > 0;
    let systemPrompt =
      options?.systemPrompt ??
      (options?.welcomeBrief
        ? WELCOME_BRIEF_SYSTEM_PROMPT
        : isBenchmarkRefine
          ? BENCHMARK_REFINE_PROMPT
          : isUxUiGuide
            ? UX_UI_GUIDE_PROMPT
            : MASTER_PROMPT);
    if (options?.activeTab?.trim()) {
      const at = options.activeTab.trim();
      const label = AiService.ACTIVE_TAB_LABELS[at] ?? at;
      systemPrompt += `\n\n[Contexto de documento activo:] El usuario está trabajando en: **${label}**. Adapta tu respuesta a ese documento (preguntas, sugerencias o ediciones relevantes para ese contexto).`;

      // Instrucción para delimitadores universales en el chat (aplicar cambios al documento)
      const tagMap: Record<string, string> = {
        mdd: "MDD",
        benchmark: "DBGA",
        spec: "SPEC",
        brd: "BRD",
        architecture: "ARCH",
        "use-cases": "USECASES",
        "user-stories": "STORIES",
        blueprint: "BLUEPRINT",
        "api-contracts": "API",
        "logic-flows": "FLOWS",
        tasks: "TASKS",
        infra: "INFRA",
        phase0: "PHASE0",
        "ux-ui-guide": "UX_UI",
      };
      const tag = tagMap[at];
      if (tag && !options?.welcomeBrief) {
        systemPrompt += `\n\nSi decides generar o actualizar el documento de ${label} (completo o solo una sección), escribe el contenido y TERMINA con la línea exacta \`---FIN_${tag}---\`. Lo que vaya después se mostrará como mensaje en el chat. Así el sistema aplicará los cambios al documento del proyecto.`;
        if (at === "benchmark") {
          systemPrompt +=
            "\n\n**OBLIGATORIO — Benchmark (DBGA):** Devuelve el **DBGA COMPLETO** (contexto actual + cambios), no solo el fragmento nuevo. Termina con `---FIN_DBGA---`. Sin delimitador no se persiste nada en el panel.";
        }
        if (at === "mdd") {
            systemPrompt +=
              "\n\n**\u26a0\ufe0f REGLA ABSOLUTA \u2014 MDD:\n1. **No eval\u00faes si un cambio es \"ya est\u00e1 cubierto\" o \"impacto m\u00ednimo\".** Si el usuario expresa un requisito expl\u00edcito (\"necesitamos X\", \"queremos Y\", \"usa Z\", \"agrega\", \"cambia\", \"modifica\", \"actualiza\", \"corrige\", \"elimina\"), es una orden, no una sugerencia. **El requerimiento del usuario siempre tiene prioridad sobre tu inferencia.**\n2. **NO respondas \"El MDD actual ya especifica...\" y te saltes el cambio.** Si el usuario pide algo, actualiza el documento para reflejarlo expl\u00edcitamente.\n3. Cada vez que el usuario pida agregar, cambiar, modificar, actualizar, corregir o eliminar algo del MDD, o cuando despu\u00e9s de preguntar confirme (\"s\u00ed\", \"dale\", \"aplica\", \"correcto\"), **DEBES** devolver el **MDD COMPLETO ACTUALIZADO** (conservando TODO el contenido existente m\u00e1s los cambios) terminando con `---FIN_MDD---`.\n4. **NUNCA** respondas solo con un mensaje como \"MDD actualizado\" o \"Hecho\" \u2014 si lo haces, el sistema NO persiste ning\u00fan cambio y el usuario cree que se aplic\u00f3 cuando no es as\u00ed. Siempre incluye un mensaje breve resumiendo el cambio DESPU\u00c9S de `---FIN_MDD---`.";
          }
        if (at === "spec") {
          systemPrompt +=
            "\n\n**Cuando el usuario confirme que integre o aplique cambios al Spec** (ej. \"sí ingrésalo\", \"integralo\", \"aplica\", \"confirma\", \"actualiza el spec\"), **debes** devolver el **documento Spec completo** actualizado (incluyendo lo que ya existía más la nueva sección o cambios), terminando con \`---FIN_SPEC---\`. Nunca respondas solo con un mensaje tipo \"El documento Spec ha sido actualizado con éxito\": el sistema solo persiste cuando encuentra el contenido del documento seguido de ---FIN_SPEC---.";
        }
        if (at === "brd") {
          systemPrompt +=
            "\n\n**OBLIGATORIO - BRD (formato exacto obligatorio):**\n\n**NO preguntes ni pidas confirmaci\u00f3n**. Cuando el usuario pida agregar, modificar o eliminar algo del BRD, **Aplica el cambio inmediatamente** siguiendo este formato:\n\n```\n[BRD completo actualizado con el cambio incorporado, conservando TODO el contenido existente]\n---FIN_BRD---\n[breve mensaje de chat resumiendo lo que cambiaste]\n```\n\nEJEMPLO:\n```\n# Business Requirements Document: CRM Inmobiliario\n\n## Alcance\n### Funcional\nRF-1: ...\nRF-15: ...\n---FIN_BRD---\nAgregado RF-15 al alcance.\n```\n\n**IMPORTANTE:** Sin ``---FIN_BRD---`` no se persiste NADA. El contenido del BRD va ANTES del delimitador. El mensaje de chat va DESPU\u00c9S.";
        }
          if (at === "blueprint") {
            systemPrompt +=
              "\n\n**OBLIGATORIO - Blueprint:** Cuando el usuario pida **agregar, modificar o eliminar** algo del Blueprint, **debes** devolver el **Blueprint completo actualizado** (conservando TODO el contenido existente) terminando con `---FIN_BLUEPRINT---`. Si solo envías una sección, el sistema la **fusiona** automáticamente con el contenido actual. Nunca respondas solo con un mensaje tipo \"El Blueprint ha sido actualizado\" — el sistema solo persiste cuando encuentra el contenido del documento seguido de `---FIN_BLUEPRINT---`.";
          }
        if (at === "ux-ui-guide") {
          systemPrompt +=
            "\n\n**OBLIGATORIO - Guía UX/UI:** Devuelve la **Guía UX/UI completa** terminando con `---FIN_UX_UI---`.";
        }
        systemPrompt += `\n\n${DOCUMENT_CHANGELOG_CHAT_INSTRUCTION}`;
        }
    }
    if (!options?.welcomeBrief) {
      if (options?.currentDbgaContent?.trim()) {
        if (isBenchmarkRefine) {
          systemPrompt +=
            "\n\n[Contenido actual del Benchmark & Gap Analysis del proyecto (a refinar según la petición del usuario)]\n---\n" +
            options.currentDbgaContent.trim() +
            "\n---";
        } else if (!options?.currentMddContent?.trim()) {
          systemPrompt +=
            "\n\n[Contexto base: Domain Benchmark & Gap Analysis del usuario. Úsalo como referencia para guiar la entrevista y redactar el MDD.]\n---\n" +
            options.currentDbgaContent.trim().slice(0, 4000) +
            "\n---";
        }
      }
      if (options?.currentMddContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual del MDD del proyecto (puede incluir ediciones del usuario)]\n---\n" +
          options.currentMddContent.trim() +
          "\n---";
      }
      if (isUxUiGuide && options?.currentBlueprintContent?.trim()) {
        systemPrompt +=
          "\n\n[Blueprint del proyecto: estructura, pantallas y módulos. Úsalo para alinear la Guía UX/UI con las pantallas y flujos descritos.]\n---\n" +
          options.currentBlueprintContent.trim().slice(0, 6000) +
          "\n---";
      }
      if (options?.currentUxUiGuideContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de la Guía UX/UI del proyecto (puede incluir ediciones del usuario)]\n---\n" +
          options.currentUxUiGuideContent.trim().slice(0, 6000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "spec" && options?.currentSpecContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual del Spec del proyecto. Al integrar o actualizar, incluye todo esto más la nueva sección o cambios, y termina con ---FIN_SPEC---.]\n---\n" +
          options.currentSpecContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "brd" && options?.currentBrdContent?.trim()) {
        systemPrompt +=
          "\n\n[BRD actual de la etapa del Workshop. Al actualizar, conserva lo acordado y fusiona cambios; termina con ---FIN_BRD---.]\n---\n" +
          options.currentBrdContent.trim().slice(0, 8000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "architecture" && (options as any).currentArchitectureContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual del documento Architecture del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_ARCH---.]\n---\n" +
          (options as any).currentArchitectureContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "use-cases" && (options as any).currentUseCasesContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de Use Cases del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_USECASES---.]\n---\n" +
          (options as any).currentUseCasesContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "user-stories" && (options as any).currentUserStoriesContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de User Stories del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_STORIES---.]\n---\n" +
          (options as any).currentUserStoriesContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "blueprint" && options?.currentBlueprintContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual del Blueprint del proyecto. Al actualizar, incluye todo esto más los cambios; termina con ---FIN_BLUEPRINT---.]\n---\n" +
          options.currentBlueprintContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "api-contracts" && (options as any).currentApiContractsContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de API Contracts del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_API---.]\n---\n" +
          (options as any).currentApiContractsContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "logic-flows" && (options as any).currentLogicFlowsContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de Logic Flows del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_FLOWS---.]\n---\n" +
          (options as any).currentLogicFlowsContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "tasks" && (options as any).currentTasksContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de Tasks del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_TASKS---.]\n---\n" +
          (options as any).currentTasksContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.activeTab?.trim() === "infra" && (options as any).currentInfraContent?.trim()) {
        systemPrompt +=
          "\n\n[Contenido actual de Infraestructura del proyecto. Al actualizar, incluye el contenido completo más los cambios; termina con ---FIN_INFRA---.]\n---\n" +
          (options as any).currentInfraContent.trim().slice(0, 12000) +
          "\n---";
      }
      if (options?.learningHistory?.trim()) {
        systemPrompt +=
          "\n\n**HISTORIAL_DE_APRENDIZAJE (proyectos previos del usuario):**\n---\n" +
          options.learningHistory.trim().slice(0, 6000) +
          "\n---";
      }
      if (options?.complexityInterviewContext?.trim()) {
        systemPrompt +=
          "\n\n**[Política de complejidad / entrevista Fase 0 — aplicar en esta conversación]**\n" +
          options.complexityInterviewContext.trim().slice(0, 8000);
      }
    }
    systemPrompt = this.appendUxGuideStitchPolicy(systemPrompt, options);
    if (
        (options?.userMessageImages?.length ?? 0) > 0 ||
        history.some((h) => h.role === "user" && (h.images?.length ?? 0) > 0)
      ) {
      systemPrompt +=
        "\n\n**Entrada multimodal:** Puede haber imágenes en el historial o en este mensaje. Interprétalas en el contexto del documento activo y la conversación (modelo de datos, UI, flujos); no inventes detalles no visibles.";
      if (
        options?.activeTab?.trim() === "mdd" &&
        (options?.currentMddContent?.trim().length ?? 0) > 400
      ) {
        systemPrompt +=
          "\n\n**MDD no destructivo (obligatorio si ya hay MDD en contexto):** El bloque \"Contenido actual del MDD\" incluye **todas** las secciones. Si el usuario pide revisar, alinear o ampliar (p. ej. tras un diagrama), **no sustituyas el proyecto por un solo fragmento**: devuelve el **MDD completo** actualizado (copia el contenido existente y aplica cambios), terminando con `---FIN_MDD---`. Si optas por enviar **solo una sección**, debe empezar por el **mismo patrón de encabezado** que ya usa el documento para esa sección (`## N.` recomendado, mismo `N` que corresponda). Nunca envíes solo tablas o JSON sueltos sin el título de sección reconocible.";
      }
    }
    const userId = getRequestUserId();
    try {
      const runtime = await this.aiFactory.resolveRuntime(userId);
      this.logger.debug(
        `[generateResponseStream] userId=${userId} tab=${options?.activeTab ?? "mdd"} provider=${runtime.providerId} model=${runtime.chatModel} fallbacks=[${(runtime.chatModelFallbacks ?? []).join(",")}]`,
      );
    } catch (err) {
      this.logger.warn(
        `[generateResponseStream] resolveRuntime falló userId=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return (await this.provider()).generateResponseStream(prompt, history, { ...options, systemPrompt });
  }

  /**
   * Visión → texto para el chat y agentes sin multimodal (Manager MDD, orquestador, historial).
   */
  async describeImagesForChat(
    userText: string,
    images: ChatImagePart[],
    activeTab?: string,
  ): Promise<string> {
    if (!images.length) return "";
    const userId = getRequestUserId();
    const visionProvider = await this.aiFactory.createForVisionUser(userId);
    const tab = (activeTab ?? "mdd").trim() || "mdd";
    const hint = (userText ?? "").trim().slice(0, 4000) || "(sin texto adicional)";
    const tabHint =
      tab === "mdd"
        ? "Master Design Document"
        : tab === "ux-ui-guide"
          ? "Guía UX/UI y design system"
          : tab === "benchmark"
            ? "Fase 0 — Domain Benchmark & Gap Analysis (DBGA); tablas espejo, catálogo OBP/OBP4MO, tenant_id"
            : `documento o pestaña «${tab}» del Workshop`;
    const benchmarkExtra =
      tab === "benchmark"
        ? " Si es un ERD o diagrama relacional, lista tablas, columnas, PK/FK y jerarquía (país→estado→ciudad→colonia, etc.)."
        : "";
    const prompt = `El usuario trabaja en ${tabHint}. Mensaje o petición asociada:\n---\n${hint}\n---\n\nDescribe con precisión lo que muestran las imágenes (UI, diagramas, datos, flujos, stack, texto visible, etc.). Responde en español, en viñetas; indica partes ilegibles o ambiguas.${benchmarkExtra}`;
    const out = await visionProvider.generateResponse(prompt, [], {
      systemPrompt:
        "Eres arquitecto de software: extrae solo información sustentada en las imágenes; no inventes.",
      userMessageImages: images,
    });
    return out.trim().slice(0, 12000);
  }

  /** Alias del pipeline MDD (Manager LangGraph). */
  async describeImagesForMddPipeline(userText: string, images: ChatImagePart[]): Promise<string> {
    return this.describeImagesForChat(userText, images, "mdd");
  }

  async parseChecklist(text: string) {
    try {
      return await (await this.provider()).parseChecklist(text);
    } catch (err) {
      console.error("[AiService] parseChecklist error", err);
      throw err;
    }
  }

  /**
   * Genera el contenido de blueprint.md a partir del MDD.
   * Usa BLUEPRINT_PROMPT como system y el MDD como user message.
   */
  /**
   * Genera el documento Spec (SDD: what/why) desde Benchmark + opcional phase0/clarifiedScope.
   */
  async generateSpec(
    inputContent: string,
    phase0Summary?: string | null,
    source: "dbga" | "mdd" = "dbga",
    options?: LegacyGenerateOptions,
  ): Promise<string> {
    const content = (inputContent?.trim() ?? "").slice(0, 12000);
    const phase0 = (phase0Summary?.trim() ?? "").slice(0, 4000);
    const label = source === "mdd" ? "MDD" : "Benchmark (DBGA)";
    let prompt =
      content.length > 0
        ? `Genera el documento Spec según las instrucciones del system prompt.\n\n${label}:\n---\n${content}\n---` +
          (phase0 ? `\n\nResumen fase 0 / alcance:\n---\n${phase0}\n---` : "")
        : "No hay Benchmark ni MDD. Genera un Spec genérico (objetivos, alcance, criterios de éxito, user journeys) en markdown.";
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], { systemPrompt: SPEC_PROMPT });
  }

  /**
   * Genera el documento Tasks (breakdown) desde MDD + Blueprint.
   */
  async generateTasks(mddContent: string, blueprintContent?: string | null, options?: LegacyGenerateOptions & { navigationMap?: string }): Promise<string> {
    const mdd = (mddContent?.trim() ?? "").slice(0, 30000);
    const blueprint = (blueprintContent?.trim() ?? "").slice(0, 15000);
    const navMap = (options?.navigationMap?.trim() ?? "").slice(0, 8000);
    let prompt =
      mdd.length > 0
        ? "Genera el documento Tasks según las instrucciones del system prompt.\n\nMDD:\n---\n" +
        mdd +
        "\n---\n\n" +
        (blueprint ? "Blueprint:\n---\n" + blueprint + "\n---" : "")
        : "No hay MDD. Genera un documento Tasks genérico (Backend, Frontend, Infra) con ítems comprobables.";
    if (navMap.length > 0) {
      prompt += "\n\n## Mapa de Navegación del Proyecto\n\n" + navMap;
    }
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], { systemPrompt: TASKS_PROMPT + NO_MILITAR_INSTRUCTION });
  }

  async generateArchitecture(mddContent: string, blueprintContent?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mdd = (mddContent?.trim() ?? "").slice(0, 30000);
    const blueprint = (blueprintContent?.trim() ?? "").slice(0, 15000);
    let prompt =
      mdd.length > 0
        ? "Genera el documento de **Arquitectura del sistema** (producto del MDD) según el system prompt. Describe el software legacy real o planificado: módulos, datos, APIs, flujos — **no** diseño multi-agente ni nombre TheForge como producto.\n\nMDD:\n---\n" +
        mdd +
        "\n---\n\n" +
        (blueprint ? "Blueprint:\n---\n" + blueprint + "\n---" : "")
        : "No hay MDD. Genera un documento breve de arquitectura genérica (capas, trade-offs) sin inventar dominio ni agentes.";
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], { systemPrompt: ARCHITECTURE_PROMPT + NO_MILITAR_INSTRUCTION });
  }

  async generateUseCases(mddContent: string, specContent?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mddRaw = mddContent?.trim() ?? "";
    if (!mddRaw) {
      return (
        "# Casos de uso\n\n" +
        "No hay **MDD** (Constitución) disponible. No se generaron casos de uso automáticamente para **evitar inventar un dominio ajeno** al proyecto.\n\n" +
        "Completa el MDD y, si aplica, el **Spec**; luego vuelve a ejecutar **Generar casos de uso** desde el Workshop.\n"
      );
    }
    const mdd = mddRaw.slice(0, 30000);
    const spec = (specContent?.trim() ?? "").slice(0, 15000);
    let prompt =
      "Genera el documento de Casos de Uso según las instrucciones del system prompt. " +
      "Cada flujo debe alinearse al texto del MDD y del Spec; no cites archivos ni entidades que no aparezcan en esos documentos.\n\n" +
      "MDD:\n---\n" +
      mdd +
      "\n---\n\n" +
      (spec ? "Spec (what/why):\n---\n" + spec + "\n---" : "");
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], { systemPrompt: USE_CASES_PROMPT });
  }

  async generateUserStories(mddContent: string, specContent?: string | null, useCasesContent?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mdd = (mddContent?.trim() ?? "").slice(0, 30000);
    const spec = (specContent?.trim() ?? "").slice(0, 15000);
    const useCases = (useCasesContent?.trim() ?? "").slice(0, 15000);
    const constitutionNote =
      "El **MDD es la Constitución del proyecto**. Las historias de usuario deben derivarse **únicamente** del MDD, Spec y Casos de Uso. No inventes funcionalidades no descritas en estos documentos.\n\n";
    let prompt: string;
    if (mdd.length > 0) {
      prompt =
        "Genera el documento de Historias de Usuario según las instrucciones del system prompt. " +
        constitutionNote +
        "MDD:\n---\n" +
        mdd +
        "\n---\n\n" +
        (spec ? "Spec:\n---\n" + spec + "\n---\n\n" : "") +
        (useCases ? "Casos de Uso:\n---\n" + useCases + "\n---" : "");
    } else {
      prompt =
        "No hay MDD disponible. No generes historias inventadas. Responde con un documento markdown que contenga solo un título " +
        "# Historias de Usuario y un párrafo indicando que se requiere el MDD (y opcionalmente Spec y Casos de Uso) para derivar historias de usuario alineadas al alcance del proyecto.";
    }
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], { systemPrompt: USER_STORIES_PROMPT });
  }

  async generateBlueprint(mddContent: string, gapsFeedback?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const constitutionNote =
      "El siguiente documento es la **Constitución del proyecto** (MDD). Tu salida debe adherirse a él en todo momento.\n\n";
    let prompt =
      mddContent.trim().length > 0
        ? "Genera el blueprint.md según las instrucciones del system prompt. " +
        constitutionNote +
        "MDD:\n\n---\n" +
        mddContent.trim() +
        "\n---"
        : "No hay MDD aún. Genera un blueprint.md genérico para un monorepo Turborepo con NestJS, React, Prisma y PostgreSQL.";
    if (gapsFeedback?.trim()) {
      prompt +=
        "\n\n**Los siguientes puntos deben corregirse o incorporarse:**\n---\n" + gapsFeedback.trim() + "\n---";
    }
    if (options?.theforgeContext?.trim()) {
      prompt = prependTheForgePrompt(prompt, options.theforgeContext);
      const legacyBlueprintInstruction =
        "\n\n**CRÍTICO — Proyecto existente (contexto Relic):** El bloque anterior describe el codebase REAL indexado por el MCP. El Blueprint DEBE describir ÚNICAMENTE esta estructura y stack. **PROHIBIDO inventar:** no Turborepo, Nx, NestJS, ni nuevos repos ni directorios que no aparezcan en ese contexto. El sistema puede tener uno o varios repositorios; indica los repos y carpetas reales. Solo añade o modifica lo que el MDD exija para el cambio. Si el contexto no menciona un framework concreto, no lo inventes.";
      return this.generateResponse(prompt, [], {
        systemPrompt: BLUEPRINT_PROMPT + NO_MILITAR_INSTRUCTION + legacyBlueprintInstruction,
      });
    }
    return this.generateResponse(prompt, [], {
      systemPrompt: BLUEPRINT_PROMPT + NO_MILITAR_INSTRUCTION,
    });
  }

  async generateApiContracts(mddContent: string, blueprintContent?: string | null, gapsFeedback?: string | null, brdContent?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mdd = mddContent?.trim() ?? "";
    const blueprint = (blueprintContent?.trim() ?? "").slice(0, 16000);
    const brd = (brdContent?.trim() ?? "").slice(0, 8000);
    const constitutionNote =
      "El siguiente documento es la **Constitución del proyecto** (MDD). Tu salida debe adherirse a él en todo momento.\n\n";
    let prompt =
      mdd.length > 0
        ? "Genera el documento de Contratos de API según las instrucciones del system prompt.\n\n" +
        constitutionNote +
        "MDD:\n---\n" +
        mdd +
        "\n---\n\n" +
        (blueprint ? "Blueprint (esquema Prisma / estructura):\n---\n" + blueprint + "\n---" : "") +
        (brd ? "\n\n**BRD (requerimientos de negocio):** Los contratos de API deben satisfacer estos requerimientos.\n---\n" + brd + "\n---" : "")
        : "No hay MDD. Genera un documento de contratos API genérico (endpoints, request/response, códigos HTTP).";
    if (gapsFeedback?.trim()) {
      prompt +=
        "\n\n**Los siguientes puntos deben corregirse o incorporarse:**\n---\n" + gapsFeedback.trim() + "\n---";
    }
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    if (options?.contractSpecs?.trim()) {
      const specsBlock = options.contractSpecs.trim().slice(0, 12000);
      prompt +=
        "\n\n**Contratos reales desde el codebase (get_contract_specs):** Usa estas firmas, props y tipos reales para alinear los endpoints del documento. No inventes tipos que contradigan esta evidencia.\n---\n" +
        specsBlock +
        "\n---";
    }
    return this.generateResponse(prompt, [], {
      systemPrompt: API_CONTRACTS_PROMPT + NO_MILITAR_INSTRUCTION,
    });
  }

  async generateLogicFlows(mddContent: string, gapsFeedback?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mdd = mddContent?.trim() ?? "";
    const constitutionNote =
      "El siguiente documento es la **Constitución del proyecto** (MDD). Tu salida debe adherirse a él en todo momento.\n\n";
    let prompt =
      mdd.length > 0
        ? "Genera el documento de Casos de Uso y Flujos de Lógica según las instrucciones del system prompt. " +
        constitutionNote +
        "MDD:\n\n---\n" +
        mdd +
        "\n---"
        : "No hay MDD. Genera un documento de flujos genérico (diagramas Mermaid, reglas de validación).";
    if (gapsFeedback?.trim()) {
      prompt +=
        "\n\n**Los siguientes puntos deben corregirse o incorporarse:**\n---\n" + gapsFeedback.trim() + "\n---";
    }
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], {
      systemPrompt: LOGIC_FLOWS_PROMPT + NO_MILITAR_INSTRUCTION,
    });
  }

  async generateInfra(mddContent: string, blueprintContent?: string | null, gapsFeedback?: string | null, options?: LegacyGenerateOptions): Promise<string> {
    const mdd = mddContent?.trim() ?? "";
    const blueprint = (blueprintContent?.trim() ?? "").slice(0, 6000);
    const constitutionNote =
      "El siguiente documento es la **Constitución del proyecto** (MDD). Tu salida debe adherirse a él en todo momento.\n\n";
    let prompt =
      mdd.length > 0
        ? "Genera el documento de Infraestructura y Despliegue según las instrucciones del system prompt.\n\n" +
        constitutionNote +
        "MDD:\n---\n" +
        mdd +
        "\n---\n\n" +
        (blueprint ? "Blueprint (estructura de carpetas / servicios):\n---\n" + blueprint + "\n---" : "")
        : "No hay MDD. Genera un documento de infra genérico (Dockerfile, docker-compose, .env.example).";
    if (gapsFeedback?.trim()) {
      prompt +=
        "\n\n**Los siguientes puntos deben corregirse o incorporarse:**\n---\n" + gapsFeedback.trim() + "\n---";
    }
    if (options?.theforgeContext?.trim()) prompt = prependTheForgePrompt(prompt, options.theforgeContext);
    return this.generateResponse(prompt, [], {
      systemPrompt: INFRA_PROMPT + NO_MILITAR_INSTRUCTION,
    });
  }

  /**
   * Reflexión (SDD Fase 3): verifica si un entregable cumple el MDD. Devuelve texto breve (Cumple / No cumple + gaps).
   */
  async verifyDeliverable(
    mddContent: string,
    documentContent: string,
    deliverableKind: "blueprint" | "api" | "infra",
  ): Promise<string> {
    const kindLabel = { blueprint: "Blueprint", api: "Contratos de API", infra: "Infraestructura" }[deliverableKind];
    const prompt = `Verifica si el siguiente documento **${kindLabel}** cumple el MDD (Constitución) que se proporciona.\n\nMDD:\n---\n${(mddContent || "").trim().slice(0, 8000)}\n---\n\nDocumento ${kindLabel}:\n---\n${(documentContent || "").trim().slice(0, 6000)}\n---`;
    return this.generateResponse(prompt, [], { systemPrompt: VERIFY_DELIVERABLE_PROMPT });
  }

  /**
   * Conformance por LLM: devuelve { ok, gaps } para complementar heurísticas y reducir falsos positivos/negativos.
   */
  /**
   * Enmienda constitucional (SDD): alinea §3 y/o §4 con un delta detectado en entregables (Blueprint/API).
   */
  async proposeMddAmendment(params: {
    currentMdd: string;
    targetSections: number[];
    rationale: string;
    artifactExcerpt: string;
  }): Promise<string> {
    const sec = params.targetSections.filter((n) => n === 3 || n === 4);
    if (sec.length === 0) {
      throw new Error("targetSections debe incluir 3 y/o 4");
    }
    const label = sec.join(" y ");
    const prompt =
      `Actualiza el Master Design Document (markdown) incorporando el impacto descrito. ` +
      `Modifica solo las secciones ## 3. … y/o ## 4. … según corresponda; el documento completo debe seguir siendo coherente (7 secciones canónicas).\n\n` +
      `**Razonamiento / impacto:**\n${params.rationale.slice(0, 4000)}\n\n` +
      `**Extracto del entregable que provoca el cambio:**\n---\n${params.artifactExcerpt.slice(0, 8000)}\n---\n\n` +
      `**MDD actual (completo):**\n---\n${params.currentMdd.slice(0, 24000)}\n---\n\n` +
      `Devuelve el MDD completo en markdown, con las secciones §${label} alineadas al extracto.`;
    const system =
      "Eres el guardián de la Constitución SDD. No contradigas el stack ni el dominio ya fijados en otras secciones. " +
      "Conserva encabezados canónicos (## 1. … … ## 7.). Salida: solo el markdown del MDD.";
    return this.generateResponse(prompt, [], { systemPrompt: system });
  }

  async conformanceCheck(
    mddContent: string,
    documentContent: string,
    kind: "blueprint" | "api" | "logicFlows" | "infra",
  ): Promise<{ ok: boolean; gaps: string[] }> {
    const kindLabel = { blueprint: "Blueprint", api: "Contratos de API", logicFlows: "Flujos de lógica", infra: "Infraestructura" }[kind];
    const prompt = `¿El siguiente documento **${kindLabel}** cumple el MDD?\n\nMDD:\n---\n${(mddContent || "").trim().slice(0, 6000)}\n---\n\nDocumento ${kindLabel}:\n---\n${(documentContent || "").trim().slice(0, 4000)}\n---`;
    try {
      const raw = await this.generateResponse(prompt, [], { systemPrompt: CONFORMANCE_CHECK_PROMPT });
      const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(trimmed) as { ok?: boolean; gaps?: string[] };
      const ok = parsed?.ok === true;
      const gaps = Array.isArray(parsed?.gaps) ? parsed.gaps.filter((g) => typeof g === "string") : [];
      return { ok, gaps };
    } catch {
      return { ok: true, gaps: [] };
    }
  }
}
