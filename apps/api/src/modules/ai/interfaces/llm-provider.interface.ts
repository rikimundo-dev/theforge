import type { ChecklistResult } from "@the-forge/shared-types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

export interface GenerateResponseOptions {
  systemPrompt?: string;
  currentMddContent?: string;
  currentDbgaContent?: string;
  currentUxUiGuideContent?: string;
  /** Blueprint del proyecto; se inyecta en contexto cuando activeTab es ux-ui-guide para alinear la guía con pantallas/estructura */
  currentBlueprintContent?: string;
  /** Tab activo en el Workshop: benchmark | mdd | ux-ui-guide | blueprint | api-contracts | logic-flows | infra */
  activeTab?: string;
  /** Memoria semántica: preferencias arquitectónicas de proyectos previos (HISTORIAL_DE_APRENDIZAJE) */
  learningHistory?: string;
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
