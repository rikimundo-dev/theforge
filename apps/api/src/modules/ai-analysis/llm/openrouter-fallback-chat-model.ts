import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { ChatOpenAI, type ChatOpenAICallOptions } from "@langchain/openai";
import { resolveChatModelChain } from "../../ai/config/llm-config.js";
import { isModelExhaustionError, runWithModelFallback } from "../../ai/config/llm-model-fallback.js";

/**
 * ChatOpenAI con cadena de modelos: solo hace fallback en errores de agotamiento (quota, 429 opcional, etc.).
 */
export class OpenRouterFallbackChatModel extends BaseChatModel {
  constructor(private readonly buildLlm: (model: string) => ChatOpenAI) {
    super({});
  }

  _llmType(): string {
    return "openrouter-chat-fallback";
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const models = resolveChatModelChain();
    const openAiOptions = options as ChatOpenAICallOptions;
    return runWithModelFallback({
      models,
      label: "OpenRouterFallbackChatModel._generate",
      run: async (model) => {
        const llm = this.buildLlm(model);
        return llm._generate(messages, openAiOptions, runManager);
      },
    });
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const models = resolveChatModelChain();
    const openAiOptions = options as ChatOpenAICallOptions;
    let lastErr: unknown;
    for (let i = 0; i < models.length; i++) {
      const model = models[i]!;
      let firstChunk: ChatGenerationChunk | undefined;
      let rest: AsyncIterator<ChatGenerationChunk> | undefined;
      try {
        await runWithModelFallback({
          models: [model],
          label: `OpenRouterFallbackChatModel._stream[${model}]`,
          run: async () => {
            const llm = this.buildLlm(model);
            const iter = llm._streamResponseChunks(messages, openAiOptions, runManager);
            const first = await iter.next();
            if (first.done) throw new Error(`empty stream from ${model}`);
            firstChunk = first.value;
            rest = iter;
          },
        });
        yield firstChunk!;
        while (rest) {
          const next = await rest.next();
          if (next.done) break;
          yield next.value;
        }
        return;
      } catch (err) {
        lastErr = err;
        const hasNext = i < models.length - 1;
        if (!hasNext || !isModelExhaustionError(err)) throw err;
        console.warn(
          `[OpenRouterFallbackChatModel] modelo ${model} agotado, probando ${models[i + 1]}`,
        );
      }
    }
    throw lastErr;
  }

  bindTools(
    tools: Parameters<ChatOpenAI["bindTools"]>[0],
    kwargs?: Parameters<ChatOpenAI["bindTools"]>[1],
  ): BaseChatModel {
    return new OpenRouterFallbackChatModel(
      (model) => this.buildLlm(model).bindTools(tools, kwargs) as unknown as ChatOpenAI,
    );
  }
}
