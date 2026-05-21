import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { llmMaxTokens, resolveLangChainChatTemperature } from "../../ai/config/llm-config.js";
import type { AIFactory } from "../../ai/ai.factory.js";
import type { UserLLMRuntime } from "../../ai/providers/llm-runtime.types.js";
import type { ProviderId } from "../../ai/providers/provider-catalog.js";
import { ChainedFallbackChatModel } from "./chained-fallback-chat-model.js";
import { OpenRouterFallbackChatModel } from "./openrouter-fallback-chat-model.js";

/** @internal */ const LLM_TIMEOUT_MS = parseInt(
  process.env.LANGGRAPH_LLM_TIMEOUT_MS?.trim() || "300000",
  10,
);

function chatModelChain(runtime: UserLLMRuntime): string[] {
  const chain = [runtime.chatModel, ...(runtime.chatModelFallbacks ?? [])];
  const seen = new Set<string>();
  return chain.filter((m) => {
    if (!m || seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

function buildChatOpenAI(runtime: UserLLMRuntime, model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    temperature: resolveLangChainChatTemperature(),
    maxTokens: llmMaxTokens(),
    timeout: LLM_TIMEOUT_MS,
    openAIApiKey: runtime.apiKey,
    configuration: { baseURL: runtime.baseURL },
  });
}

function buildLangChainChat(runtime: UserLLMRuntime, model: string): BaseChatModel {
  const temperature = resolveLangChainChatTemperature();
  switch (runtime.providerId as ProviderId) {
    case "anthropic":
      return new ChatAnthropic({
        model,
        apiKey: runtime.apiKey,
        temperature,
        maxTokens: llmMaxTokens(),
        clientOptions: { timeout: LLM_TIMEOUT_MS },
      });
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model,
        apiKey: runtime.apiKey,
        temperature,
      });
    case "openrouter":
    case "openai":
    case "cloudflare":
    case "groq":
    default:
      return buildChatOpenAI(runtime, model);
  }
}

function buildWithFallbacks(
  runtime: UserLLMRuntime,
  models: string[],
  build: (model: string) => BaseChatModel,
): BaseChatModel {
  if (models.length <= 1) {
    return build(models[0]!);
  }
  if (
    runtime.providerId === "openrouter" ||
    runtime.providerId === "openai" ||
    runtime.providerId === "cloudflare" ||
    runtime.providerId === "groq"
  ) {
    return new OpenRouterFallbackChatModel(
      (model) => buildChatOpenAI(runtime, model),
      models,
    );
  }
  return new ChainedFallbackChatModel(build, models);
}

export function createDbgaLLMFromRuntime(runtime: UserLLMRuntime): BaseChatModel {
  const models = chatModelChain(runtime);
  return buildWithFallbacks(runtime, models, (model) => buildLangChainChat(runtime, model));
}

/**
 * Factory for DBGA / MDD graphs: runtime BYOK del usuario (todos los proveedores del catálogo).
 */
export async function createDbgaLLM(aiFactory: AIFactory, userId: string): Promise<BaseChatModel> {
  const runtime = await aiFactory.resolveRuntime(userId);
  return createDbgaLLMFromRuntime(runtime);
}

/** LLM del nodo Auditor MDD: instancia dedicada en Ajustes o el proveedor activo. */
export async function createMddAuditorLLM(
  aiFactory: AIFactory,
  userId: string,
): Promise<BaseChatModel> {
  const runtime = await aiFactory.resolveAuditorRuntime(userId);
  return createDbgaLLMFromRuntime(runtime);
}
