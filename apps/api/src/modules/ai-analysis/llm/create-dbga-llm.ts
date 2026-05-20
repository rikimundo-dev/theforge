import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import {
  hasChatModelFallback,
  resolveLangChainChatTemperature,
  resolvePrimaryChatRuntime,
} from "../../ai/config/llm-config.js";
import { OpenRouterFallbackChatModel } from "./openrouter-fallback-chat-model.js";

/**
 * Factory for DBGA graph: mismo runtime que el adapter principal (OpenRouter).
 */
/** @internal */ const LLM_TIMEOUT_MS = parseInt(
  process.env.LANGGRAPH_LLM_TIMEOUT_MS?.trim() || "300000",
  10,
);
const LOG_TIMEOUT = () => console.log(`[createDbgaLLM] timeout=${LLM_TIMEOUT_MS}ms`);

function buildChatOpenAI(model: string): ChatOpenAI {
  const r = resolvePrimaryChatRuntime();
  return new ChatOpenAI({
    model,
    temperature: resolveLangChainChatTemperature(r),
    timeout: LLM_TIMEOUT_MS,
    openAIApiKey: r.apiKey,
    configuration: { baseURL: r.baseURL },
  });
}

export function createDbgaLLM(): BaseChatModel {
  LOG_TIMEOUT();
  if (!hasChatModelFallback()) {
    return buildChatOpenAI(resolvePrimaryChatRuntime().chatModel);
  }
  return new OpenRouterFallbackChatModel(buildChatOpenAI);
}
