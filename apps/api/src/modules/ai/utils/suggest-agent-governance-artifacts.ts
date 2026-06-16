import type { ComplexityLevel } from "@theforge/shared-types";
import { GOVERNANCE_DOCS_PREFIX } from "@theforge/shared-types";
import { selectedPatternIdsFromMdd } from "@theforge/shared-types/mdd-governance-patterns";
import {
  complexityAtLeast,
  GOVERNANCE_ARCHETYPES,
  RULE_CATALOG,
  SKILL_CATALOG,
  type GovernanceArtifactStrength,
  type RuleCatalogEntry,
  type SkillCatalogEntry,
  type ArtifactTemplateContext,
} from "./agent-governance-catalog.js";

export interface RuleSpec {
  id: string;
  path: string;
  purpose: string;
  strength: GovernanceArtifactStrength;
}

export interface SkillSpec {
  id: string;
  path: string;
  folder: string;
  purpose: string;
  strength: GovernanceArtifactStrength;
}

export interface AgentGovernanceSuggestions {
  archetypes: string[];
  suggestedRules: RuleSpec[];
  suggestedSkills: SkillSpec[];
  rationale: string[];
}

export interface SuggestAgentGovernanceInput {
  mddMarkdown: string;
  blueprintMarkdown?: string | null;
  tasksMarkdown?: string | null;
  architectureMarkdown?: string | null;
  specMarkdown?: string | null;
  apiContractsMarkdown?: string | null;
  logicFlowsMarkdown?: string | null;
  uxUiGuideMarkdown?: string | null;
  infraMarkdown?: string | null;
  useCasesMarkdown?: string | null;
  userStoriesMarkdown?: string | null;
  /** Nombre del proyecto en TheForge (fallback si MDD §1 no tiene título). */
  projectName?: string | null;
  complexity: ComplexityLevel;
}

export interface ProjectGovernanceFacts {
  projectTitle: string;
  backendStack?: string;
  frontendStack?: string;
  mobileStack?: string;
  infraStack?: string;
  docPaths: string[];
  taskHeadings: string[];
  taskCheckboxes: string[];
  architectureLayers: string[];
  blueprintModules: string[];
  backendGlobs: string[];
  frontendGlobs: string[];
  npmScripts: string[];
  sddConflicts: string[];
  hasUiSurface: boolean;
}

function corpus(input: SuggestAgentGovernanceInput): string {
  return [
    input.mddMarkdown,
    input.blueprintMarkdown ?? "",
    input.tasksMarkdown ?? "",
    input.architectureMarkdown ?? "",
    input.specMarkdown ?? "",
    input.apiContractsMarkdown ?? "",
    input.logicFlowsMarkdown ?? "",
    input.uxUiGuideMarkdown ?? "",
    input.infraMarkdown ?? "",
    input.useCasesMarkdown ?? "",
    input.userStoriesMarkdown ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeProjectTitleCandidate(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^["'`]|["'`]$/g, "");
  if (!trimmed || /^#/.test(trimmed)) return null;
  if (/^este documento constituye/i.test(trimmed)) return null;
  const beforeBreak = trimmed.split(/\s*[—–-]\s+/)[0]?.split(/:\s+/)[0]?.trim();
  if (!beforeBreak || beforeBreak.length < 3) return null;
  if (/^master design document$/i.test(beforeBreak)) return null;
  return beforeBreak.slice(0, 120);
}

/** Extrae título de alta confianza desde §1 (bold entre paréntesis o em-dash). */
function extractTitleFromSection1(mdd: string): string | null {
  const sec1Match = mdd.match(/##\s*1\.[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  if (!sec1Match?.[1]) return null;
  const sec1 = sec1Match[1];

  const boldParen = sec1.match(/\*\*\(([^)]+)\)\*\*|\*\(([^)]+)\)\*/);
  if (boldParen) {
    const fromParen = (boldParen[1] ?? boldParen[2])?.trim();
    if (fromParen && fromParen.length >= 3) return fromParen.slice(0, 120);
  }

  for (const line of sec1.split("\n")) {
    const emDash = line.match(/^([^—–\n]{3,80})\s*[—–]\s+/);
    if (emDash?.[1]) {
      const candidate = normalizeProjectTitleCandidate(emDash[1]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function extractTitleFromSection1Fallback(mdd: string): string | null {
  const sec1Match = mdd.match(/##\s*1\.[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  if (!sec1Match?.[1]) return null;
  for (const line of sec1Match[1].split("\n")) {
    const candidate = normalizeProjectTitleCandidate(line);
    if (candidate) return candidate;
  }
  return null;
}

/** MDD §1 o primer H1 como título del proyecto. */
export function extractProjectTitle(input: SuggestAgentGovernanceInput): string {
  const mdd = input.mddMarkdown ?? "";
  const fromSec1 = extractTitleFromSection1(mdd);
  if (fromSec1) return fromSec1;
  const h1 = mdd.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) {
    const fromH1 = normalizeProjectTitleCandidate(h1);
    if (fromH1 && !/^mdd\b|master design document$/i.test(fromH1)) return fromH1;
  }
  const fromSec1Fallback = extractTitleFromSection1Fallback(mdd);
  if (fromSec1Fallback) return fromSec1Fallback;
  const named = mdd.match(/(?:nombre|proyecto|project)[:\s]+([^\n]+)/i)?.[1]?.trim();
  if (named) {
    const fromNamed = normalizeProjectTitleCandidate(named);
    if (fromNamed) return fromNamed;
  }
  const fromProject = input.projectName?.trim();
  if (fromProject) return fromProject.slice(0, 120);
  return "Proyecto TheForge";
}

/** Contradicciones frecuentes entre entregables SDD. */
export function detectSddConflicts(text: string): string[] {
  const conflicts: string[] = [];
  if (/typeorm/i.test(text) && /prisma/i.test(text)) {
    conflicts.push(
      "TypeORM vs Prisma: prioriza el ORM declarado en MDD §2/Blueprint; no mezcles ambos en el mismo servicio.",
    );
  }
  if (/kafka/i.test(text) && /rabbitmq/i.test(text)) {
    conflicts.push(
      "Kafka vs RabbitMQ: usa el broker del MDD §2; no dupliques colas ni consumidores.",
    );
  }
  if (/mysql/i.test(text) && /postgres/i.test(text) && !/mysql.*postgres|postgres.*mysql/i.test(text)) {
    conflicts.push(
      "MySQL vs PostgreSQL: confirma el motor en MDD §3 antes de migraciones o schemas.",
    );
  }
  return conflicts;
}

/** Primeras tareas concretas (checkboxes o headings) para PROMPT-INICIAL. */
export function extractTaskCheckboxes(tasksMarkdown: string | null | undefined, limit = 5): string[] {
  const text = tasksMarkdown ?? "";
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const checkbox = line.match(/^[-*]\s+\[ \]\s+(.+)/);
    if (checkbox?.[1]) {
      items.push(`- [ ] ${checkbox[1].trim().slice(0, 140)}`);
      if (items.length >= limit) return items;
    }
  }
  for (const line of text.split("\n")) {
    const bullet = line.match(/^[-*]\s+(?!\[)(.+)/);
    if (bullet?.[1] && bullet[1].trim().length > 4) {
      items.push(`- [ ] ${bullet[1].trim().slice(0, 140)}`);
      if (items.length >= limit) return items;
    }
  }
  for (const line of text.split("\n")) {
    const h = line.match(/^#{2,4}\s+(.+)/);
    if (h?.[1] && !/^(fase|sprint|epic|milestone)\b/i.test(h[1])) {
      items.push(`- [ ] ${h[1].trim().slice(0, 140)}`);
      if (items.length >= limit) return items;
    }
  }
  return items;
}

const NO_UI_SURFACE_PATTERN =
  /(?:sin|no)\s+(?:dashboard|frontend|ui|interfaz|pantalla)|(?:mvp|fase\s*1)[^\n]{0,48}(?:sin|no\s+incluye)\s+(?:dashboard|frontend|ui)|api[\s-]?only|mvp\s+api|cli[\s-]?only|solo\s+api|backend\s+only|without\s+dashboard|sin\s+interfaz|sin\s+dashboard/i;

function hasUiSurface(text: string, authoritativeText?: string): boolean {
  const authority = authoritativeText ?? text;
  if (NO_UI_SURFACE_PATTERN.test(authority)) return false;
  return /react|vue|svelte|angular|next\.js|dashboard|frontend|\bui\b|mobile|expo|storybook|vite/i.test(
    text,
  );
}

function hasLegacyAriadneSignals(text: string): boolean {
  if (/ariadne/i.test(text)) return true;
  if (/legacy|código\s+existente|strangler|validate_before_edit|refactor\s+legacy/i.test(text)) {
    return true;
  }
  if (!/falkor/i.test(text)) return false;
  if (/falkor[\s\S]{0,120}(?:fase|phase)\s*2/i.test(text)) {
    const active =
      /integraci[oó]n\s+mcp|mcp\s+ariadne|validate_before_edit|índice\s+de\s+código|grafo\s+de\s+código/i.test(
        text,
      );
    if (!active) return false;
  }
  return /legacy|strangler|refactor|grafo|código\s+existente/i.test(text);
}

function matchesSignals(text: string, signals: RegExp[]): boolean {
  return signals.some((re) => re.test(text));
}

function detectArchetypes(
  text: string,
  complexity: ComplexityLevel,
  authoritativeUiText?: string,
): string[] {
  const found = new Set<string>();

  const hasBackend =
    /nestjs|express|fastify|fastapi|django|laravel|spring|hono|cloudflare\s+workers?|workers?\s+api/i.test(
      text,
    );
  const uiSurface = hasUiSurface(text, authoritativeUiText);
  const hasFrontend = uiSurface && /react|vue|svelte|angular|next\.js/i.test(text);
  const hasMobile = uiSurface && /expo|react\s*native|react-native/i.test(text);
  const isMonorepo = /monorepo|lerna|pnpm\s+workspace|turborepo|packages\//i.test(text);
  const hasKubernetes = /kubernetes|\bk8s\b|helm/i.test(text);
  const hasDockerDeploy = /docker|dokploy|contenedor/i.test(text);

  if (hasBackend && (hasFrontend || hasMobile) && isMonorepo) found.add("nestjs-react-monorepo");
  if (hasBackend && !hasFrontend && !hasMobile) found.add("api-only");
  if ((hasFrontend || hasMobile) && !hasBackend) found.add("spa-only");
  if (
    uiSurface &&
    /design\s+system|paquete\s+ui|@\w+\/ui\b|storybook/i.test(text)
  ) {
    found.add("design-system-ui");
  }
  if (hasLegacyAriadneSignals(text)) found.add("legacy-ariadne");
  if (/\bjwt\b|oauth|§\s*6|autenticaci[oó]n/i.test(text)) found.add("auth-jwt");
  if (hasKubernetes) found.add("kubernetes");
  else if (hasDockerDeploy || /§\s*7|serverless|cloudflare/i.test(text)) found.add("docker-dokploy");
  if (/\bmcp\b|model\s+context\s+protocol|figma\s+mcp/i.test(text)) found.add("mcp-enabled");

  if (complexity === "LOW" && found.size === 0) {
    if (hasBackend || hasFrontend || hasMobile) {
      found.add(
        hasBackend && (hasFrontend || hasMobile)
          ? "nestjs-react-monorepo"
          : hasBackend
            ? "api-only"
            : "spa-only",
      );
    }
  }

  return [...found].filter((a) =>
    (GOVERNANCE_ARCHETYPES as readonly string[]).includes(a),
  );
}

function firstMatchLabel(text: string, patterns: Array<[RegExp, string]>): string | undefined {
  for (const [re, label] of patterns) {
    if (re.test(text)) return label;
  }
  return undefined;
}

export function inferStacks(text: string): {
  backend?: string;
  frontend?: string;
  mobile?: string;
  infra?: string;
} {
  const backend = firstMatchLabel(text, [
    [/fastapi/i, "FastAPI"],
    [/nestjs/i, "NestJS"],
    [/cloudflare\s+workers?|workers?\s+api/i, "Cloudflare Workers"],
    [/\bhono\b/i, "Hono"],
    [/express/i, "Express"],
    [/fastify/i, "Fastify"],
    [/django/i, "Django"],
    [/laravel/i, "Laravel"],
    [/spring\s*boot/i, "Spring Boot"],
    [/go\s*\/\s*gin|\bgin\b.*go/i, "Go (Gin)"],
    [/supabase\s+edge/i, "Supabase Edge Functions"],
  ]);

  const mobile = firstMatchLabel(text, [
    [/react\s*native|react-native/i, "React Native"],
    [/\bexpo\b/i, "Expo"],
    [/flutter/i, "Flutter"],
  ]);

  const frontend = mobile
    ? undefined
    : firstMatchLabel(text, [
        [/next\.js/i, "Next.js"],
        [/react/i, "React"],
        [/\bvue\b/i, "Vue"],
        [/svelte/i, "Svelte"],
        [/angular/i, "Angular"],
      ]);

  const infra = firstMatchLabel(text, [
    [/serverless/i, "Serverless"],
    [/cloudflare/i, "Cloudflare"],
    [/dokploy/i, "Dokploy"],
    [/kubernetes|\bk8s\b/i, "Kubernetes"],
    [/docker/i, "Docker"],
  ]);

  const backendMatch = text.match(
    /(?:backend|servidor|api)[:\s]+([A-Za-z][A-Za-z0-9.\s/]{1,48})/i,
  );
  const frontendMatch = text.match(
    /(?:frontend|cliente|ui|mobile)[:\s]+([A-Za-z][A-Za-z0-9.\s/]{1,48})/i,
  );

  return {
    backend: backend ?? backendMatch?.[1]?.trim().split(/\s/)[0],
    frontend: frontend ?? frontendMatch?.[1]?.trim().split(/\s/)[0],
    mobile,
    infra,
  };
}

function inferDomainSkillFolder(text: string, blueprintModules: string[]): string | undefined {
  const scoreModule = (name: string): number => {
    const n = name.toLowerCase();
    if (/shared|common|utils|types|config|test|spec/i.test(n)) return 1;
    if (/backend|api|server|service|core|kms-/i.test(n)) return 10;
    if (/web|mobile|app|frontend|ui/i.test(n)) return 8;
    return 5;
  };

  const candidates: string[] = [];
  for (const mod of blueprintModules) {
    const clean = mod.replace(/[`'"\\]/g, "").trim().replace(/\/$/, "");
    if (!clean) continue;
    const segments = clean.split("/").filter(Boolean);
    const leaf = segments[segments.length - 1];
    if (leaf && !/^(src|lib|app|dist|test|tests)$/i.test(leaf)) {
      candidates.push(leaf);
      continue;
    }
    if (/^(apps|packages)$/i.test(segments[0] ?? "") && segments[1]) {
      candidates.push(segments[1]!);
      continue;
    }
    if (segments[0]) candidates.push(segments[0]!);
  }

  if (candidates.length > 0) {
    return [...candidates].sort((a, b) => scoreModule(b) - scoreModule(a))[0];
  }

  const treeDir = text.match(
    /(?:^|\n)[-*\s`]*([a-z0-9][a-z0-9_-]*(?:\/[a-z0-9_-]+)?)\/(?:src|lib|app)\//im,
  )?.[1];
  if (treeDir) {
    const base = treeDir.split("/").pop() ?? treeDir;
    if (base) return base;
  }
  const pkg = text.match(/packages\/([a-z0-9_-]+)/i)?.[1];
  if (pkg && scoreModule(pkg) > 1) return pkg;
  const app = text.match(/(?:^|\s|`)([a-z0-9_-]+)\/(?:src|lib|app)\//im)?.[1];
  if (app && !/^(apps|packages|src)$/i.test(app)) return app;
  return undefined;
}

/** Valid repo path: kms-backend/, packages/foo/, apps/api/ — not prose bullets. */
export function isValidBlueprintModulePath(raw: string): boolean {
  const clean = raw.replace(/[`'"\\]/g, "").trim().replace(/\/$/, "");
  if (!clean || clean.length < 2 || clean.length > 80) return false;
  if (/[*:]/.test(raw)) return false;
  if (/\*\*[^*]+\*\*/.test(raw)) return false;
  if (/:\s*\S/.test(raw.trim())) return false;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  const validSegment = (s: string) => /^[a-z0-9][a-z0-9._-]*$/i.test(s);
  if (!segments.every(validSegment)) return false;

  if (segments[0] === "apps" || segments[0] === "packages") {
    return segments.length >= 2;
  }
  if (/^kms-/i.test(segments[0]!) || /^[a-z0-9][a-z0-9_-]*$/i.test(segments[0]!)) {
    return segments.length <= 3;
  }
  return false;
}

function extractBlueprintModuleFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^#/.test(trimmed)) return null;

  const backtick = trimmed.match(/^[-*]\s+`([^`\n]+)`/);
  if (backtick?.[1] && isValidBlueprintModulePath(backtick[1])) {
    return backtick[1].trim().replace(/\/$/, "");
  }

  const tree = trimmed.match(
    /^[-*]?\s*`?([a-z0-9][a-z0-9_-]*(?:\/[a-z0-9_-]+)*)\/?(?:`|$|\s)/i,
  );
  if (tree?.[1] && isValidBlueprintModulePath(tree[1])) {
    return tree[1].trim().replace(/\/$/, "");
  }
  return null;
}

function extractBlueprintModules(bpText: string): string[] {
  const tree: string[] = [];
  const bullets: string[] = [];

  for (const line of bpText.split("\n")) {
    const mod = extractBlueprintModuleFromLine(line);
    if (!mod) continue;
    const isTreeLine =
      /\/$/.test(line.trim()) ||
      /^\s{2,}/.test(line) ||
      /^(apps|packages|kms-)/i.test(mod);
    if (isTreeLine) tree.push(mod);
    else bullets.push(mod);
  }

  return [...new Set([...tree, ...bullets])].slice(0, 12);
}

function classifyGlobPath(path: string): "backend" | "frontend" | "both" {
  const p = path.toLowerCase();
  if (/web|ui|frontend|mobile|client|dashboard/.test(p)) return "frontend";
  if (/api|backend|server|kms-|worker|service/.test(p)) return "backend";
  return "both";
}

function inferCodebaseGlobs(blueprintModules: string[], text: string): {
  backend: string[];
  frontend: string[];
} {
  const backend = new Set<string>();
  const frontend = new Set<string>();
  const all = new Set<string>();

  for (const mod of blueprintModules) {
    const clean = mod.replace(/[`'"\\]/g, "").trim().replace(/\/$/, "");
    if (!clean || !isValidBlueprintModulePath(clean)) continue;
    all.add(`${clean}/**`);
    const kind = classifyGlobPath(clean);
    if (kind === "backend" || kind === "both") backend.add(`${clean}/**`);
    if (kind === "frontend" || kind === "both") frontend.add(`${clean}/**`);
  }

  for (const line of text.split("\n")) {
    const dir = line.match(/(?:^|\s|`)([a-z0-9_-]+(?:\/[a-z0-9_-]+)?)\/?(?:`|$|\s)/i)?.[1];
    if (!dir || !isValidBlueprintModulePath(dir)) continue;
    all.add(`${dir}/**`);
    const kind = classifyGlobPath(dir);
    if (kind === "backend" || kind === "both") backend.add(`${dir}/**`);
    if (kind === "frontend" || kind === "both") frontend.add(`${dir}/**`);
  }

  if (backend.size === 0) {
    backend.add("src/**");
    backend.add("packages/**/src/**");
  }
  if (frontend.size === 0 && hasUiSurface(text)) {
    frontend.add("apps/web/**");
    frontend.add("packages/**/src/**");
  }

  return {
    backend: [...backend].slice(0, 6),
    frontend: [...frontend].slice(0, 6),
  };
}

function inferNpmScripts(text: string): string[] {
  const scripts: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/pnpm\s+(?:run\s+)?(?:test|lint|typecheck|build)/i, "pnpm test / lint / typecheck / build"],
    [/npm\s+run\s+(test|lint|typecheck|build)/gi, "npm run $1"],
    [/yarn\s+(test|lint|typecheck|build)/gi, "yarn $1"],
    [/turbo\s+run\s+(\w+)/i, "turbo run $1"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(text)) scripts.push(label.replace(/\$(\d+)/g, (_, n) => n));
  }
  const scriptBlock = text.match(/"scripts"\s*:\s*\{([^}]+)\}/s);
  if (scriptBlock?.[1]) {
    for (const m of scriptBlock[1].matchAll(/"(test|lint|typecheck|build)"/g)) {
      scripts.push(`npm run ${m[1]}`);
    }
  }
  return [...new Set(scripts)].slice(0, 6);
}

/** Extrae hechos estructurados del proyecto para inyectar en plantillas de gobernanza. */
export function extractProjectGovernanceFacts(
  input: SuggestAgentGovernanceInput,
): ProjectGovernanceFacts {
  const text = corpus(input);
  const authoritativeUiText = [input.mddMarkdown, input.specMarkdown].filter(Boolean).join("\n\n");
  const stacks = inferStacks(text);
  const projectTitle = extractProjectTitle(input);
  const blueprintModules = extractBlueprintModules(input.blueprintMarkdown ?? "");
  const globs = inferCodebaseGlobs(blueprintModules, text);
  const taskCheckboxes = extractTaskCheckboxes(input.tasksMarkdown);
  const sddConflicts = detectSddConflicts(text);

  const optionalDocs: Array<[boolean, string]> = [
    [!!input.blueprintMarkdown?.trim(), "docs/sdd/blueprint.md"],
    [!!input.specMarkdown?.trim(), "docs/sdd/spec.md"],
    [!!input.architectureMarkdown?.trim(), "docs/sdd/architecture.md"],
    [!!input.tasksMarkdown?.trim(), "docs/sdd/tasks.md"],
    [!!input.useCasesMarkdown?.trim(), "docs/sdd/use-cases.md"],
    [!!input.userStoriesMarkdown?.trim(), "docs/sdd/user-stories.md"],
    [!!input.apiContractsMarkdown?.trim(), "docs/sdd/api-contracts.md"],
    [!!input.logicFlowsMarkdown?.trim(), "docs/sdd/logic-flows.md"],
    [!!input.uxUiGuideMarkdown?.trim(), "docs/sdd/ux-ui-guide.md"],
    [!!input.infraMarkdown?.trim(), "docs/sdd/infra.md"],
  ];

  const docPaths = [
    "docs/sdd/mdd.md",
    ...optionalDocs.filter(([ok]) => ok).map(([, p]) => p),
    `${GOVERNANCE_DOCS_PREFIX}references/THEFORGE-DOC-CONSUMPTION-GUIDE.md`,
    `${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`,
    "AGENTS.md",
  ];

  const taskHeadings: string[] = [];
  const tasksText = input.tasksMarkdown ?? "";
  for (const line of tasksText.split("\n")) {
    const h = line.match(/^#{1,3}\s+(.+)/);
    if (h?.[1]) taskHeadings.push(h[1].trim().slice(0, 120));
    if (taskHeadings.length >= 12) break;
  }

  const architectureLayers: string[] = [];
  const archText = input.architectureMarkdown ?? "";
  for (const line of archText.split("\n")) {
    const h = line.match(/^#{2,3}\s+(.+)/);
    if (h?.[1]) architectureLayers.push(h[1].trim().slice(0, 100));
    if (architectureLayers.length >= 10) break;
  }

  return {
    projectTitle,
    backendStack: stacks.backend,
    frontendStack: stacks.frontend,
    mobileStack: stacks.mobile,
    infraStack: stacks.infra,
    docPaths,
    taskHeadings,
    taskCheckboxes,
    architectureLayers,
    blueprintModules,
    backendGlobs: globs.backend,
    frontendGlobs: globs.frontend,
    npmScripts: inferNpmScripts(text),
    sddConflicts,
    hasUiSurface: hasUiSurface(text, authoritativeUiText),
  };
}

function wizardArchitectureActive(mdd: string): boolean {
  const ids = selectedPatternIdsFromMdd(mdd);
  const archIds = new Set([
    "hexagonal",
    "clean-architecture",
    "microservices",
    "monolith-modular",
    "cqrs",
    "event-driven",
    "soa",
    "serverless",
  ]);
  for (const id of ids) {
    if (archIds.has(id)) return true;
  }
  return false;
}

function ruleStrength(
  rule: RuleCatalogEntry,
  text: string,
  archetypes: string[],
  complexity: ComplexityLevel,
  authoritativeUiText?: string,
): GovernanceArtifactStrength | null {
  if (!complexityAtLeast(complexity, rule.minComplexity)) return null;

  if (rule.id === "git-commits") return "strong";
  if (rule.id === "orchestrator" && complexity !== "LOW") return "weak";

  if (rule.id === "stack-frontend" && !hasUiSurface(text, authoritativeUiText)) return null;

  const signalHit = matchesSignals(text, rule.signals);
  const archetypeHit = rule.archetypes?.some((a) => archetypes.includes(a)) ?? false;
  const wizardHit = rule.id === "architecture-patterns" && wizardArchitectureActive(text);

  if (!signalHit && !archetypeHit && !wizardHit) return null;

  if (rule.id === "git-commits" || rule.id === "stack-backend" || rule.id === "stack-frontend") {
    return signalHit || archetypeHit ? "strong" : "weak";
  }
  if (rule.id === "mcp-governance" && hasLegacyAriadneSignals(text)) return "strong";
  if (rule.id === "security-auth" && /\bjwt\b|oauth/i.test(text)) return "strong";
  if (wizardHit) return "strong";

  return signalHit && archetypeHit ? "strong" : signalHit || archetypeHit ? "weak" : null;
}

function skillStrength(
  skill: SkillCatalogEntry,
  text: string,
  archetypes: string[],
  complexity: ComplexityLevel,
  authoritativeUiText?: string,
): GovernanceArtifactStrength | null {
  if (!complexityAtLeast(complexity, skill.minComplexity)) return null;

  if (skill.id === "design-system-ui" && !hasUiSurface(text, authoritativeUiText)) return null;
  if (skill.id === "mcp-ariadne" && !hasLegacyAriadneSignals(text)) return null;

  const signalHit = matchesSignals(text, skill.signals);
  const archetypeHit = skill.archetypes?.some((a) => archetypes.includes(a)) ?? false;

  if (skill.id === "domain-package" && complexity !== "LOW") {
    return complexity === "HIGH" || signalHit ? "strong" : "weak";
  }

  if (skill.id === "deploy-docker") {
    if (archetypes.includes("kubernetes")) return null;
    if (archetypes.includes("docker-dokploy")) return signalHit ? "strong" : "weak";
  }
  if (skill.id === "deploy-kubernetes") {
    if (!archetypes.includes("kubernetes")) return null;
    return "strong";
  }

  if (!signalHit && !archetypeHit) return null;

  if (skill.id === "mcp-ariadne" && /ariadne/i.test(text)) return "strong";
  if (skill.id === "design-system-ui" && archetypes.includes("design-system-ui")) return "strong";

  return signalHit && archetypeHit ? "strong" : "weak";
}

function capByComplexity(
  rules: RuleSpec[],
  skills: SkillSpec[],
  complexity: ComplexityLevel,
): { rules: RuleSpec[]; skills: SkillSpec[] } {
  if (complexity === "LOW") {
    const git = rules.find((r) => r.id === "git-commits");
    const stack = rules.find((r) => r.id === "stack-backend" || r.id === "stack-frontend");
    return {
      rules: [git, stack].filter((r): r is RuleSpec => !!r).slice(0, 2),
      skills: [],
    };
  }
  if (complexity === "MEDIUM") {
    return {
      rules: rules.slice(0, 5),
      skills: skills.slice(0, 2),
    };
  }
  return {
    rules: rules.slice(0, 8),
    skills: skills.slice(0, 5),
  };
}

function resolveSkillPath(skill: SkillCatalogEntry, folder?: string): string {
  if (skill.dynamicFolder && folder) {
    return `docs/agent-governance/skills/${folder}/SKILL.md`;
  }
  return skill.path;
}

/**
 * Detecta arquetipos y artefactos (rules/skills) sugeridos desde MDD, Blueprint, Tasks, Architecture y complejidad.
 */
export function suggestAgentGovernanceArtifacts(
  input: SuggestAgentGovernanceInput,
): AgentGovernanceSuggestions {
  const text = corpus(input);
  const authoritativeUiText = [input.mddMarkdown, input.specMarkdown].filter(Boolean).join("\n\n");
  const archetypes = detectArchetypes(text, input.complexity, authoritativeUiText);
  const rationale: string[] = [];
  const facts = extractProjectGovernanceFacts(input);
  const domainFolder = inferDomainSkillFolder(text, facts.blueprintModules);

  if (archetypes.length > 0) {
    rationale.push(`Arquetipos detectados: ${archetypes.join(", ")}.`);
  }

  const stacks = inferStacks(text);
  const stackParts = [stacks.backend, stacks.frontend, stacks.mobile, stacks.infra].filter(Boolean);
  if (stackParts.length > 0) {
    rationale.push(`Stack inferido: ${stackParts.join(", ")}.`);
  }

  const suggestedRules: RuleSpec[] = [];
  for (const rule of RULE_CATALOG) {
    const strength = ruleStrength(rule, text, archetypes, input.complexity, authoritativeUiText);
    if (!strength) continue;
    suggestedRules.push({
      id: rule.id,
      path: rule.path,
      purpose: rule.description,
      strength,
    });
    rationale.push(
      `Rule \`${rule.id}\`: ${rule.description} (señal ${strength === "strong" ? "fuerte" : "moderada"}, min ${rule.minComplexity}).`,
    );
  }

  const suggestedSkills: SkillSpec[] = [];
  for (const skill of SKILL_CATALOG) {
    const strength = skillStrength(skill, text, archetypes, input.complexity, authoritativeUiText);
    if (!strength) continue;
    const folder = skill.dynamicFolder && domainFolder ? domainFolder : skill.folder;
    const path = resolveSkillPath(skill, folder);
    suggestedSkills.push({
      id: skill.id,
      path,
      folder,
      purpose: skill.description,
      strength,
    });
    rationale.push(
      `Skill \`${skill.id}\`: ${skill.description} (señal ${strength === "strong" ? "fuerte" : "moderada"}).`,
    );
  }

  const capped = capByComplexity(suggestedRules, suggestedSkills, input.complexity);

  if (input.complexity === "LOW") {
    rationale.push("Complejidad LOW: máximo 2 rules, sin skills obligatorias.");
  } else if (input.complexity === "HIGH" && archetypes.includes("nestjs-react-monorepo")) {
    rationale.push("Complejidad HIGH + monorepo: considerar AGENTS.md anidados bajo packages/.");
  }

  if (input.tasksMarkdown?.trim()) {
    rationale.push("Tasks disponibles: PROMPT-INICIAL y PROGRESO derivados del checklist.");
  }
  if (facts.sddConflicts.length > 0) {
    rationale.push(`Conflictos SDD detectados: ${facts.sddConflicts.length} (ver AGENTS.md / PROMPT-INICIAL).`);
  }

  return {
    archetypes,
    suggestedRules: capped.rules,
    suggestedSkills: capped.skills,
    rationale,
  };
}

/** Bloque para inyectar en el user prompt del LLM. */
export function formatSuggestedArtifactsPromptBlock(
  suggestions: AgentGovernanceSuggestions,
): string {
  const lines = [
    "## ARTEFACTOS SUGERIDOS (detector TheForge — obligatorio)",
    "",
    "Genera **exactamente** estos artefactos del catálogo (paths y propósito). " +
      "Puedes enriquecer el contenido con datos del MDD/Blueprint/Tasks/Architecture; **no** inventes otros skills " +
      "salvo **1** skill de dominio nombrada explícitamente en §1.",
    "",
  ];

  if (suggestions.archetypes.length > 0) {
    lines.push(`**Arquetipos:** ${suggestions.archetypes.join(", ")}`, "");
  }

  if (suggestions.suggestedRules.length > 0) {
    lines.push("### Rules a generar", "");
    for (const r of suggestions.suggestedRules) {
      lines.push(`- \`${r.path}\` — ${r.purpose} (señal: ${r.strength})`);
    }
    lines.push("");
  }

  if (suggestions.suggestedSkills.length > 0) {
    lines.push("### Skills a generar", "");
    for (const s of suggestions.suggestedSkills) {
      lines.push(`- \`${s.path}\` — ${s.purpose} (señal: ${s.strength})`);
    }
    lines.push("");
  }

  if (suggestions.rationale.length > 0) {
    lines.push("### Rationale (incluir resumen en COMO-USAR § tabla)", "");
    for (const r of suggestions.rationale.slice(0, 12)) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join("\n");
}

export function buildArtifactTemplateContext(
  suggestions: AgentGovernanceSuggestions,
  complexity: ComplexityLevel,
  input: SuggestAgentGovernanceInput,
): ArtifactTemplateContext {
  const text = corpus(input);
  const stacks = inferStacks(text);
  const facts = extractProjectGovernanceFacts(input);
  return {
    complexity,
    archetypes: suggestions.archetypes,
    domainSkillFolder: inferDomainSkillFolder(text, facts.blueprintModules),
    backendStack: stacks.backend,
    frontendStack: stacks.frontend ?? stacks.mobile,
    mobileStack: stacks.mobile,
    infraStack: stacks.infra,
    projectFacts: facts,
  };
}
