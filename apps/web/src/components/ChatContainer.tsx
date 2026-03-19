import { useRef, useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquare, Send, Loader2, Trash2, Target, Check, Play, Pencil, X, RefreshCw } from "lucide-react";
import { useInterview } from "../hooks/useInterview";
import { useWorkshopStore } from "../store/workshopStore";
import { Button, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui";

export type ActiveTab =
  | "benchmark"
  | "spec"
  | "mdd"
  | "ux-ui-guide"
  | "blueprint"
  | "tasks"
  | "api-contracts"
  | "logic-flows"
  | "architecture"
  | "use-cases"
  | "user-stories"
  | "user-stories"
  | "infra"
  | "adrs";

const ACTIVE_TAB_LABELS: Record<ActiveTab, string> = {
  benchmark: "Benchmark & Gap Analysis (Paso 0, opcional)",
  spec: "Spec",
  mdd: "MDD",
  "ux-ui-guide": "Guía UX/UI",
  blueprint: "Blueprint",
  tasks: "Tasks",
  "api-contracts": "Contratos de API",
  "logic-flows": "Flujos de lógica",
  architecture: "Arquitectura",
  "use-cases": "Casos de Uso",
  "user-stories": "Historias de Usuario",
  infra: "Infraestructura",
  adrs: "Decisiones Arquitectónicas (ADRs)",
};

/** Comandos / para regenerar secciones del MDD (solo tab MDD). §1 = solo agente sintetizador de contexto desde §2–§7. */
const MDD_SECTION_COMMANDS: { slug: string; label: string; section: number }[] = [
  { slug: "contexto", label: "1. Contexto", section: 1 },
  { slug: "arquitectura", label: "2. Arquitectura y Stack", section: 2 },
  { slug: "modelo-datos", label: "3. Modelo de Datos", section: 3 },
  { slug: "contratos-api", label: "4. Contratos de API", section: 4 },
  { slug: "logica", label: "5. Lógica y Edge Cases", section: 5 },
  { slug: "seguridad", label: "6. Seguridad", section: 6 },
  { slug: "infraestructura", label: "7. Infraestructura", section: 7 },
];

function getRegenerateSectionFromSlashCommand(msg: string): number | null {
  const t = msg.trim().toLowerCase();
  if (!t.startsWith("/") || t.includes(" ")) return null;
  const slug = t.slice(1);
  if (!slug) return null;
  const cmd = MDD_SECTION_COMMANDS.find(
    (c) => c.slug === slug || String(c.section) === slug,
  );
  return cmd?.section ?? null;
}

/** Etiquetas legibles por nodo del plan MDD (para aprobación). */
const PLAN_NODE_LABELS: Record<string, string> = {
  clarifier: "Clarificador (alcance)",
  merge_section1_only: "Fusionar §1",
  software_architect: "Arquitecto de Software",
  format_after_architect: "Formatear documento",
  security: "Seguridad",
  integration: "Integración",
  format_after_redactor: "Formatear final",
  diagram_injector: "Diagramas Mermaid",
  auditor: "Auditor",
};

type PlanStep = { step_id: string; task_description: string; node: string; goal?: string };

function PlanApprovalCard({
  planMessage,
  plan,
  loading,
  onExecute,
  onModify,
}: {
  planMessage: string;
  plan: PlanStep[];
  loading: boolean;
  onExecute: () => void;
  onModify: () => void;
}) {
  return (
    <div className="mx-4 mb-2 p-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 flex flex-col shrink-0">
      <div className="text-sm text-[var(--foreground)]/90 mb-3 shrink-0 prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0">
        <ReactMarkdown>{planMessage}</ReactMarkdown>
      </div>
      <p className="text-xs text-[var(--foreground-muted)] mb-1.5 font-medium shrink-0">Tareas y responsables:</p>
      <div className="mb-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
              <th className="py-1.5 pr-2 w-8">#</th>
              <th className="py-1.5 pr-2">Tarea</th>
              <th className="py-1.5">Responsable</th>
            </tr>
          </thead>
          <tbody className="text-[var(--foreground)]">
            {plan.map((step, i) => (
              <tr key={i} className="border-b border-[var(--border)]/50">
                <td className="py-1.5 pr-2 font-medium text-[var(--foreground-muted)]">{step.step_id}</td>
                <td className="py-1.5 pr-2">
                  <span>{step.task_description}</span>
                  {step.goal && (
                    <p className="text-xs text-[var(--foreground-subtle)] mt-0.5 font-normal">{step.goal}</p>
                  )}
                </td>
                <td className="py-1.5">
                  <span className="text-[var(--primary)]">
                    {PLAN_NODE_LABELS[step.node] ?? step.node}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={onExecute} disabled={loading}>
          <Play className="w-3.5 h-3.5" />
          Ejecutar
        </Button>
        <Button variant="secondary" size="sm" onClick={onModify} disabled={loading}>
          <Pencil className="w-3.5 h-3.5" />
          Modificar
        </Button>
      </div>
    </div>
  );
}

interface ChatContainerProps {
  projectId: string | null;
  activeTab?: ActiveTab;
  /** Sin panel lateral: solo mensajes + input (ej. Paso 0 como ventana de chat) */
  embedded?: boolean;
  /** En Paso 0: si no hay benchmark, el CTA es "Generar Benchmark"; si hay, es enviar mensaje */
  benchmarkMode?: {
    hasBenchmark: boolean;
    onGenerateBenchmark: (idea: string) => void;
  };
  /** Re-inferir complejidad (HITL) y abrir entrevista; típico en proyectos existentes */
  onRevaluate?: () => void | Promise<void>;
  /** Evita doble clic mientras corre re-valoración + primer mensaje */
  revaluateBusy?: boolean;
}

export default function ChatContainer({
  projectId,
  activeTab = "mdd",
  embedded = false,
  benchmarkMode,
  onRevaluate,
  revaluateBusy = false,
}: ChatContainerProps) {
  const { messages, loading, error, sendMessage } = useInterview(projectId, activeTab);
  const contextLabel = ACTIVE_TAB_LABELS[activeTab];
  const clearChat = useWorkshopStore((s) => s.clearChat);
  const workshopStages = useWorkshopStore((s) => s.project?.stages ?? []);
  const activeStageIdForChat = useWorkshopStore((s) => s.activeStageId);
  const evaluatorCritique = useWorkshopStore((s) => s.evaluatorCritique);
  const clearEvaluatorCritique = useWorkshopStore((s) => s.clearEvaluatorCritique);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);
  const agentProgress = useWorkshopStore((s) => s.agentProgress);
  const pendingPlanApproval = useWorkshopStore((s) => s.pendingPlanApproval);
  const isBenchmarkStreaming = activeTab === "benchmark" && loading && loadingReason === "benchmark";
  const isMddStreaming = loading && loadingReason === "mdd";
  const showAgentProgress = isBenchmarkStreaming || isMddStreaming;
  const [inputValue, setInputValue] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const prevStageForBannerRef = useRef<string | null>(null);
  const [stageSwitchBannerOpen, setStageSwitchBannerOpen] = useState(false);
  const multiStageChat = workshopStages.length > 1;

  const stageNameForBadge = useMemo(() => {
    return (stageId: string | undefined) => {
      if (!stageId) return "";
      const st = workshopStages.find((s) => s.id === stageId);
      return st ? String(st.name ?? st.key ?? "").trim() || `§${st.ordinal}` : stageId.slice(0, 8);
    };
  }, [workshopStages]);

  useEffect(() => {
    if (!multiStageChat || !activeStageIdForChat) {
      prevStageForBannerRef.current = activeStageIdForChat ?? null;
      setStageSwitchBannerOpen(false);
      return;
    }
    const prev = prevStageForBannerRef.current;
    if (prev !== null && prev !== activeStageIdForChat) {
      setStageSwitchBannerOpen(true);
    }
    prevStageForBannerRef.current = activeStageIdForChat;
  }, [activeStageIdForChat, multiStageChat]);

  /** Auto-resize textarea hasta máx. 3 líneas visibles (~5rem), luego scroll */
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`; // 80px ≈ 3 líneas + padding
  }, [inputValue]);

  const isBenchmarkFirstAction =
    activeTab === "benchmark" && benchmarkMode && !benchmarkMode.hasBenchmark;

  /** En Paso 0: "sin contenido" = sin mensajes del usuario; si solo hay burbujas del asistente, mostramos el texto instructivo. */
  const benchmarkEmpty =
    activeTab === "benchmark" &&
    (messages.length === 0 || messages.every((m) => m.role === "assistant"));
  const messagesToShow =
    benchmarkEmpty && messages.length > 0 ? [] : messages;

  useEffect(() => {
    const t = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }, 100);
    return () => clearTimeout(t);
  }, [
    messagesToShow.length,
    agentProgress.length,
    loading,
    messagesToShow[messagesToShow.length - 1]?.content,
    evaluatorCritique,
  ]);

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;
    const msg = inputValue.trim();
    if (activeTab === "mdd" && msg === "/") {
      setInputValue("");
      return;
    }
    const section = activeTab === "mdd" ? getRegenerateSectionFromSlashCommand(msg) : null;
    setInputValue("");
    if (section != null) {
      await sendMessage(msg, { regenerateSection: section });
    } else {
      await sendMessage(msg);
    }
  };

  const slashFilter = inputValue.startsWith("/") ? inputValue.slice(1).toLowerCase() : "";
  const filteredSlashCommands = slashFilter
    ? MDD_SECTION_COMMANDS.filter((c) => c.slug.startsWith(slashFilter) || String(c.section).startsWith(slashFilter))
    : MDD_SECTION_COMMANDS;
  const showSlashCommands =
    activeTab === "mdd" &&
    (inputValue === "/" ||
      (inputValue.startsWith("/") && !inputValue.includes(" ") && filteredSlashCommands.length > 0));

  const handleGenerateBenchmark = () => {
    if (!inputValue.trim() || loading || !benchmarkMode) return;
    const idea = inputValue.trim();
    setInputValue("");
    benchmarkMode.onGenerateBenchmark(idea);
  };

  const handleClearChat = async () => {
    if (!projectId) return;
    setShowClearConfirm(false);
    await clearChat(projectId, activeTab);
  };

  const handlePlanExecute = () => {
    sendMessage("sí");
  };

  const handlePlanModify = () => {
    chatInputRef.current?.focus();
  };

  const showCenteredEmpty = embedded && (activeTab === "benchmark" ? benchmarkEmpty : messages.length === 0) && !loading;

  return (
    <div className="flex flex-col h-full min-h-0">
      {showCenteredEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 p-6">
          <Target className="w-14 h-14 text-amber-500/80 shrink-0 mb-4" />
          <p className="text-center text-lg text-zinc-200 mb-6 max-w-xl">
            ¿Qué quieres construir y cuál es tu referencia (ej. industria o producto similar)?
          </p>
          <div className="w-full max-w-2xl flex flex-col gap-3">
            <textarea
              ref={chatInputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (isBenchmarkFirstAction) handleGenerateBenchmark();
                else handleSend();
              }}
              placeholder={
                isBenchmarkFirstAction
                  ? "Describe tu idea; si incluyes URLs (ej. https://auth0.com/docs) se usarán como referencias para el benchmark..."
                  : "Describe tu idea o pega un enlace de referencia..."
              }
              rows={1}
              className="w-full min-h-[2.5rem] max-h-[5rem] overflow-y-auto resize-none bg-zinc-800/50 border border-zinc-600 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none break-words"
              spellCheck={false}
              disabled={loading}
            />
            {isBenchmarkFirstAction ? (
              <button
                onClick={handleGenerateBenchmark}
                disabled={loading || !inputValue.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title="Generar Benchmark & Gap Analysis"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Generar Benchmark & Gap Analysis
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={loading || !inputValue.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title="Enviar"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 py-2 border-b border-zinc-700 flex items-center justify-between gap-2 text-zinc-400 text-sm">
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {embedded ? "Chat (Paso 0)" : "Conversación"}
              {contextLabel && !embedded && (
                <span className="text-zinc-500 text-xs">· {contextLabel}</span>
              )}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {onRevaluate && projectId ? (
                <button
                  type="button"
                  onClick={() => void onRevaluate()}
                  disabled={loading || revaluateBusy}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-300 hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:pointer-events-none"
                  title="Producto nuevo (Paso 0) o legacy (MDD): re-infiere complejidad desde tus documentos y abre la entrevista HITL"
                >
                  {revaluateBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 shrink-0" />
                  )}
                  Re-Valorar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={loading || messages.length === 0}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:pointer-events-none"
                title="Borrar historial (el MDD se mantiene)"
              >
                <Trash2 className="w-4 h-4" />
                Borrar historial
              </button>
            </div>
          </div>
          {multiStageChat && stageSwitchBannerOpen && (
            <div
              className="shrink-0 mx-3 mt-2 mb-1 px-3 py-2 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-100/95 text-xs leading-snug flex gap-2 items-start"
              role="status"
            >
              <span className="flex-1">
                <strong className="text-amber-200">Historial global:</strong> el chat no se filtra por etapa.
                Los mensajes anteriores pueden referirse a otra línea de trabajo. El foco del MDD y el semáforo
                sí corresponden a la etapa seleccionada arriba.
              </span>
              <button
                type="button"
                onClick={() => setStageSwitchBannerOpen(false)}
                className="shrink-0 px-2 py-0.5 rounded bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 text-[11px]"
              >
                Cerrar
              </button>
            </div>
          )}
          <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Borrar historial</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Borrar historial de la conversación? El contenido del MDD no se modifica y podrás iniciar de nuevo con un mensaje de bienvenida.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setShowClearConfirm(false)}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleClearChat} disabled={loading} className="bg-[var(--destructive)] hover:bg-[var(--destructive)]/90">
                  Borrar historial
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {messagesToShow.length ? (
              messagesToShow.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user"
                      ? "bg-amber-500/20 text-amber-100"
                      : "bg-zinc-800 text-zinc-200 border border-zinc-600"
                      }`}
                  >
                    {msg.stageId ? (
                      <span
                        className="block text-[10px] font-medium uppercase tracking-wide text-amber-400/85 mb-1"
                      >
                        Etapa: {stageNameForBadge(msg.stageId)}
                      </span>
                    ) : null}
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-table:text-zinc-300 prose-th:border-zinc-600 prose-td:border-zinc-600">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))
            ) : loading && !showAgentProgress ? (
              <p className="text-zinc-500 text-sm text-center py-8">
                Cargando mensaje de bienvenida…
              </p>
            ) : !loading && !showAgentProgress ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-zinc-500 text-sm">
                  {activeTab === "benchmark"
                    ? "Describe tu idea en el cuadro de abajo y envíala; los agentes generarán el Benchmark & Gap Analysis."
                    : activeTab === "mdd"
                      ? "Escribe aquí: pide generar el MDD con agentes, que revise el documento, o haz preguntas. El gerente decidirá quién responde."
                      : `Escribe un mensaje para continuar. La IA adaptará su respuesta al documento activo (${contextLabel}).`}
                </p>
              </div>
            ) : null}

            {evaluatorCritique ? (
              <div className="rounded-lg border border-violet-800/50 bg-violet-950/30 px-3 py-2 text-xs text-zinc-200 leading-relaxed">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-violet-200">Crítica del evaluador</span>
                  <button
                    type="button"
                    onClick={() => clearEvaluatorCritique()}
                    className="shrink-0 text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
                    aria-label="Cerrar crítica"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-zinc-300">{evaluatorCritique}</p>
              </div>
            ) : null}

            {showAgentProgress && (
              <div className="space-y-1.5 pb-2 border-b border-zinc-700/50">
                <p className="text-xs text-zinc-500 font-medium">
                  {agentProgress.length > 0 ? "Agentes trabajando:" : "Flujo MDD en curso…"}
                </p>
                {agentProgress.length > 0 ? (
                  <>
                    {agentProgress.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-medium text-zinc-400">{p.agent}</span>
                        <span className="text-zinc-500">— {p.message}</span>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                        <span className="font-medium text-amber-400/90">Siguiente paso…</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                    <span>Manager o agentes procesando…</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === "mdd" && pendingPlanApproval && pendingPlanApproval.plan.length > 0 && (
              <PlanApprovalCard
                planMessage={pendingPlanApproval.planMessage}
                plan={pendingPlanApproval.plan}
                loading={loading}
                onExecute={handlePlanExecute}
                onModify={handlePlanModify}
              />
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 bg-zinc-800 border border-zinc-600">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {error && (
            <p className="px-4 pb-2 text-sm text-red-400">{error}</p>
          )}
          {showSlashCommands && (
            <div className="px-4 pt-2 border-t border-zinc-700/50 bg-zinc-800/30">
              <p className="text-xs text-zinc-500 mb-2">Regenerar sección del MDD (solo esta sección se reescribirá):</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredSlashCommands.map((cmd) => (
                  <button
                    key={cmd.section}
                    type="button"
                    onClick={() => {
                      setInputValue("");
                      sendMessage(`/${cmd.slug}`, { regenerateSection: cmd.section });
                    }}
                    className="px-2.5 py-1.5 rounded-md text-sm bg-zinc-700 hover:bg-amber-500/20 text-zinc-200 hover:text-amber-200 border border-zinc-600 hover:border-amber-500/40"
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="p-4 border-t border-zinc-700 flex gap-2 shrink-0 items-end">
            <textarea
              ref={chatInputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (isBenchmarkFirstAction) handleGenerateBenchmark();
                else handleSend();
              }}
              placeholder={
                isBenchmarkFirstAction
                  ? "Ej: Quiero un sistema de login con SSO tipo Auth0, 2FA y auditoría de sesiones..."
                  : activeTab === "mdd"
                    ? "Escribe aquí o / para ver comandos de regenerar sección..."
                    : `Tu respuesta (contexto: ${contextLabel})...`
              }
              rows={1}
              className="flex-1 min-h-[2.5rem] max-h-[5rem] overflow-y-auto resize-none bg-[var(--input)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent outline-none break-words min-w-0"
              spellCheck={false}
              disabled={loading}
            />
            {isBenchmarkFirstAction ? (
              <Button
                variant="outline"
                size="icon"
                onClick={handleGenerateBenchmark}
                disabled={loading || !inputValue.trim()}
                loading={loading}
                title="Generar Benchmark & Gap Analysis"
              >
                <Send className="w-4 h-4 shrink-0" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={loading || !inputValue.trim()}
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
