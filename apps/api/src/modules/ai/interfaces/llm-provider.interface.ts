import type { ChecklistResult, ChatImagePart } from "@theforge/shared-types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Solo mensajes `user`; diagramas / capturas para modelos visión. */
  images?: ChatImagePart[];
}

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

export interface GenerateResponseOptions {
  systemPrompt?: string;
  currentMddContent?: string;
  currentDbgaContent?: string;
  currentUxUiGuideContent?: string;
  /** Blueprint del proyecto; se inyecta en contexto cuando activeTab es ux-ui-guide para alinear la guía con pantallas/estructura */
  currentBlueprintContent?: string;
  /** Spec actual del proyecto; se inyecta cuando activeTab es spec para que el modelo pueda fusionar nuevas secciones */
  currentSpecContent?: string;
  /** BRD de la etapa activa (Workshop); tab `brd` */
  currentBrdContent?: string;
  /** Manual To-Be de la etapa activa; tab `to-be` */
  currentToBeManualContent?: string;
  /** Activar para que el LLM use más tokens de salida en respuestas extensas (default 65535). */
  maxTokensOverride?: number;
  /** Tab activo en el Workshop: benchmark | mdd | ux-ui-guide | blueprint | api-contracts | logic-flows | infra */
  activeTab?: string;
  /** Memoria semántica: preferencias arquitectónicas de proyectos previos (HISTORIAL_DE_APRENDIZAJE) */
  learningHistory?: string;
  /** Fase 0: propuesta de complejidad pendiente (HITL) + instrucciones de entrevista proactiva */
  complexityInterviewContext?: string;
  /**
   * Guía UX/UI: gobierna el bloque «Prompt para Google Stitch».
   * - NEW: el documento debe incluir ese prompt para el **producto del MDD** (no The Forge).
   * - LEGACY: prohibido incluir sección Stitch.
   */
  projectTypeForUxGuide?: "NEW" | "LEGACY";
  /** Fragmentos SDD para alinear guía + Stitch (típico en proyectos NEW). */
  uxGuideAdditionalDocs?: Partial<
    Record<
      "spec" | "useCases" | "userStories" | "logicFlows" | "architecture" | "apiContracts" | "dbga" | "phase0",
      string
    >
  >;
  /** Imágenes del turno actual del usuario (junto con `prompt`). */
  userMessageImages?: ChatImagePart[];
  /**
   * Si true, no inyecta `MASTER_PROMPT` completo: system corto para bienvenidas (`generateWelcome`)
   * (menos tokens hacia el LLM).
   */
  welcomeBrief?: boolean;
}

export interface LLMProvider {
  generateResponse(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<string>;

  /**
   * Streaming: yields text chunks. Caller must buffer to get full response (e.g. for parsing FIN_MDD/FIN_UX_UI/FIN_DBGA).
   */
  generateResponseStream(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>>;

  parseChecklist(text: string): Promise<ChecklistResult>;
  generateEmbedding(text: string): Promise<number[]>;
}
