#!/usr/bin/env node
/**
 * Bloquea hasta que el API Nest responda en GET /health (desarrollo local).
 * Lo invoca @theforge/web antes de `vite` para evitar ECONNREFUSED en el proxy.
 */

const port = process.env.PORT ?? process.env.API_PORT ?? "3000";
const host = process.env.API_WAIT_HOST ?? "127.0.0.1";
const url = `http://${host}:${port}/health`;
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS ?? 120_000);
const intervalMs = Number(process.env.API_WAIT_INTERVAL_MS ?? 500);
const probeTimeoutMs = Number(process.env.API_WAIT_PROBE_MS ?? 3_000);

async function probe() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), probeTimeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`[wait-for-api] Esperando ${url} (máx. ${Math.round(timeoutMs / 1000)}s)...`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) {
      console.log("[wait-for-api] API lista; arrancando Vite.");
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error(
    `[wait-for-api] Timeout: el API no respondió en ${url}.`,
    "Comprueba que @theforge/api esté en marcha (pnpm run dev o dev:api).",
  );
  process.exit(1);
}

main();
