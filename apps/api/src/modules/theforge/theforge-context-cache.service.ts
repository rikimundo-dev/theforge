import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";

function envCacheEnabled(): boolean {
  const v = process.env.THEFORGE_CONTEXT_CACHE?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return !["0", "false", "off", "no"].includes(v);
}

/**
 * Caché en memoria del contexto MCP/TheForge por proyecto y huella del índice
 * (equiv. a “revisión” del código sin depender del git hash del repo remoto).
 * Opcional: `THEFORGE_CONTEXT_REVISION` para invalidar manualmente tras deploy del índice.
 */
@Injectable()
export class TheForgeContextCacheService {
  private readonly logger = new Logger(TheForgeContextCacheService.name);
  private readonly store = new Map<string, { value: string; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor() {
    this.ttlMs = Math.max(
      60_000,
      parseInt(process.env.THEFORGE_CONTEXT_CACHE_TTL_MS ?? `${30 * 60 * 1000}`, 10) || 30 * 60 * 1000,
    );
    this.maxEntries = Math.max(8, parseInt(process.env.THEFORGE_CONTEXT_CACHE_MAX_ENTRIES ?? "80", 10) || 80);
  }

  isEnabled(): boolean {
    return envCacheEnabled();
  }

  cacheKey(projectId: string, fingerprint: string): string {
    const revision = process.env.THEFORGE_CONTEXT_REVISION?.trim() ?? "";
    return `${projectId}\n${revision}\n${fingerprint}`;
  }

  fingerprintFromSemanticSlice(projectId: string, semanticText: string): string {
    const revision = process.env.THEFORGE_CONTEXT_REVISION?.trim() ?? "";
    return createHash("sha256")
      .update(projectId)
      .update("\0")
      .update(revision)
      .update("\0")
      .update(semanticText.slice(0, 24_000))
      .digest("hex");
  }

  get(key: string): string | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: string): void {
    while (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first === undefined) break;
      this.store.delete(first);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.logger.debug(`[TheForgeContextCache] set key=${key.slice(0, 48)}… ttlMs=${this.ttlMs}`);
  }
}
