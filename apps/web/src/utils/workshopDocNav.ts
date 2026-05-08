/**
 * Document tabs shown in Workshop (toolbar) and global sidebar when a project is open.
 * Keeps visibility rules in sync with `WorkshopView` / `isTabVisibleForComplexity`.
 */
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  ClipboardList,
  Edit3,
  FileCode,
  FileText,
  GitBranch,
  LayoutTemplate,
  ListOrdered,
  ListTodo,
  Package,
  Palette,
  Server,
  Target,
} from "lucide-react";
import { isTabVisibleForComplexity, type WorkshopDocTab } from "./complexityTabs";

export interface WorkshopDocNavItem {
  id: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  content: unknown;
}

export interface WorkshopDocNavBuildContext {
  isLegacyProject: boolean;
  effectiveComplexityForTabs: "LOW" | "MEDIUM" | "HIGH";
  activeLegacyState: { description?: string; codebaseDoc?: string } | null | undefined;
  phase0SummaryContent: string | null | undefined;
  dbgaContent: string | null | undefined;
  activeWorkshopStage: { brdContent?: string | null; toBeManualContent?: string | null } | null | undefined;
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
  infraContent: string | null | undefined;
  adrs: unknown[] | null | undefined;
}

export function workshopTabDocHasContent(tabId: string, content: unknown): boolean {
  if (tabId === "adrs") return Array.isArray(content) && content.length > 0;
  return !!String(content ?? "").trim();
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
      title: "Benchmark & Gap Analysis (Paso 0, opcional)",
      Icon: Target,
      content: (ctx.phase0SummaryContent || "") + (ctx.dbgaContent || ""),
    });
  }

  if (visible("brd")) {
    items.push({
      id: "brd",
      label: "BRD",
      title: "BRD por etapa; requisitos de negocio",
      Icon: ClipboardList,
      content: ctx.activeWorkshopStage?.brdContent,
    });
  }
  if (visible("to-be")) {
    items.push({
      id: "to-be",
      label: "To-Be",
      title: "Manual To-Be y As-Is por etapa; entrevista en el chat",
      Icon: BookOpen,
      content: ctx.activeWorkshopStage?.toBeManualContent,
    });
  }
  if (visible("mdd")) {
    items.push({
      id: "mdd",
      label: "MDD",
      title: "Constitución del proyecto (gobierna Blueprint, Contratos API e Infra)",
      Icon: FileText,
      content: ctx.mddContent,
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
      label: "Guía UX/UI",
      title: "Guía UX/UI (DESIGN.md)",
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
  if (visible("tasks")) {
    items.push({
      id: "tasks",
      label: "Tasks",
      title: "Tasks (breakdown desde MDD + Blueprint)",
      Icon: ListTodo,
      content: ctx.tasksContent,
    });
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
