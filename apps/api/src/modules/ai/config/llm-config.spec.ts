import test from "node:test";
import assert from "node:assert/strict";
import {
  getLlmProvidersSnapshot,
  normalizeLlmProviderId,
  resolveEmbeddingsBackend,
} from "./llm-config.js";

test("normalizeLlmProviderId — alias gemini/moonshot", () => {
  assert.equal(normalizeLlmProviderId("gemini"), "google");
  assert.equal(normalizeLlmProviderId("moonshot"), "kimi");
  assert.equal(normalizeLlmProviderId("openai"), "openai");
});

test("getLlmProvidersSnapshot — sin claves", () => {
  const prevAi = process.env.AI_API_KEY;
  const prevOpen = process.env.OPENAI_API_KEY;
  const prevGo = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  try {
    const snap = getLlmProvidersSnapshot();
    assert.equal(snap.find((s) => s.id === "openai")?.chatConfigured, false);
    assert.equal(snap.find((s) => s.id === "kimi")?.chatConfigured, false);
  } finally {
    if (prevAi !== undefined) process.env.AI_API_KEY = prevAi;
    else delete process.env.AI_API_KEY;
    if (prevOpen !== undefined) process.env.OPENAI_API_KEY = prevOpen;
    else delete process.env.OPENAI_API_KEY;
    if (prevGo !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevGo;
  }
});

test("resolveEmbeddingsBackend — override google", () => {
  const prev = process.env.LLM_EMBEDDINGS_PROVIDER;
  process.env.LLM_EMBEDDINGS_PROVIDER = "google";
  try {
    assert.equal(resolveEmbeddingsBackend(), "gemini");
  } finally {
    if (prev === undefined) delete process.env.LLM_EMBEDDINGS_PROVIDER;
    else process.env.LLM_EMBEDDINGS_PROVIDER = prev;
  }
});
