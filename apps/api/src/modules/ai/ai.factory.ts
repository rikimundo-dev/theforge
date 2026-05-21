import { Injectable } from "@nestjs/common";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.adapter.js";
import { AnthropicAdapter } from "./adapters/anthropic.adapter.js";
import { GeminiAdapter } from "./adapters/gemini.adapter.js";
import type { LLMProvider } from "./interfaces/llm-provider.interface.js";
import type { UserLLMRuntime } from "./providers/llm-runtime.types.js";
import { UserProvidersService } from "../user-providers/user-providers.service.js";

@Injectable()
export class AIFactory {
  constructor(private readonly userProviders: UserProvidersService) {}

  create(runtime: UserLLMRuntime): LLMProvider {
    switch (runtime.providerId) {
      case "openrouter":
      case "openai":
      case "cloudflare":
      case "groq":
        return new OpenAICompatibleAdapter(runtime);
      case "anthropic":
        return new AnthropicAdapter(runtime);
      case "gemini":
        return new GeminiAdapter(runtime);
      default:
        return new OpenAICompatibleAdapter(runtime);
    }
  }

  async resolveRuntime(userId: string): Promise<UserLLMRuntime> {
    return this.userProviders.resolveRuntime(userId);
  }

  async resolveAuditorRuntime(userId: string): Promise<UserLLMRuntime> {
    return this.userProviders.resolveAuditorRuntime(userId);
  }

  async createForUser(userId: string): Promise<LLMProvider> {
    const runtime = await this.resolveRuntime(userId);
    return this.create(runtime);
  }

  async resolveEmbeddingRuntime(userId: string): Promise<UserLLMRuntime> {
    return this.userProviders.resolveEmbeddingRuntime(userId);
  }

  async createEmbeddingForUser(userId: string): Promise<LLMProvider> {
    const runtime = await this.resolveEmbeddingRuntime(userId);
    return this.create(runtime);
  }

  async resolveSttRuntime(userId: string): Promise<UserLLMRuntime & { sttModel: string }> {
    return this.userProviders.resolveSttRuntime(userId);
  }
}

/** @deprecated Use AIFactory.createForUser */
export async function createLLMProviderForUser(
  userId: string,
  factory: AIFactory,
): Promise<LLMProvider> {
  return factory.createForUser(userId);
}
