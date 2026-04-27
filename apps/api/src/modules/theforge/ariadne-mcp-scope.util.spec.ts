import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mergeAriadneCodebaseScope, resolveAriadneCodebaseMcpTarget } from "./ariadne-mcp-scope.util.js";

describe("resolveAriadneCodebaseMcpTarget", () => {
  test("sin catálogo: pasa el id guardado en workspace y graph", () => {
    const r = resolveAriadneCodebaseMcpTarget("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", null);
    assert.equal(r.workspaceProjectId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(r.graphProjectId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(r.scopeForScopedTools, undefined);
  });

  test("id workspace con un root: workspace=proyecto, graph=repo, scope único", () => {
    const r = resolveAriadneCodebaseMcpTarget("proj-1", [
      {
        id: "proj-1",
        roots: [{ id: "repo-a" }],
      },
    ]);
    assert.equal(r.workspaceProjectId, "proj-1");
    assert.equal(r.graphProjectId, "repo-a");
    assert.deepEqual(r.scopeForScopedTools?.repoIds, ["repo-a"]);
  });

  test("id workspace multi-root: workspace=proyecto, graph=primer repo, scope=todos", () => {
    const r = resolveAriadneCodebaseMcpTarget("proj-1", [
      {
        id: "proj-1",
        roots: [{ id: "repo-a" }, { id: "repo-b" }],
      },
    ]);
    assert.equal(r.workspaceProjectId, "proj-1");
    assert.equal(r.graphProjectId, "repo-a");
    assert.deepEqual(r.scopeForScopedTools?.repoIds, ["repo-a", "repo-b"]);
  });

  test("id que es roots[].id: workspace=padre, graph=ese repo, scope=solo ese root", () => {
    const r = resolveAriadneCodebaseMcpTarget("repo-b", [
      {
        id: "proj-1",
        roots: [{ id: "repo-a" }, { id: "repo-b" }],
      },
    ]);
    assert.equal(r.workspaceProjectId, "proj-1");
    assert.equal(r.graphProjectId, "repo-b");
    assert.deepEqual(r.scopeForScopedTools?.repoIds, ["repo-b"]);
  });
});

describe("mergeAriadneCodebaseScope", () => {
  test("overlay repoIds sustituye al resuelto", () => {
    const m = mergeAriadneCodebaseScope({ repoIds: ["a", "b"] }, { repoIds: ["z"] });
    assert.deepEqual(m?.repoIds, ["z"]);
  });

  test("sin overlay repoIds conserva resuelto", () => {
    const m = mergeAriadneCodebaseScope({ repoIds: ["a"] }, { includePathPrefixes: ["/x"] });
    assert.deepEqual(m?.repoIds, ["a"]);
    assert.deepEqual(m?.includePathPrefixes, ["/x"]);
  });
});
