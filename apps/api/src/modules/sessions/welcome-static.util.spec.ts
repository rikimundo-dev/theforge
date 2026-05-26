import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveStaticWelcomeMessage } from "./welcome-static.util.js";

describe("resolveStaticWelcomeMessage", () => {
  it("returns null when tab already has chat history", () => {
    const msg = resolveStaticWelcomeMessage(
      { activeTab: "brd", projectName: "P" },
      [{ role: "user", content: "hola", tab: "brd" }],
    );
    assert.equal(msg, null);
  });

  it("returns BRD cold-start without LLM", () => {
    const msg = resolveStaticWelcomeMessage({ activeTab: "brd", projectName: "Forge" }, []);
    assert.ok(msg?.includes("BRD"));
    assert.ok(msg?.includes("Forge"));
  });

  it("returns null for benchmark without dbga", () => {
    const msg = resolveStaticWelcomeMessage({ activeTab: "benchmark" }, []);
    assert.equal(msg, null);
  });
});
