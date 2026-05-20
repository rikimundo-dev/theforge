import test from "node:test";
import assert from "node:assert/strict";
import { isModelExhaustionError, runWithModelFallback } from "./llm-model-fallback.js";

test("isModelExhaustionError — 402 y quota", () => {
  assert.equal(isModelExhaustionError({ status: 402 }), true);
  assert.equal(isModelExhaustionError(new Error("insufficient_quota")), true);
  assert.equal(isModelExhaustionError(new Error("You exceeded your current quota")), true);
});

test("isModelExhaustionError — modelo no encontrado", () => {
  assert.equal(isModelExhaustionError(new Error("model_not_found: foo")), true);
  assert.equal(isModelExhaustionError(new Error("The model does not exist")), true);
});

test("isModelExhaustionError — 429 solo si allow429", () => {
  assert.equal(isModelExhaustionError({ status: 429 }, { allow429: true }), true);
  assert.equal(isModelExhaustionError({ status: 429 }, { allow429: false }), false);
  assert.equal(isModelExhaustionError(new Error("rate limit exceeded"), { allow429: true }), true);
});

test("isModelExhaustionError — no fallback en 5xx ni red", () => {
  assert.equal(isModelExhaustionError({ status: 500 }), false);
  assert.equal(isModelExhaustionError({ status: 503 }), false);
  assert.equal(isModelExhaustionError(new Error("ECONNRESET")), false);
});

test("runWithModelFallback — un solo modelo sin reintentar errores no transitorios", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runWithModelFallback({
        models: ["primary-only"],
        retriesPerModel: 0,
        label: "test-single",
        run: async () => {
          calls++;
          throw Object.assign(new Error("model_not_found"), { status: 404 });
        },
      }),
    /model_not_found/,
  );
  assert.equal(calls, 1);
});

test("runWithModelFallback — cadena pasa al siguiente en agotamiento", async () => {
  const used: string[] = [];
  const result = await runWithModelFallback({
    models: ["bad", "good"],
    retriesPerModel: 0,
    label: "test-chain",
    run: async (model) => {
      used.push(model);
      if (model === "bad") {
        throw Object.assign(new Error("insufficient_quota"), { status: 402 });
      }
      return "ok";
    },
  });
  assert.equal(result, "ok");
  assert.deepEqual(used, ["bad", "good"]);
});

test("runWithModelFallback — 500 no avanza de modelo", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runWithModelFallback({
        models: ["a", "b"],
        retriesPerModel: 0,
        label: "test-5xx",
        run: async () => {
          calls++;
          throw Object.assign(new Error("internal"), { status: 500 });
        },
      }),
    /internal/,
  );
  assert.equal(calls, 1);
});
