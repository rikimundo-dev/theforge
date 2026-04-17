import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { resolvePrimaryChatRuntime } from "../../ai/config/llm-config.js";

/**
 * Factory for DBGA graph: mismo runtime que el adapter principal (AI_PROVIDER).
 * openai/kimi → ChatOpenAI (AI_API_KEY + opcional OPENAI_BASE_URL); google → ChatGoogleGenerativeAI.
 */
export function createDbgaLLM(): BaseChatModel {
  const r = resolvePrimaryChatRuntime();
  if (r.providerId === "google") {
    return new ChatGoogleGenerativeAI({
      modelName: r.chatModel,
      temperature: 0.5,
      apiKey: r.apiKey || undefined,
    });
  }
  return new ChatOpenAI({
    model: r.chatModel,
    temperature: 0.5,
    openAIApiKey: r.apiKey,
    configuration: r.baseURL ? { baseURL: r.baseURL } : undefined,
  });
}
