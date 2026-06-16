/**
 * Flujos de lógica legacy etapa 1 (AS-IS): anclados a servicios §5 y rutas §4 — sin inventar endpoints.
 */

import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import { extractEdgeCaseTitles } from "./legacy-as-is-spec.util.js";
import { isLegacyBaselineFullDetailEnabled } from "./legacy-baseline-detail.util.js";

export interface MddSection5ServiceRow {
  service: string;
  dependencies?: string;
}

function extractApiRouteRows(section4: string, max = 200): string[] {
  const routes: string[] = [];
  for (const line of section4.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes(":---")) continue;
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (/^ruta$/i.test(cells[0] ?? "") || /^método/i.test(cells[0] ?? "")) continue;
    const routeCell = cells.find((c) => c.startsWith("/") || /^GET|POST|PUT|PATCH|DELETE/i.test(c));
    if (routeCell) routes.push(routeCell.replace(/\s+/g, " ").slice(0, 140));
    else if (cells[0]?.startsWith("/")) routes.push(cells[0].slice(0, 140));
    if (routes.length >= max) break;
  }
  return routes;
}

/** Filas `| Servicio | Dependencias (paths) |` del MDD §5. */
export function extractServicesFromSection5(section5: string): MddSection5ServiceRow[] {
  const rows: MddSection5ServiceRow[] = [];
  let inServiceTable = false;

  for (const line of section5.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inServiceTable && rows.length > 0) break;
      continue;
    }
    if (/servicio/i.test(trimmed) && /dependencias/i.test(trimmed)) {
      inServiceTable = true;
      continue;
    }
    if (trimmed.includes(":---")) continue;
    if (!inServiceTable) continue;

    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const service = cells[0] ?? "";
    if (!service || /^servicio$/i.test(service)) continue;
    rows.push({ service, dependencies: cells[1] });
  }

  if (rows.length > 0) return rows;

  for (const line of section5.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes(":---")) continue;
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 2 && /strapi:|nest:|service/i.test(cells[0])) {
      rows.push({ service: cells[0], dependencies: cells[1] });
    }
  }

  return rows;
}

function isLikelyCustomRoute(route: string): boolean {
  const path = route.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "").trim();
  if (!path.startsWith("/")) return false;
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 2) return false;
  const last = segments[segments.length - 1] ?? "";
  return (
    /[A-Z]/.test(last) ||
    last.includes("WDetalles") ||
    last.includes("calcula") ||
    last.includes("search") ||
    last.includes("crear") ||
    last.includes("obtener") ||
    path.includes("geo/") ||
    path.includes("export")
  );
}

export function buildLegacyAsIsLogicFlowsCoverageChecklist(mddMarkdown: string): string {
  const s4 = extractSectionByNumber(mddMarkdown, 4);
  const s5 = extractSectionByNumber(mddMarkdown, 5);
  const services = extractServicesFromSection5(s5);
  const edgeCases = extractEdgeCaseTitles(s5);
  const routes = extractApiRouteRows(s4);
  const customRoutes = routes.filter(isLikelyCustomRoute);

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (Flujos AS-IS — anclaje §5 + rutas §4):**",
    "",
    "**Reglas de este documento:**",
    "- Un `## Flujo N:` por **servicio nombrado** en la tabla §5 (agrupa solo si el MDD agrupa explícitamente).",
    "- **Ruta HTTP:** copia literal de §4; si no hay ruta custom, indica «CRUD Strapi estándar» — **prohibido** inventar `/sync/bitrix`, `emitir-factura`, etc.",
    "- Pasos no evidenciados en §5/TheForge: marca `*(inferido — verificar en código)*`.",
    "- Cierra cada bloque Mermaid con ``` en línea propia.",
    "",
  ];

  if (services.length) {
    lines.push("**Servicios §5 (cada fila → al menos un flujo documentado):**");
    for (const s of services.slice(0, 150)) {
      lines.push(`- [ ] ${s.service}${s.dependencies ? ` — deps: ${s.dependencies.slice(0, 80)}` : ""}`);
    }
    if (services.length > 150) {
      lines.push(`- [ ] … y ${services.length - 150} servicios adicionales en §5`);
    }
    lines.push("");
  }

  if (customRoutes.length) {
    lines.push("**Rutas custom §4 (deben aparecer en el encabezado del flujo correspondiente):**");
    for (const r of customRoutes.slice(0, 80)) lines.push(`- [ ] ${r}`);
    if (customRoutes.length > 80) {
      lines.push(`- [ ] … y ${customRoutes.length - 80} rutas custom más`);
    }
    lines.push("");
  }

  if (edgeCases.length) {
    lines.push("**Edge cases §5 (casos de borde en el flujo que aplique):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  lines.push("**Cierre:** `## Cumplimiento con el MDD` honesto (cobertos / pendientes / no consta).");
  lines.push("**Opcional:** `## Matriz de trazabilidad` — Servicio §5 | Ruta §4 | Flujo # | Estado.");

  return lines.join("\n");
}

export const LEGACY_AS_IS_LOGIC_FLOWS_SYSTEM_APPENDIX =
  "\n\n**Modo legacy etapa 1 (Flujos de lógica AS-IS):**\n" +
  "- Documento **único** con H1 `# Flujos de lógica` (o título equivalente del prompt). **PROHIBIDO** encabezados `> section merge` o bloques parciales `Sin contenido aplicable`.\n" +
  "- **Catálogo de flujos:** deriva de la tabla **Servicio | Dependencias** del MDD §5. No sustituyas un servicio real por un endpoint inventado (`crear-cotizacion`, `emitir-factura`, `POST /sync/bitrix`, `generar-reporte-campania`, etc.) si **no** figura en §4/§5.\n" +
  "- **Semántica:** respeta la lógica descrita en §5 (p. ej. `calculaBolsa` = bolsa/optimización de pauta, no un calculador fiscal genérico salvo que §5 lo diga).\n" +
  "- **Diagramas Mermaid:** cada bloque abre y **cierra** con ``` ; secuencia o flowchart válidos (sin `Alt`/`Else` sueltos fuera de sintaxis Mermaid).\n" +
  "- **Inferencia acotada:** detalle interno (transacciones, rollback, timeouts) permitido si está marcado `*(inferido — verificar en código)*`. **PROHIBIDO** afirmar «no se añadieron funcionalidades fuera del MDD» si hay inferencias.\n" +
  "- Incluye flujo de **auth JWT / roles** solo si §6 o §1 lo documentan; usa rutas Strapi estándar (`/auth/local`).\n" +
  "- Volumen: **todos** los servicios custom §5 con lógica no trivial; CRUD Strapi puro puede agruparse en un flujo «Patrón CRUD content-types» con lista de excepciones custom.\n";

export const LEGACY_AS_IS_LOGIC_FLOWS_THEFORGE_APPENDIX =
  "\n\n**TheForge (codebase indexado):** Usa paths de servicios/controladores del contexto para pasos concretos. " +
  "Si el índice no muestra un paso, márcalo como inferido — no lo presentes como hecho verificado.\n";

export function buildLegacyAsIsLogicFlowsUserPreamble(checklist: string): string {
  return (
    "Genera el **documento completo de Flujos de lógica** del **sistema actual** (MDD AS-IS §4–§5).\n" +
    "Describe el *cómo* paso a paso **solo** para servicios y rutas documentados; marca inferencias.\n\n" +
    (checklist ? checklist + "\n\n" : "") +
    "**Instrucción:** Recorre el checklist de servicios §5 antes de cerrar. " +
    "Prioriza cobertura de servicios custom sobre flujos genéricos inventados. " +
    "En Cumplimiento con el MDD, lista explícitamente servicios §5 aún no documentados si el volumen excede un solo pase.\n\n"
  );
}

/** Servicios §5 indexados en el MDD. */
export function extractSection5Services(mddMarkdown: string): MddSection5ServiceRow[] {
  return extractServicesFromSection5(extractSectionByNumber(mddMarkdown, 5));
}

export function readLogicFlowsBatchSize(): number {
  const raw = process.env.LEGACY_AS_IS_LOGIC_FLOWS_BATCH_SIZE?.trim();
  const n = raw ? parseInt(raw, 10) : 18;
  return Number.isFinite(n) && n > 0 ? n : 18;
}

/** Objetivo de cobertura §5 (0–1). Env `LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_TARGET`: `90` o `0.9`. */
export function readLogicFlowsCoverageTarget(): number {
  const raw = process.env.LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_TARGET?.trim();
  if (!raw) return 0.9;
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0.9;
  return n > 1 ? n / 100 : n;
}

export function isLegacyAsIsLogicFlowsBatchEnabled(): boolean {
  if (!isLegacyBaselineFullDetailEnabled()) return false;
  const v = process.env.LEGACY_AS_IS_LOGIC_FLOWS_BATCH?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function isLegacyAsIsLogicFlowsGapPassEnabled(): boolean {
  if (!isLegacyAsIsLogicFlowsBatchEnabled()) return false;
  const v = process.env.LEGACY_AS_IS_LOGIC_FLOWS_GAP_PASS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

/** Gate Workshop: aviso cuando cobertura §5 < objetivo (solo legacy etapa 1). */
export function isLegacyAsIsLogicFlowsCoverageGateEnabled(): boolean {
  if (!isLegacyBaselineFullDetailEnabled()) return false;
  const v = process.env.LEGACY_AS_IS_LOGIC_FLOWS_COVERAGE_GATE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunkSize = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

function serviceMentionTokens(service: string): string[] {
  const normalized = service.trim();
  const tokens = new Set<string>();
  if (normalized.length > 2) tokens.add(normalized);
  const withoutPrefix = normalized.replace(/^(strapi|nest|api):/i, "").trim();
  if (withoutPrefix.length > 2) tokens.add(withoutPrefix);
  const basename = withoutPrefix.split(/[/:]/).pop()?.trim() ?? "";
  if (basename.length > 3) tokens.add(basename);
  return [...tokens];
}

export interface LogicFlowsSection5CoverageScore {
  totalServices: number;
  coveredServices: number;
  coveragePercent: number;
  missingServices: string[];
  targetPercent: number;
  metTarget: boolean;
}

export interface LogicFlowsSection5CoverageReport {
  totalServices: number;
  coveredServices: number;
  coveragePercent: number;
  missingServices: string[];
  targetPercent: number;
  metTarget: boolean;
  batchCount?: number;
  gapPassApplied?: boolean;
}

export function scoreLogicFlowsSection5Coverage(
  mddMarkdown: string,
  logicFlowsContent: string,
): LogicFlowsSection5CoverageScore {
  const services = extractSection5Services(mddMarkdown);
  const doc = logicFlowsContent.toLowerCase();
  const missingServices: string[] = [];
  let coveredServices = 0;

  for (const row of services) {
    const tokens = serviceMentionTokens(row.service);
    const covered = tokens.some((token) => token.length > 2 && doc.includes(token.toLowerCase()));
    if (covered) coveredServices++;
    else missingServices.push(row.service);
  }

  const totalServices = services.length;
  const targetPercent = readLogicFlowsCoverageTarget();
  const coveragePercent = totalServices === 0 ? 1 : coveredServices / totalServices;

  return {
    totalServices,
    coveredServices,
    coveragePercent,
    missingServices,
    targetPercent,
    metTarget: coveragePercent >= targetPercent,
  };
}

export function toLogicFlowsSection5CoverageReport(
  score: LogicFlowsSection5CoverageScore,
  extras?: Pick<LogicFlowsSection5CoverageReport, "batchCount" | "gapPassApplied">,
): LogicFlowsSection5CoverageReport {
  return {
    totalServices: score.totalServices,
    coveredServices: score.coveredServices,
    coveragePercent: Math.round(score.coveragePercent * 1000) / 10,
    missingServices: score.missingServices,
    targetPercent: Math.round(score.targetPercent * 1000) / 10,
    metTarget: score.metTarget,
    ...extras,
  };
}

export function stripLogicFlowsComplianceSection(md: string): string {
  return md.replace(/\n## Cumplimiento con el MDD \(cobertura §5[\s\S]*$/m, "").trim();
}

/** Quita H1 y secciones de cierre al fusionar fragmentos de lote. */
export function stripLogicFlowsFragmentWrapper(md: string): string {
  let s = md.trim();
  s = s.replace(/^#\s*Flujos[^\n]*\n+/im, "");
  s = stripLogicFlowsComplianceSection(s);
  s = s.replace(/^## Cumplimiento con el MDD[\s\S]*$/m, "").trim();
  return s;
}

function routeMatchesService(route: string, service: string): boolean {
  const routeLower = route.toLowerCase();
  for (const token of serviceMentionTokens(service)) {
    if (token.length > 3 && routeLower.includes(token.toLowerCase())) return true;
  }
  return false;
}

export function buildLogicFlowsBatchChecklist(
  mddMarkdown: string,
  batchServices: MddSection5ServiceRow[],
): string {
  const lines: string[] = [
    "**CHECKLIST DEL LOTE (solo estos servicios §5):**",
    "",
    "- **Ruta HTTP:** copia literal de §4; si no hay ruta custom, indica «CRUD Strapi estándar».",
    "- Pasos no evidenciados: marca `*(inferido — verificar en código)*`.",
    "- Cierra cada bloque Mermaid con ``` en línea propia.",
    "",
  ];

  for (const s of batchServices) {
    lines.push(`- [ ] ${s.service}${s.dependencies ? ` — deps: ${s.dependencies.slice(0, 80)}` : ""}`);
  }

  const s4 = extractSectionByNumber(mddMarkdown, 4);
  const routes = extractApiRouteRows(s4).filter((r) =>
    batchServices.some((s) => routeMatchesService(r, s.service)),
  );
  if (routes.length) {
    lines.push("", "**Rutas §4 del lote:**");
    for (const r of routes.slice(0, 40)) lines.push(`- [ ] ${r}`);
  }

  lines.push("", "**Solo genera bloques `## Flujo N:` — sin H1, sin Cumplimiento, sin Matriz.**");
  return lines.join("\n");
}

export function buildLogicFlowsBatchSystemAppendix(startFlowNumber: number): string {
  return (
    "\n\n**Modo lote (fragmento):** Genera **solo** bloques `## Flujo N:` para los servicios del checklist. " +
    `Numeración empieza en **${startFlowNumber}**. **NO** H1, **NO** ` +
    "`## Cumplimiento con el MDD`, **NO** matriz final.\n"
  );
}

export function buildLogicFlowsBatchUserPreamble(
  mddMarkdown: string,
  batchServices: MddSection5ServiceRow[],
  batchIndex: number,
  totalBatches: number,
  startFlowNumber: number,
): string {
  const checklist = buildLogicFlowsBatchChecklist(mddMarkdown, batchServices);
  return (
    `Genera **solo los flujos** del lote **${batchIndex + 1}/${totalBatches}** ` +
    `(numeración desde **Flujo ${startFlowNumber}**).\n\n` +
    checklist +
    "\n\n"
  );
}

export function buildLogicFlowsComplianceAppendix(score: LogicFlowsSection5CoverageScore): string {
  const pct = Math.round(score.coveragePercent * 1000) / 10;
  const targetPct = Math.round(score.targetPercent * 1000) / 10;
  const missing = score.missingServices.slice(0, 40);
  let block = "## Cumplimiento con el MDD (cobertura §5 — telemetría)\n\n";
  block += `- Servicios §5 indexados: **${score.totalServices}**\n`;
  block += `- Documentados en flujos: **${score.coveredServices}** (${pct}%)\n`;
  block += `- Objetivo configurado: **${targetPct}%** — ${score.metTarget ? "cumplido" : "pendiente"}\n`;
  if (missing.length) {
    block += "\n**Servicios §5 sin mención detectada:**\n";
    for (const m of missing) block += `- ${m}\n`;
    if (score.missingServices.length > 40) {
      block += `- … y ${score.missingServices.length - 40} más\n`;
    }
  }
  return block;
}

export function finalizeLogicFlowsDocument(
  bodyWithoutHeader: string,
  mddMarkdown: string,
): { content: string; coverage: LogicFlowsSection5CoverageScore } {
  const body = stripLogicFlowsFragmentWrapper(bodyWithoutHeader);
  const header =
    "# Flujos de lógica\n\n" +
    "> Documento AS-IS; flujos anclados a servicios MDD §5 (ensamblado por lotes cuando aplica).\n\n";
  const merged = header + body;
  const coverage = scoreLogicFlowsSection5Coverage(mddMarkdown, merged);
  const content = merged + "\n\n" + buildLogicFlowsComplianceAppendix(coverage);
  return { content, coverage };
}
