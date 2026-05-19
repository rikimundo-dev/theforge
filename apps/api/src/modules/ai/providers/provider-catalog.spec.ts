import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCloudflareBaseUrl,
  resolveCloudflareAccountId,
  resolveEmbeddingDimensionForModel,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
} from "./provider-catalog.js";

test("resolveEmbeddingDimensionForModel — openai default", () => {
  assert.equal(
    resolveEmbeddingDimensionForModel("openai", "text-embedding-3-small"),
    1536,
  );
});

test("resolveEmbeddingDimensionForModel — user override", () => {
  assert.equal(resolveEmbeddingDimensionForModel("openai", "text-embedding-3-small", 512), 512);
});

test("PROVIDER_CATALOG — anthropic sin embeddings ni STT", () => {
  assert.equal(PROVIDER_CATALOG.anthropic.supportsEmbeddings, false);
  assert.equal(PROVIDER_CATALOG.anthropic.supportsStt, false);
});

test("PROVIDER_CATALOG — cloudflare BYOK", () => {
  assert.ok(PROVIDER_IDS.includes("cloudflare"));
  const cf = PROVIDER_CATALOG.cloudflare;
  assert.equal(cf.supportsEmbeddings, true);
  assert.equal(cf.supportsStt, false);
  assert.equal(cf.defaultEmbeddingDimension, 768);
  assert.ok(cf.chatModels?.includes("@cf/meta/llama-3.1-8b-instruct"));
  assert.ok(cf.extraFields?.some((f) => f.key === "accountId" && f.required));
});

test("buildCloudflareBaseUrl — sustituye accountId", () => {
  assert.equal(
    buildCloudflareBaseUrl("abc123"),
    "https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1",
  );
});

test("resolveCloudflareAccountId — desde extras o baseUrl", () => {
  assert.equal(resolveCloudflareAccountId({ accountId: "acc-1" }), "acc-1");
  assert.equal(
    resolveCloudflareAccountId(
      null,
      "https://api.cloudflare.com/client/v4/accounts/xyz/ai/v1",
    ),
    "xyz",
  );
});

test("resolveEmbeddingDimensionForModel — cloudflare bge-base", () => {
  assert.equal(
    resolveEmbeddingDimensionForModel("cloudflare", "@cf/baai/bge-base-en-v1.5"),
    768,
  );
});

test("PROVIDER_CATALOG — groq BYOK", () => {
  assert.ok(PROVIDER_IDS.includes("groq"));
  const groq = PROVIDER_CATALOG.groq;
  assert.equal(groq.defaultBaseUrl, "https://api.groq.com/openai/v1");
  assert.equal(groq.supportsEmbeddings, false);
  assert.equal(groq.supportsStt, true);
  assert.equal(groq.defaultSttModel, "whisper-large-v3");
  assert.equal(groq.defaultChatModel, "llama-3.3-70b-versatile");
  assert.ok(groq.chatModels?.includes("llama-3.1-8b-instant"));
  assert.equal(groq.defaultEmbeddingModel, null);
});
