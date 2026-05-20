import test from "node:test";
import assert from "node:assert/strict";
import {
  getLlmProvidersSnapshot,
  hasChatModelFallback,
  isChatFallbackOn429Enabled,
  normalizeLlmProviderId,
  resolveChatModelChain,
  resolveEmbeddingsBackend,
  resolveOpenRouterEmbeddingApiKey,
  resolveLangChainChatTemperature,
  resolveVisionModelChain,
} from "./llm-config.js";

test("resolveLangChainChatTemperature — openrouter 0.5", () => {
  assert.equal(resolveLangChainChatTemperature({ providerId: "openrouter" }), 0.5);
});

test("normalizeLlmProviderId — siempre openrouter", () => {
  assert.equal(normalizeLlmProviderId("openai"), "openrouter");
  assert.equal(normalizeLlmProviderId("gemini"), "openrouter");
});

test("getLlmProvidersSnapshot — sin clave", () => {
  const prev = process.env.OPENROUTER_API_KEY;
  const prevAi = process.env.AI_API_KEY;
  const prevOpen = process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const snap = getLlmProvidersSnapshot();
    assert.equal(snap.length, 1);
    assert.equal(snap[0]?.id, "openrouter");
    assert.equal(snap[0]?.chatConfigured, false);
    assert.equal(snap[0]?.active, true);
  } finally {
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevAi !== undefined) process.env.AI_API_KEY = prevAi;
    else delete process.env.AI_API_KEY;
    if (prevOpen !== undefined) process.env.OPENAI_API_KEY = prevOpen;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("resolveEmbeddingsBackend — none", () => {
  const prev = process.env.LLM_EMBEDDINGS_PROVIDER;
  process.env.LLM_EMBEDDINGS_PROVIDER = "none";
  try {
    assert.equal(resolveEmbeddingsBackend(), "none");
  } finally {
    if (prev === undefined) delete process.env.LLM_EMBEDDINGS_PROVIDER;
    else process.env.LLM_EMBEDDINGS_PROVIDER = prev;
  }
});

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const v = vars[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

test("resolveChatModelChain — sin fallbacks solo primary", () => {
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "primary/model",
      OPENROUTER_CHAT_MODEL_FALLBACK: undefined,
      OPENROUTER_CHAT_MODEL_FALLBACKS: undefined,
    },
    () => {
      assert.deepEqual(resolveChatModelChain(), ["primary/model"]);
      assert.equal(hasChatModelFallback(), false);
    },
  );
});

test("resolveChatModelChain — FALLBACKS tiene prioridad y dedupe", () => {
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "primary/model",
      OPENROUTER_CHAT_MODEL_FALLBACK: "ignored/single",
      OPENROUTER_CHAT_MODEL_FALLBACKS: "fb/a, fb/b, primary/model",
    },
    () => {
      assert.deepEqual(resolveChatModelChain(), ["primary/model", "fb/a", "fb/b"]);
      assert.equal(hasChatModelFallback(), true);
    },
  );
});

test("resolveChatModelChain — FALLBACK único", () => {
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "primary/model",
      OPENROUTER_CHAT_MODEL_FALLBACK: "fb/one",
      OPENROUTER_CHAT_MODEL_FALLBACKS: undefined,
    },
    () => {
      assert.deepEqual(resolveChatModelChain(), ["primary/model", "fb/one"]);
    },
  );
});

test("isChatFallbackOn429Enabled — solo con fallbacks y no desactivado", () => {
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "p",
      OPENROUTER_CHAT_MODEL_FALLBACKS: undefined,
      OPENROUTER_CHAT_MODEL_FALLBACK: undefined,
      OPENROUTER_CHAT_FALLBACK_ON_429: undefined,
    },
    () => {
      assert.equal(isChatFallbackOn429Enabled(), false);
    },
  );
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "p",
      OPENROUTER_CHAT_MODEL_FALLBACK: "fb",
      OPENROUTER_CHAT_FALLBACK_ON_429: undefined,
    },
    () => {
      assert.equal(isChatFallbackOn429Enabled(), true);
    },
  );
  withEnv(
    {
      OPENROUTER_CHAT_MODEL: "p",
      OPENROUTER_CHAT_MODEL_FALLBACK: "fb",
      OPENROUTER_CHAT_FALLBACK_ON_429: "0",
    },
    () => {
      assert.equal(isChatFallbackOn429Enabled(), false);
    },
  );
});

test("resolveVisionModelChain — VISION_MODEL_FALLBACK", () => {
  withEnv(
    {
      VISION_MODEL: "vision/primary",
      VISION_MODEL_FALLBACK: "vision/fb",
      OPENROUTER_CHAT_MODEL_FALLBACK: undefined,
    },
    () => {
      assert.deepEqual(resolveVisionModelChain(), ["vision/primary", "vision/fb"]);
    },
  );
});

test("resolveOpenRouterEmbeddingApiKey — con AI_API_KEY", () => {
  const prev = process.env.OPENROUTER_API_KEY;
  const prevEmb = process.env.OPENROUTER_EMBEDDING_API_KEY;
  const prevLlm = process.env.LLM_EMBEDDINGS_PROVIDER;
  const prevAi = process.env.AI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_EMBEDDING_API_KEY;
  delete process.env.LLM_EMBEDDINGS_PROVIDER;
  process.env.AI_API_KEY = "sk-test";
  try {
    assert.equal(resolveEmbeddingsBackend(), "openrouter");
    assert.equal(resolveOpenRouterEmbeddingApiKey(), "sk-test");
  } finally {
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevEmb !== undefined) process.env.OPENROUTER_EMBEDDING_API_KEY = prevEmb;
    else delete process.env.OPENROUTER_EMBEDDING_API_KEY;
    if (prevLlm !== undefined) process.env.LLM_EMBEDDINGS_PROVIDER = prevLlm;
    else delete process.env.LLM_EMBEDDINGS_PROVIDER;
    if (prevAi !== undefined) process.env.AI_API_KEY = prevAi;
    else delete process.env.AI_API_KEY;
  }
});
