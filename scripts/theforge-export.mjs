#!/usr/bin/env node
/**
 * Lightweight CLI: download repo-handoff bundle from The Forge API and write to disk.
 *
 * Usage:
 *   THEFORGE_API_URL=http://localhost:3000 \
 *   THEFORGE_MCP_SECRET=<m2m-secret> \
 *   node scripts/theforge-export.mjs --project <uuid> --out ./handoff
 *
 * Writes spec-kit layout and reconciled governance at --out root (flat handoff).
 * API returns unified handoff (spec-kit + gobernanza reconciliada + docs/sdd mirrors).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const API_BASE = (process.env.THEFORGE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.THEFORGE_MCP_SECRET ?? process.env.MCP_M2M_SECRET ?? "";

function parseArgs(argv) {
  const args = { project: "", out: "./theforge-export" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--project" && argv[i + 1]) args.project = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`Usage: theforge-export --project <id> [--out <dir>]`);
      process.exit(0);
    }
  }
  return args;
}

async function login() {
  if (!SECRET) {
    throw new Error("Set THEFORGE_MCP_SECRET or MCP_M2M_SECRET for API auth");
  }
  const res = await fetch(`${API_BASE}/auth/mcp-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: SECRET }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Login failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function writeFileEnsured(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function main() {
  const { project, out } = parseArgs(process.argv);
  if (!project) {
    console.error("Missing --project <uuid>");
    process.exit(1);
  }

  const token = await login();
  const res = await fetch(`${API_BASE}/projects/${project}/export/repo-handoff`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const root = out;

  for (const file of data.specKitFiles ?? []) {
    await writeFileEnsured(join(root, file.path), file.content);
  }

  if (data.agentGovernance?.present) {
    for (const file of data.agentGovernance.files ?? []) {
      const rel = file.path.replace(/^agent-governance\//i, "").replace(/^\/+/, "");
      await writeFileEnsured(join(root, rel), file.content);
    }
    if (data.agentGovernance.manifest) {
      await writeFileEnsured(
        join(root, "MANIFEST.json"),
        JSON.stringify(data.agentGovernance.manifest, null, 2),
      );
    }
  }

  console.log(`Exported ${data.specKitFiles?.length ?? 0} spec-kit files to ${root}`);
  if (data.agentGovernance?.present) {
    console.log(`Agent governance: ${data.agentGovernance.files?.length ?? 0} files`);
  }
  console.log(`Feature dir: ${data.featureDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
