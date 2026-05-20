import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CRITIC_ITERATIONS,
  routeDbgaAfterCritic,
} from "./dbga-critic-routing.js";

describe("routeDbgaAfterCritic", () => {
  it("fuerza synthesis cuando criticIterations >= MAX_CRITIC_ITERATIONS", () => {
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: MAX_CRITIC_ITERATIONS,
        competitors: [],
        criticDecision: "scout",
      }),
      "synthesis",
    );
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: MAX_CRITIC_ITERATIONS + 1,
        competitors: [{ name: "A", url: "https://a.com" }],
        criticDecision: "scout",
      }),
      "synthesis",
    );
  });

  it("honra criticDecision scout cuando iteraciones están por debajo del máximo", () => {
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: 0,
        competitors: [{ name: "A", url: "https://a.com" }],
        criticDecision: "scout",
      }),
      "scout",
    );
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: 1,
        competitors: [{ name: "A", url: "https://a.com" }],
        criticDecision: "scout",
      }),
      "scout",
    );
  });

  it("va a synthesis cuando criticDecision no es scout", () => {
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: 0,
        competitors: [],
        criticDecision: "synthesis",
      }),
      "synthesis",
    );
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: 1,
        competitors: [],
        criticDecision: undefined,
      }),
      "synthesis",
    );
  });

  it("sin competidores y 2 iteraciones fuerza synthesis aunque el critic pida scout", () => {
    assert.equal(
      routeDbgaAfterCritic({
        criticIterations: 2,
        competitors: [],
        criticDecision: "scout",
      }),
      "synthesis",
    );
  });

  it("respeta maxIterations personalizado", () => {
    const competitor = { name: "A", url: "https://a.com" };
    assert.equal(
      routeDbgaAfterCritic(
        {
          criticIterations: 3,
          competitors: [competitor],
          criticDecision: "scout",
        },
        4,
      ),
      "scout",
    );
    assert.equal(
      routeDbgaAfterCritic(
        {
          criticIterations: 4,
          competitors: [competitor],
          criticDecision: "scout",
        },
        4,
      ),
      "synthesis",
    );
  });
});
