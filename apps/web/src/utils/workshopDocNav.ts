/**
 * Document tabs shown in Workshop (toolbar) and global sidebar when a project is open.
 * Keeps visibility rules in sync with `WorkshopView` / `isTabVisibleForComplexity`.
 */
import type { LucideIcon } from "lucide-react";
import { Brain,
  Bot,
  ClipboardList,
  Edit3,
  FileCode,
  FileText,
  GitBranch,
  LayoutTemplate,
  Link2,
  ListOrdered,
  ListTodo,
  Package,
  Palette,
  Server,
  Target,
} from "lucide-react";
import { agentGovernanceScaffoldHasContent } from "@theforge/shared-types";
import { isTabVisibleForComplexity, type WorkshopDocTab } from "./complexityTabs";

/** Greenfield (NEW) steps required before generating downstream deliverables. */
export const WORKSHOP_MANDATORY_NEW_PROJECT_STEP_IDS = ["benchmark", "brd", "mdd"] as const;

export type WorkshopMandatoryNewProjectStepId =
  (typeof WORKSHOP_MANDATORY_NEW_PROJECT_STEP_IDS)[number];

export function isWorkshopMandatoryDeliverableStep(
  id: string,
  opts: { isLegacyProject: boolean },
): boolean {
  if (opts.isLegacyProject) return false;
  return (WORKSHOP_MANDATORY_NEW_PROJECT_STEP_IDS as readonly string[]).includes(id);
}

export interface WorkshopDocNavItem {
  id: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  content: unknown;
  /** Required before other deliverables can be generated (Paso 0 → BRD → MDD). */
  required?: boolean;
}

export interface WorkshopDocNavBuildContext {
  isLegacyProject: boolean;
  effectiveComplexityForTabs: "LOW" | "MEDIUM" | "HIGH";
  activeLegacyState: { description?: string; codebaseDoc?: string } | null | undefined;
  activeWorkshopStage: { brdContent?: string | null } | null | undefined;
  phase0SummaryContent: string | null | undefined;
  dbgaContent: string | null | undefined;
  mddContent: string | null | undefined;
  specContent: string | null | undefined;
  architectureContent: string | null | undefined;
  useCasesContent: string | null | undefined;
  userStoriesContent: string | null | undefined;
  blueprintContent: string | null | undefined;
  uxUiGuideContent: string | null | undefined;
  aemContent: string | null | undefined;
  apiContractsContent: string | null | undefined;
  logicFlowsContent: string | null | undefined;
  tasksContent: string | null | undefined;
  agentGovernanceContent: string | null | undefined;
  infraContent: string | null | undefined;
  adrs: unknown[] | null | undefined;
}

export function workshopTabDocHasContent(tabId: string, content: unknown): boolean {
  if (tabId === "adrs") return Array.isArray(content) && content.length > 0;
  if (tabId === "agent-governance") return agentGovernanceScaffoldHasContent(content as string | null);
  return !!String(content ?? "").trim();
}

function agentGovernanceNavItem(ctx: WorkshopDocNavBuildContext): WorkshopDocNavItem {
  return {
    id: "agent-governance",
    label: "Gobernanza IA",
    title: "Scaffold AGENTS.md + .cursor/** para agentes implementadores",
    Icon: Bot,
    content: ctx.agentGovernanceContent,
  };
}

export function buildWorkshopDocNavItems(ctx: WorkshopDocNavBuildContext): WorkshopDocNavItem[] {
  const tabPt = ctx.isLegacyProject ? "LEGACY" : "NEW";
  const visible = (id: WorkshopDocTab) =>
    isTabVisibleForComplexity(id, ctx.effectiveComplexityForTabs, { projectType: tabPt });
  const items: WorkshopDocNavItem[] = [];

  if (ctx.isLegacyProject) {
    items.push({
      id: "legacy",
      label: "Modificación",
      title: "Describir modificación → AriadneSpecs → MDD → entregables",
      Icon: Edit3,
      content: ctx.activeLegacyState?.description ?? "",
    });
    if (visible("mdd-inicial")) {
      items.push({
        id: "mdd-inicial",
        label: "MDD Inicial",
        title: "Documentación de partida del codebase (AriadneSpecs)",
        Icon: FileText,
        content: ctx.activeLegacyState?.codebaseDoc ?? "",
      });
    }
  } else {
    items.push({
      id: "benchmark",
      label: "Paso 0",
      title: "Benchmark & Gap Analysis (Paso 0) — obligatorio para generar el resto de entregables",
      Icon: Target,
      content: (ctx.phase0SummaryContent || "") + (ctx.dbgaContent || ""),
      required: true,
    });
  }

  // WORKSHOP DOC NAV— keep only BRD tab
  if (visible("brd")) {
    items.push({
      id: "brd",
      label: "BRD",
      title: "BRD por etapa — obligatorio antes de MDD y entregables posteriores",
      Icon: ClipboardList,
      content: ctx.activeWorkshopStage?.brdContent,
      required: !ctx.isLegacyProject,
    });
  }
  if (visible("mdd")) {
    items.push({
      id: "mdd",
      label: "MDD",
      title: "Constitución del proyecto — obligatorio para Spec, Blueprint, API e Infra",
      Icon: FileText,
      content: ctx.mddContent,
      required: !ctx.isLegacyProject,
    });
  }
  if (visible("spec")) {
    items.push({
      id: "spec",
      label: "Spec",
      title: "Spec (SDD: what/why); alimenta el MDD",
      Icon: ListOrdered,
      content: ctx.specContent,
    });
  }
  if (visible("architecture")) {
    items.push({
      id: "architecture",
      label: "Arq.",
      title: "Arquitectura",
      Icon: GitBranch,
      content: ctx.architectureContent,
    });
  }
  if (visible("use-cases")) {
    items.push({
      id: "use-cases",
      label: "Casos",
      title: "Casos de uso",
      Icon: ListOrdered,
      content: ctx.useCasesContent,
    });
  }
  if (visible("user-stories")) {
    items.push({
      id: "user-stories",
      label: "H.U.",
      title: "Historias de usuario",
      Icon: Package,
      content: ctx.userStoriesContent,
    });
  }
  if (visible("blueprint")) {
    items.push({
      id: "blueprint",
      label: "Blueprint",
      title: "Blueprint",
      Icon: LayoutTemplate,
      content: ctx.blueprintContent,
    });
  }
  if (visible("ux-ui-guide")) {
    items.push({
      id: "ux-ui-guide",
      label: "Design System",
      title: "Design System (DESIGN.md)",
      Icon: Palette,
      content: ctx.uxUiGuideContent,
    });
  }
  if (visible("aem")) {
    items.push({
      id: "aem",
      label: "AEM",
      title: "AEM",
      Icon: FileText,
      content: ctx.aemContent,
    });
  }
  if (visible("integration")) {
    items.push({
      id: "integration",
      label: "Integración",
      title: "Handoff NEW ↔ LEGACY y trazabilidad",
      Icon: Link2,
      content: "integration-panel",
    });
  }
  if (visible("api-contracts")) {
    items.push({
      id: "api-contracts",
      label: "API",
      title: "Contratos de API",
      Icon: FileCode,
      content: ctx.apiContractsContent,
    });
  }
  if (visible("logic-flows")) {
    items.push({
      id: "logic-flows",
      label: "Flujos",
      title: "Flujos lógicos",
      Icon: GitBranch,
      content: ctx.logicFlowsContent,
    });
  }
  const agentGovBeforeTasks = ctx.effectiveComplexityForTabs !== "LOW";
  if (visible("agent-governance") && agentGovBeforeTasks) {
    items.push(agentGovernanceNavItem(ctx));
  }
  if (visible("tasks")) {
    items.push({
      id: "tasks",
      label: "Tasks",
      title: "Tasks (breakdown desde MDD + Blueprint)",
      Icon: ListTodo,
      content: ctx.tasksContent,
    });
  }
  if (visible("agent-governance") && !agentGovBeforeTasks) {
    items.push(agentGovernanceNavItem(ctx));
  }
  if (!ctx.isLegacyProject && visible("adrs")) {
    items.push({
      id: "adrs",
      label: "ADRs",
      title: "ADRs: Decisiones Arquitectónicas Guardadas en Memoria",
      Icon: Brain,
      content: ctx.adrs,
    });
  }
  if (visible("infra")) {
    items.push({
      id: "infra",
      label: "Infra",
      title: "Infraestructura",
      Icon: Server,
      content: ctx.infraContent,
    });
  }

  return items;
}

export interface WorkshopDocPanelHeaderMeta {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
}

/**
 * Full document title + icon for the workshop document column header (desktop).
 */
export function getWorkshopDocPanelHeader(
  panel: string,
  opts?: { benchmarkPhaseTab?: "fase0" | "benchmark" },
): WorkshopDocPanelHeaderMeta {
  if (panel === "benchmark") {
    if (opts?.benchmarkPhaseTab === "benchmark") {
      return {
        title: "Benchmark & Deep Research",
        subtitle: "Paso 0 — investigación y gap analysis",
        Icon: Target,
      };
    }
    return {
      title: "Domain Benchmark & Gap Analysis",
      subtitle: "Paso 0 — Fase 0 (DBGA)",
      Icon: Target,
    };
  }

  const byPanel: Record<string, WorkshopDocPanelHeaderMeta> = {
    legacy: {
      title: "Modificación",
      subtitle: "AriadneSpecs → Master Design Document → entregables",
      Icon: Edit3,
    },
    "mdd-inicial": {
      title: "Initial Master Design Document",
      subtitle: "Documentación AS-IS del codebase (partida)",
      Icon: FileText,
    },
    brd: {
      title: "Business Requirements Document",
      subtitle: "Requisitos de negocio por etapa",
      Icon: ClipboardList,
    },
    mdd: {
      title: "Master Design Document",
      subtitle: "Constitución del proyecto (7 secciones)",
      Icon: FileText,
    },
    spec: {
      title: "Project Specification",
      subtitle: "Alcance funcional y técnico (qué y por qué)",
      Icon: ListOrdered,
    },
    architecture: {
      title: "Software Architecture",
      subtitle: "Componentes, límites y decisiones estructurales",
      Icon: GitBranch,
    },
    "use-cases": {
      title: "Use Cases",
      subtitle: "Flujos frente al Master Design Document",
      Icon: ListOrdered,
    },
    "user-stories": {
      title: "User Stories",
      subtitle: "Historias priorizables para entrega",
      Icon: Package,
    },
    blueprint: {
      title: "Technical Blueprint",
      subtitle: "Modelo de datos y servicios alineados al MDD",
      Icon: LayoutTemplate,
    },
    "ux-ui-guide": {
      title: "Design System",
      subtitle: "Guía UX/UI y tokens (DESIGN.md)",
      Icon: Palette,
    },
    aem: {
      title: "Análisis y Estrategia de Mercado",
      subtitle: "Contexto de negocio y mercado (opcional)",
      Icon: FileText,
    },
    "api-contracts": {
      title: "API Contracts",
      subtitle: "Contratos de interfaz entre servicios",
      Icon: FileCode,
    },
    "logic-flows": {
      title: "Logic Flows",
      subtitle: "Flujos de negocio y sistema",
      Icon: GitBranch,
    },
    tasks: {
      title: "Task Breakdown",
      subtitle: "Desglose ejecutable desde MDD y Blueprint",
      Icon: ListTodo,
    },
    "agent-governance": {
      title: "Gobernanza de agentes IA",
      subtitle: "AGENTS.md, .cursor/rules, skills y workflows derivados del MDD",
      Icon: Bot,
    },
    infra: {
      title: "Infrastructure",
      subtitle: "Despliegue y operación",
      Icon: Server,
    },
    adrs: {
      title: "Architecture Decision Records",
      subtitle: "Decisiones arquitectónicas guardadas",
      Icon: Brain,
    },
    integration: {
      title: "Integración Legacy ↔ Nuevo",
      subtitle: "Handoff, enlace de proyectos y matriz NEW-LEG ↔ LEG",
      Icon: Link2,
    },
  };

  return (
    byPanel[panel] ?? {
      title: panel,
      Icon: FileText,
    }
  );
}
