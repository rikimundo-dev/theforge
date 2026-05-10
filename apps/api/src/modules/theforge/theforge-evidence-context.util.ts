import type { CodebaseDocResponseMode } from "@theforge/shared-types";
import type { AskCodebaseOptions } from "./theforge.service.js";

/**
 * API mínima del cliente TheForge/MCP para armar contexto “evidencia primero”.
 */
export interface TheForgeEvidenceApi {
  semanticSearch(query: string, projectId: string, limit?: number): Promise<string>;
  getFunctionsInFile(path: string, projectId?: string, currentFilePath?: string): Promise<string>;
  getFileContent(path: string, projectId: string, ref?: string, currentFilePath?: string): Promise<string>;
  askCodebase(question: string, projectId: string, opts?: AskCodebaseOptions): Promise<string>;
}

export const DEFAULT_SEMANTIC_QUERIES = [
  "data models entities database schema prisma tables",
  "API routes endpoints controllers services nest express",
  "UI components screens pages views react vue",
] as const;

const RE_BACKTICK_PATH =
  /`([^\s`]+\.(?:ts|tsx|js|jsx|mjs|cjs|prisma|json|ya?ml|vue|svelte|md|sql|py|go|java|kt|rs|cs))`/gi;

/** Rutas tipo apps/api/src/foo.ts en texto MCP (sin backticks). */
const RE_SLASH_PATH =
  /(?:^|[\s"'(>[\]])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|prisma|json|ya?ml|vue|svelte|md|sql))(?=[\s)'"<,\]]|$)/gm;

function envFlag(name: string, defaultTrue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultTrue;
  return !["0", "false", "off", "no"].includes(v);
}

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Variable explícita activada (1/true/yes/on). Default false si no está definida. */
function envExplicitlyEnabled(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Límite de resultados por query en `semantic_search` (MCP suele aceptar miles; 12 dejaba el índice casi vacío, sobre todo multi-root).
 * Override: `LEGACY_SEMANTIC_SEARCH_LIMIT`.
 */
export const DEFAULT_LEGACY_SEMANTIC_SEARCH_LIMIT = 80;

export function getLegacySemanticSearchLimit(): number {
  return envInt("LEGACY_SEMANTIC_SEARCH_LIMIT", DEFAULT_LEGACY_SEMANTIC_SEARCH_LIMIT);
}

/**
 * Activa descubrimiento escalonado (ReAct + muchas herramientas MCP) antes del modo clásico en doc. partida / cambio.
 * Default **off**: evita ciclos de 10–25+ min salvo que se opte explícitamente (`LEGACY_EVIDENCE_FIRST_CONTEXT=true`).
 */
export function isLegacyEvidenceFirstEnabled(): boolean {
  return envFlag("LEGACY_EVIDENCE_FIRST_CONTEXT", false);
}

/**
 * Fase 3: paso intermedio "Legacy Analyzer" — MCP + ask_codebase compacto hacia el prompt principal
 * (menos tokens que volcar extractos completos de archivo). Default: activo.
 */
export function isLegacyAnalyzerCompactEnabled(): boolean {
  return envFlag("LEGACY_ANALYZER_COMPACT", true);
}

/** Si true, adjunta anexo recortado de evidencia bruta tras el análisis (debug). Default: false. */
export function isLegacyAnalyzerAttachRawEnabled(): boolean {
  return envFlag("LEGACY_ANALYZER_ATTACH_RAW", false);
}

/**
 * Opciones MCP para `ask_codebase` en flujos legacy / entregables (TheForgeService).
 * Con `LEGACY_ASK_CODEBASE_EVIDENCE_FIRST=1` (default): `raw_evidence` + `deterministicRetriever: true` + `twoPhase: true`.
 * Con `=0`: `responseMode: default` (prosa clásica; sin retrieve determinista forzado).
 */
export function getLegacyAskCodebaseOptions(): AskCodebaseOptions {
  if (!envFlag("LEGACY_ASK_CODEBASE_EVIDENCE_FIRST", true)) {
    return { twoPhase: true, responseMode: "default" };
  }
  return { twoPhase: true, responseMode: "raw_evidence", deterministicRetriever: true };
}

/**
 * Opciones MCP para cada `ask_codebase` al generar doc. partida.
 * Si el cliente no envía `responseMode`, se mantiene el comportamiento por env (`getLegacyAskCodebaseOptions`).
 */
export function askCodebaseOptionsForCodebaseDoc(responseMode?: CodebaseDocResponseMode): AskCodebaseOptions {
  if (responseMode === "default") {
    return { twoPhase: true, responseMode: "default" };
  }
  if (responseMode === "evidence_first") {
    return { twoPhase: true, responseMode: "evidence_first" };
  }
  if (responseMode === "raw_evidence") {
    return { twoPhase: true, responseMode: "raw_evidence", deterministicRetriever: true };
  }
  if (responseMode === "ingest_mdd") {
    return { twoPhase: true, responseMode: "evidence_first" };
  }
  return getLegacyAskCodebaseOptions();
}

/**
 * Opciones MCP para las cuatro preguntas clásicas (q1–q4) y la síntesis de fallback al armar doc. partida.
 * Con `responseMode: "evidence_first"`, cada `ask_codebase` devuelve el **mismo** JSON MDD (7 secciones);
 * concatenarlo bajo `## 1`–`## 4` repite el payload. El descubrimiento escalonado sigue usando
 * {@link askCodebaseOptionsForCodebaseDoc} con el modo elegido; aquí se fuerza el perfil de `raw_evidence`.
 */
export function askCodebaseOptionsForCodebaseDocClassicSegments(
  responseMode?: CodebaseDocResponseMode,
): AskCodebaseOptions {
  if (responseMode === "evidence_first") {
    return { twoPhase: true, responseMode: "raw_evidence", deterministicRetriever: true };
  }
  if (responseMode === "ingest_mdd") {
    return { twoPhase: true, responseMode: "raw_evidence", deterministicRetriever: true };
  }
  return askCodebaseOptionsForCodebaseDoc(responseMode);
}

/**
 * `raw_evidence` + `deterministicRetriever` hace que `ask_codebase` devuelva el mismo bundle para cualquier pregunta
 * (el ingest no personaliza por texto de la pregunta). El modo clásico debe evitar 4× la misma respuesta.
 */
export function isDeterministicRawEvidenceClassicAsk(opts: AskCodebaseOptions): boolean {
  return opts.responseMode === "raw_evidence" && opts.deterministicRetriever !== false;
}

/**
 * Tras una única evidencia determinista, un segundo `ask_codebase` con `responseMode: default` redacta el MDD en prosa.
 * Desactivar: `LEGACY_CODEBASE_DOC_INDEX_SYNTHESIS=0`.
 */
export function isLegacyCodebaseDocIndexSynthesisEnabled(): boolean {
  return envFlag("LEGACY_CODEBASE_DOC_INDEX_SYNTHESIS", true);
}

/** Tope de caracteres de evidencia+semántica que se inyectan en el prompt de síntesis MDD. */
export function getLegacyCodebaseDocSynthesisInputMaxChars(): number {
  return envInt("LEGACY_CODEBASE_DOC_SYNTHESIS_INPUT_MAX_CHARS", 64000);
}

const LEGACY_ANALYZER_INPUT_MAX = () => parsePositiveInt("LEGACY_ANALYZER_INPUT_MAX_CHARS", 32000);

/**
 * Agente intermedio: resumen estructurado desde evidencia MCP (sin archivos completos).
 * El prompt principal (p. ej. Blueprint) recibe solo esta salida (+ anexo opcional).
 */
export async function runLegacyAnalyzerPass(
  api: TheForgeEvidenceApi,
  projectId: string,
  evidenceMarkdown: string,
): Promise<string> {
  const clipped = clip(evidenceMarkdown.trim(), LEGACY_ANALYZER_INPUT_MAX());
  const instructions =
    "Eres **Legacy Analyzer**. Recibes SOLO el bloque de evidencia del índice TheForge/MCP " +
    "(búsqueda semántica, rutas, firmas vía get_functions). " +
    "NO inventes stack, archivos ni endpoints que no aparezcan.\n\n" +
    "Responde en español con markdown usando **exactamente** estos encabezados:\n" +
    "## Resumen de impacto\n(máximo 8 viñetas; cada una debe poder enlazarse a un fragmento de la evidencia)\n" +
    "## Superficie API\n(rutas/endpoints o «no consta en evidencia»)\n" +
    "## Modelo de datos y persistencia\n(entidades/tablas o «no consta»)\n" +
    "## Riesgos y lagunas del índice\n" +
    "## Paths citados\n(lista única de rutas de archivo que hayas mencionado arriba)\n\n" +
    "Si un apartado no tiene soporte en la evidencia, escribe: *no consta en evidencia*.\n\n" +
    "--- EVIDENCIA ---\n\n" +
    clipped;

  const out = await api.askCodebase(instructions, projectId);
  return (out ?? "").trim();
}

function parsePositiveInt(name: string, fallback: number): number {
  return envInt(name, fallback);
}

/**
 * Extrae rutas de archivo plausibles de salidas del MCP (markdown, listas, backticks).
 */
export function extractCandidatePathsFromMcpText(text: string): string[] {
  if (!text?.trim()) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(RE_BACKTICK_PATH)) {
    const p = m[1]?.trim();
    if (p && !p.includes("..") && p.length > 2) out.add(p.replace(/^\/+/, ""));
  }
  for (const m of text.matchAll(RE_SLASH_PATH)) {
    const p = m[1]?.trim();
    if (p && !p.includes("..") && p.length > 2) out.add(p);
  }
  return [...out];
}

function pathPriority(p: string): number {
  const lower = p.toLowerCase();
  let score = 0;
  if (lower.endsWith("schema.prisma") || lower.includes("prisma/schema")) score += 100;
  if (lower.endsWith("package.json") || lower.endsWith("turbo.json")) score += 80;
  if (lower.includes("/routes/") || lower.includes("\\routes\\")) score += 40;
  if (lower.includes("app.module") || lower.includes("main.ts")) score += 35;
  if (lower.endsWith(".prisma")) score += 50;
  return score;
}

function sortPathsByPriority(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => pathPriority(b) - pathPriority(a) || a.localeCompare(b));
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n… [recortado por LEGACY_SEMANTIC_SECTION_MAX_CHARS]";
}

/**
 * True si hay señal útil del índice MCP (semantic_search + rutas extraídas).
 * Si todo está vacío y aún así pasamos a Legacy Analyzer con `evidence_first`, Ariadne suele
 * responder «sin datos en índice…» aunque el repo exista en UI (o JSON MDD vacío). ID de proyecto/repo incorrecto,
 * desfase de instancia MCP, o índice vectorial aún sin poblar para ese scope.
 */
export function legacyIndexHasUsableGraphEvidence(semanticChunks: string[], chosenPaths: string[]): boolean {
  if (chosenPaths.length > 0) return true;
  const maxChunk = Math.max(0, ...semanticChunks.map((c) => (c?.trim().length ?? 0)));
  return maxChunk >= 80;
}

/**
 * True cuando la salida del Analyzer / MCP es el mensaje de “índice sin datos” (no es documentación útil).
 * En ese caso conviene **no** persistir el bloque y hacer fallback a `ask_codebase` clásico.
 */
export function legacyAnalyzerIndicatesEmptyIndex(markdown: string): boolean {
  const t = (markdown ?? "").toLowerCase();
  return (
    t.includes("sin datos en índice") ||
    t.includes("no se obtuvo contexto desde las herramientas") ||
    (t.includes("verifica sync") && t.includes("reformula la pregunta"))
  );
}

/** Default antes 6000; subido para no truncar índices amplios tras subir `getLegacySemanticSearchLimit`. */
const DEFAULT_LEGACY_SEMANTIC_SECTION_MAX_CHARS = 32_000;

/** Recorte configurable para bloques semantic_search (modo legacy clásico). */
export function clipLegacySemanticSection(s: string): string {
  const max = parsePositiveInt("LEGACY_SEMANTIC_SECTION_MAX_CHARS", DEFAULT_LEGACY_SEMANTIC_SECTION_MAX_CHARS);
  return clip(s.trim(), max);
}

const DEFAULT_CODEBASE_DOC_SEMANTIC_MAX = 64_000;

/**
 * Recorte del índice semántico **solo** al armar «MDD Inicial / doc. partida» (tope mayor que `clipLegacySemanticSection` genérico).
 * `LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS` (default 48k).
 */
export function clipLegacySemanticSectionForCodebaseDoc(s: string): string {
  const max = parsePositiveInt("LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS", DEFAULT_CODEBASE_DOC_SEMANTIC_MAX);
  const t = filterNoiseFromLegacySemanticChunk(s.trim());
  if (t.length <= max) return t;
  return t.slice(0, max) + `\n\n… [recortado: LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS=${max}]`;
}

/**
 * Quita líneas de `semantic_search` que suelen ser ruido (instrucciones LLM, docs de diseño indexados como nodos Markdown).
 * Conservar `**MarkdownDoc:**`: `LEGACY_SEMANTIC_KEEP_MARKDOWN_DOCS=1`.
 */
export function filterNoiseFromLegacySemanticChunk(s: string): string {
  const keepMd = envExplicitlyEnabled("LEGACY_SEMANTIC_KEEP_MARKDOWN_DOCS");
  const lines = s.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/\bGEMINI\.md\b/i.test(line)) continue;
    if (!keepMd && /\*\*MarkdownDoc:\*\*/i.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const part = await Promise.all(chunk.map(fn));
    results.push(...part);
  }
  return results;
}

export interface BuildLegacyEvidenceMarkdownOptions {
  /** Consultas semantic_search (eje modelos / API / UI). */
  semanticQueries?: readonly string[];
  /** Incluir párrafo de síntesis vía ask_codebase (solo re-afirma evidencia). */
  includeSynthesis?: boolean;
}

export interface LegacyIndexSignalsGathered {
  semanticChunks: string[];
  chosenPaths: string[];
  mergedSemantic: string;
}

/**
 * Recopila señales del índice MCP (sin llamadas a LLM).
 * - **Puerta SDD** (`assertLegacyIndexSddGate` / `evaluateLegacyIndexSddGate`): debe seguir usando esta función para no depender del LLM.
 * - **`buildLegacyEvidenceMarkdown`**: pipeline monolítico opcional (p. ej. `getContextForDeliverables` en TheForgeService) — independiente del descubrimiento escalonado del coordinador legacy.
 */
export async function gatherLegacyIndexSignals(
  api: TheForgeEvidenceApi,
  projectId: string,
  options?: Pick<BuildLegacyEvidenceMarkdownOptions, "semanticQueries">,
): Promise<LegacyIndexSignalsGathered> {
  const useAnalyzer = isLegacyAnalyzerCompactEnabled();
  const queries = options?.semanticQueries?.length ? options.semanticQueries : [...DEFAULT_SEMANTIC_QUERIES];
  const semanticLimit = getLegacySemanticSearchLimit();
  const maxPaths = parsePositiveInt("LEGACY_EVIDENCE_MAX_PATHS", useAnalyzer ? 28 : 35);

  const semanticChunks = await Promise.all(
    queries.map((q) => api.semanticSearch(q.trim(), projectId, semanticLimit)),
  );

  const mergedSemantic = semanticChunks.filter(Boolean).join("\n\n");
  const extracted = extractCandidatePathsFromMcpText(mergedSemantic);
  const sorted = sortPathsByPriority(extracted);
  const chosenPaths = sorted.slice(0, maxPaths);

  return { semanticChunks, chosenPaths, mergedSemantic };
}

/**
 * Construye Markdown de contexto: búsqueda semántica + rutas extraídas + símbolos por archivo + extractos de archivos prioritarios.
 * Pensado para SDD legacy: la síntesis va después y debe citar solo lo presente en el bloque de evidencia.
 */
export async function buildLegacyEvidenceMarkdown(
  api: TheForgeEvidenceApi,
  projectId: string,
  options?: BuildLegacyEvidenceMarkdownOptions,
): Promise<string> {
  const useAnalyzer = isLegacyAnalyzerCompactEnabled();
  const queries = options?.semanticQueries?.length ? options.semanticQueries : [...DEFAULT_SEMANTIC_QUERIES];
  const maxFnPaths = parsePositiveInt("LEGACY_EVIDENCE_FUNCTIONS_PATHS", useAnalyzer ? 16 : 20);
  const maxFullFiles = useAnalyzer
    ? 0
    : parsePositiveInt("LEGACY_EVIDENCE_FULL_FILE_PATHS", 3);
  const sectionMax = parsePositiveInt(
    "LEGACY_SEMANTIC_SECTION_MAX_CHARS",
    useAnalyzer ? 4000 : DEFAULT_LEGACY_SEMANTIC_SECTION_MAX_CHARS,
  );
  const fileContentMax = parsePositiveInt("LEGACY_FILE_CONTENT_MAX_CHARS", 4000);

  const { semanticChunks, chosenPaths: chosen } = await gatherLegacyIndexSignals(api, projectId, {
    semanticQueries: options?.semanticQueries,
  });

  const requireGraphHits = envFlag("LEGACY_ANALYZER_REQUIRE_GRAPH_HITS", true);
  if (!legacyIndexHasUsableGraphEvidence(semanticChunks, chosen)) {
    if (requireGraphHits) return "";
  }
  const fnPaths = chosen.slice(0, maxFnPaths);

  const fnBlocks = await mapInBatches(fnPaths, 4, async (path) => {
    const body = await api.getFunctionsInFile(path, projectId, path);
    if (!body?.trim()) return "";
    return `### \`${path}\`\n\n${body.trim()}`;
  });

  const fullFileTargets = chosen.slice(0, maxFullFiles);
  const fileBlocks = await Promise.all(
    fullFileTargets.map(async (path) => {
      const content = await api.getFileContent(path, projectId, undefined, path);
      if (!content?.trim()) return "";
      const clipped = content.length > fileContentMax ? content.slice(0, fileContentMax) + "\n…" : content;
      return `### Extracto: \`${path}\`\n\n\`\`\`\n${clipped}\n\`\`\``;
    }),
  );

  const sections: string[] = [];
  sections.push("# Contexto TheForge — evidencia (índice)\n");
  sections.push(
    "## 1. Búsqueda semántica (grafo)\n\n" +
      queries
        .map((q, i) => `### Query: ${q}\n\n${clip(semanticChunks[i]?.trim() ?? "", sectionMax)}`)
        .join("\n\n---\n\n"),
  );

  if (chosen.length > 0) {
    sections.push("## 2. Rutas candidatas extraídas del índice\n\n" + chosen.map((p) => `- \`${p}\``).join("\n"));
  }

  const fnJoined = fnBlocks.filter(Boolean).join("\n\n---\n\n");
  if (fnJoined) sections.push("## 3. Símbolos por archivo (get_functions_in_file)\n\n" + fnJoined);

  const filesJoined = fileBlocks.filter(Boolean).join("\n\n---\n\n");
  if (filesJoined) sections.push("## 4. Extractos de archivo (prioritarios)\n\n" + filesJoined);

  const evidenceBody = sections.join("\n\n---\n\n");

  if (options?.includeSynthesis === false) return evidenceBody;

  if (useAnalyzer) {
    const analyzed = await runLegacyAnalyzerPass(api, projectId, evidenceBody);
    const core = analyzed.length > 0 ? analyzed : "*Legacy Analyzer no devolvió texto; revisar MCP o límites.*";
    let out =
      "# Contexto TheForge — Legacy Analyzer (compacto)\n\n" +
      "_Resumen estructurado desde índice MCP; los entregables deben anclarse a esto, no inventar fuera de evidencia._\n\n" +
      core;
    if (isLegacyAnalyzerAttachRawEnabled()) {
      out +=
        "\n\n---\n<details><summary>Anexo: evidencia bruta (recortada)</summary>\n\n" +
        clip(evidenceBody, 8000) +
        "\n\n</details>";
    }
    return out;
  }

  const synthPrompt =
    "Below is EVIDENCE from the indexed graph (semantic search + symbols + optional file excerpts). " +
    "Write a concise section in Spanish titled '## Resumen ejecutivo (solo evidencia)'. " +
    "Use at most 20 bullet points. Each bullet must restate something explicitly present in the evidence (file paths, symbols, endpoints). " +
    "If the evidence does not mention a topic, write '(no consta en el índice)' for that topic — do NOT invent stacks, files, or APIs.\n\n---\n\n" +
    clip(evidenceBody, parsePositiveInt("LEGACY_SYNTHESIS_INPUT_MAX_CHARS", 64000));

  const synthesis = await api.askCodebase(synthPrompt, projectId);
  if (!synthesis?.trim()) return evidenceBody;

  return evidenceBody + "\n\n---\n\n" + synthesis.trim();
}

/** Cuenta referencias a rutas/código en un MDD para heurística de calidad SDD. */
export function countMddCodePathReferences(mdd: string): number {
  if (!mdd?.trim()) return 0;
  let n = 0;
  const reTick = /`[^`]+\.(?:ts|tsx|js|jsx|prisma|json|ya?ml|vue|svelte|md)`/gi;
  while (reTick.exec(mdd) !== null) n++;
  const reBare = /(?:^|\s)(?:[\w.-]+\/){2,}[\w.-]+\.(?:ts|tsx|js|jsx|prisma|json)/gm;
  while (reBare.exec(mdd) !== null) n++;
  return n;
}
