/**
 * Phase0InterviewPanel — Entrevistador interactivo de Fase 0.
 *
 * Pipeline:
 *   1. Usuario ingresa idea o pega documento → click "Iniciar Fase 0"
 *   2. Backend devuelve borrador inicial + threadId
 *   3. Panel muestra pregunta del entrevistador (1 a la vez)
 *   4. Usuario responde → borrador se actualiza en vivo
 *   5. Tras 5 preguntas o sin gaps críticos → Fase 0 completa
 */

import { useCallback, useRef, useState } from "react";
import {
  Loader2, Send, Check, AlertTriangle,
  ChevronDown, ChevronUp, MessageSquare,
} from "lucide-react";
import { apiFetch, API_BASE } from "../utils/apiClient";
import { WorkshopPanelActionRegion, WorkshopPanelButton, WorkshopButtonIcon } from "./WorkshopButtons";

type Phase0Status = "idle" | "starting" | "interviewing" | "done" | "error";

interface Props {
  projectId: string;
  onComplete: () => void;
}

export function Phase0InterviewPanel({ projectId, onComplete }: Props) {
  const [status, setStatus] = useState<Phase0Status>("idle");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [preguntaN, setPreguntaN] = useState(0);
  const [totalPreguntas] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [ideaInput, setIdeaInput] = useState("");
  const [borradorVisible, setBorradorVisible] = useState(false);
  const [borrador, setBorrador] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** Iniciar Fase 0: enviar idea al backend */
  const handleStart = useCallback(async () => {
    if (!ideaInput.trim()) return;
    setStatus("starting");
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/ai-analysis/phase0/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: ideaInput.trim(), projectId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Error al iniciar");
        throw new Error(errText);
      }
      const data = await res.json();
      setThreadId(data.threadId);
      // Si ya no hay preguntas críticas, terminó
      if (data.type === "init") {
        setBorrador(JSON.stringify(data.borrador, null, 2));
        // Obtener la primera pregunta
        await fetchQuestion(data.threadId);
      } else {
        setStatus("done");
        onComplete();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setStatus("error");
    }
  }, [ideaInput, projectId, onComplete]);

  /** Obtener siguiente pregunta */
  const fetchQuestion = useCallback(async (tid: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/ai-analysis/phase0/question/${tid}`);
      if (!res.ok) throw new Error("Error al obtener pregunta");
      const data = await res.json();
      if (data.type === "done") {
        setStatus("done");
        if (data.borrador) setBorrador(JSON.stringify(data.borrador, null, 2));
        onComplete();
        return;
      }
      setQuestion(data.question);
      setPreguntaN(data.n);
      setStatus("interviewing");
      setAnswer("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al obtener pregunta");
      setStatus("error");
    }
  }, [onComplete]);

  /** Enviar respuesta */
  const handleAnswer = useCallback(async () => {
    if (!answer.trim() || !threadId) return;
    const currentAnswer = answer.trim();
    setAnswer("");

    try {
      const res = await apiFetch(`${API_BASE}/ai-analysis/phase0/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, answer: currentAnswer }),
      });
      if (!res.ok) throw new Error("Error al enviar respuesta");
      const data = await res.json();

      if (data.type === "done") {
        setStatus("done");
        if (data.borrador) setBorrador(JSON.stringify(data.borrador, null, 2));
        onComplete();
        return;
      }

      // Actualizar borrador
      if (data.borrador) setBorrador(JSON.stringify(data.borrador, null, 2));

      // Siguiente pregunta
      await fetchQuestion(threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar respuesta");
      setStatus("error");
    }
  }, [answer, threadId, fetchQuestion]);

  /** Manejar Enter para enviar */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (status === "interviewing") handleAnswer();
      else if (status === "idle") handleStart();
    }
  };

  /** Resetear */
  const handleReset = () => {
    setStatus("idle");
    setThreadId(null);
    setQuestion("");
    setAnswer("");
    setPreguntaN(0);
    setError(null);
    setBorrador("");
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Estado inicial: input de idea */}
      {status === "idle" && (
        <>
          <WorkshopPanelActionRegion role="region" aria-label="Inicio de Fase 0">
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-[var(--foreground-subtle)]">
                Describe tu idea o pega un documento existente. El entrevistador IA hará preguntas
                para construir una especificación completa antes de pasar al Benchmark y MDD.
              </p>
              <textarea
                ref={inputRef as any}
                value={ideaInput}
                onChange={(e) => setIdeaInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ej: 'Un sistema de gestión de proyectos con roles, facturación y reportes...'"
                className="w-full min-h-[100px] bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <WorkshopPanelButton
                  tone="primary"
                  onClick={handleStart}
                  disabled={!ideaInput.trim()}
                >
                  <WorkshopButtonIcon icon={MessageSquare} tone="primary" />
                  Iniciar Fase 0
                </WorkshopPanelButton>
              </div>
            </div>
          </WorkshopPanelActionRegion>
        </>
      )}

      {/* Cargando */}
      {status === "starting" && (
        <div className="flex items-center gap-2 text-sm text-[var(--foreground-subtle)] py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analizando tu idea y construyendo borrador inicial...</span>
        </div>
      )}

      {/* Modo entrevista */}
      {status === "interviewing" && (
        <>
          {/* Progreso */}
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">
              Pregunta {preguntaN} de {totalPreguntas}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: totalPreguntas }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i < preguntaN
                      ? "bg-[var(--primary)]"
                      : i === preguntaN
                        ? "bg-[var(--primary)] animate-pulse"
                        : "bg-[var(--muted)]"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Pregunta */}
          <div className="bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] border border-[color-mix(in_oklch,var(--primary)_20%,var(--border))] rounded-lg p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">{question}</p>
          </div>

          {/* Input de respuesta */}
          <div className="flex gap-2">
            <textarea
              ref={inputRef as any}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu respuesta (Enter para enviar, Shift+Enter para nueva línea)..."
              className="flex-1 bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <WorkshopPanelButton
              tone="primary"
              onClick={handleAnswer}
              disabled={!answer.trim()}
            >
              <WorkshopButtonIcon icon={Send} tone="primary" />
              Enviar respuesta
            </WorkshopPanelButton>
          </div>
        </>
      )}

      {/* Completado */}
      {status === "done" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-sm font-medium text-[var(--foreground)]">
            ¡Fase 0 completada!
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            El borrador se ha guardado y está listo para el Benchmark y MDD.
          </p>
          <WorkshopPanelButton tone="secondary" onClick={handleReset}>
            Reiniciar Fase 0
          </WorkshopPanelButton>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-red-500">{error || "Error en la entrevista"}</p>
          <WorkshopPanelButton tone="secondary" onClick={handleReset}>
            Reintentar
          </WorkshopPanelButton>
        </div>
      )}

      {/* Borrador visible (toggle) */}
      {borrador && (
        <div className="border-t border-[var(--border)] pt-2">
          <button
            onClick={() => setBorradorVisible(!borradorVisible)}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {borradorVisible ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {borradorVisible ? "Ocultar borrador" : "Ver borrador actual"}
          </button>
          {borradorVisible && (
            <pre className="mt-2 p-3 bg-[color-mix(in_oklch,var(--muted)_30%,var(--card))] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--foreground-subtle)] overflow-auto max-h-[300px] whitespace-pre-wrap">
              {borrador}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
