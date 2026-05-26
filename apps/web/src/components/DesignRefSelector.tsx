/**
 * DesignRefSelector — Selector de Design References para la Guía UX/UI
 *
 * Permite:
 * 1. Elegir manualmente entre 54 design systems reales (agrupados por categoría)
 * 2. Activar "Auto-match" para que el LLM infiera el diseño del MDD
 * 3. Ingresar URL personalizada para escanear (stub)
 *
 * Integrado en el Workshop, antes de generar la Guía UX/UI.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Sparkles, Globe, RefreshCw } from "lucide-react";

export interface DesignRefItem {
  slug: string;
  name: string;
  category: string;
  style: string;
  tags: string[];
  colors?: Record<string, string>;
}

const CATEGORY_LABELS: Record<string, string> = {
  "ai-ml": "AI & Machine Learning",
  "developer-tools": "Developer Tools",
  "infra-cloud": "Infrastructure & Cloud",
  "design-productivity": "Design & Productivity",
  fintech: "Fintech & Crypto",
  "enterprise-consumer": "Enterprise & Consumer",
};

interface DesignRefSelectorProps {
  /** Slug actualmente seleccionado (desde el proyecto) */
  currentRef?: string | null;
  /** Callback cuando cambia la selección */
  onChange: (ref: string | null) => void;
  /** Si está en modo "auto-match" */
  onAutoMatch?: () => void;
}

export function DesignRefSelector({ currentRef, onChange, onAutoMatch }: DesignRefSelectorProps) {
  const [open, setOpen] = useState(false);
  const [designs, setDesigns] = useState<DesignRefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"catalog" | "url">("catalog");
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cargar catálogo
  useEffect(() => {
    fetch("/api/design-refs")
      .then((r) => r.json())
      .then((data: DesignRefItem[]) => setDesigns(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = designs.find((d) => d.slug === currentRef);
  const isAuto = currentRef === "auto";

  const handleSelect = useCallback(
    (slug: string) => {
      onChange(slug);
      setOpen(false);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setOpen(false);
  }, [onChange]);

  const handleAuto = useCallback(() => {
    onChange("auto");
    onAutoMatch?.();
    setOpen(false);
  }, [onChange, onAutoMatch]);

  const handleUrlSubmit = useCallback(() => {
    if (!url.trim()) return;
    setUrlLoading(true);
    fetch("/api/design-refs/scan-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          console.error("URL scan error:", data.error);
        } else {
          onChange(`url:${url.trim()}`);
          setOpen(false);
        }
      })
      .catch((err) => console.error("URL scan failed:", err))
      .finally(() => setUrlLoading(false));
  }, [url, onChange]);

  const grouped = designs.reduce<Record<string, DesignRefItem[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {/* Descripción de la funcionalidad */}
      <p className="text-xs text-zinc-500 leading-relaxed">
        Selecciona un <span className="text-zinc-400">design system de referencia</span> para inspirar la Guía UX/UI.
        El LLM adaptará sus colores, tipografía y estilo al dominio de tu proyecto — no los copiará textualmente.
        Puedes elegir entre 54 sistemas reales (Stripe, Linear, Vercel…), activar <span className="text-indigo-400">auto-match</span>
        para que el LLM infiera el diseño del MDD, o ingresar una URL personalizada.
      </p>
      <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        {isAuto ? (
          <Sparkles className="h-4 w-4 text-indigo-400" />
        ) : selected ? (
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: selected.colors?.primary || "#666" }}
          />
        ) : (
          <Globe className="h-4 w-4 text-zinc-500" />
        )}
        <span className="flex-1 text-left">
          {isAuto ? "Auto-match (automático)" : selected?.name || "Sin referencia de diseño"}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[420px] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {/* Tabs */}
          <div className="flex border-b border-zinc-700">
            <button
              onClick={() => setActiveTab("catalog")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "catalog"
                  ? "border-b-2 border-indigo-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Catálogo
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "url"
                  ? "border-b-2 border-indigo-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              URL personalizada
            </button>
          </div>

          {activeTab === "catalog" && (
            <div className="max-h-[400px] overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-zinc-500">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </div>
              ) : (
                <>
                  {/* Auto-match */}
                  <button
                    onClick={handleAuto}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-800 ${
                      isAuto ? "bg-zinc-800 ring-1 ring-indigo-500" : ""
                    }`}
                  >
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                    <div>
                      <p className="font-medium text-zinc-100">Auto-match</p>
                      <p className="text-xs text-zinc-500">
                        El LLM infiere el diseño del MDD automáticamente
                      </p>
                    </div>
                  </button>

                  <div className="my-2 border-t border-zinc-700" />

                  {/* Sin referencia */}
                  <button
                    onClick={handleClear}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-800 ${
                      !currentRef ? "bg-zinc-800 ring-1 ring-zinc-500" : ""
                    }`}
                  >
                    <div className="flex h-5 w-5 items-center justify-center text-zinc-500">—</div>
                    <div>
                      <p className="font-medium text-zinc-300">Ninguna</p>
                      <p className="text-xs text-zinc-500">El LLM genera el diseño desde cero</p>
                    </div>
                  </button>

                  <div className="my-2 border-t border-zinc-700" />

                  {/* Grupos por categoría */}
                  {Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        {CATEGORY_LABELS[cat] || cat}
                      </p>
                      {items.map((d) => (
                        <button
                          key={d.slug}
                          onClick={() => handleSelect(d.slug)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 ${
                            currentRef === d.slug ? "bg-zinc-800 ring-1 ring-indigo-500" : ""
                          }`}
                        >
                          <span className="h-3 w-3 shrink-0 rounded-full border border-zinc-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-zinc-200">{d.name}</p>
                            <p className="truncate text-xs text-zinc-500">{d.style}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === "url" && (
            <div className="p-4">
              <p className="mb-2 text-xs text-zinc-400">
                Ingresa la URL de un sitio web para extraer sus tokens de diseño (colores, tipografía, CSS variables).
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={urlLoading || !url.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {urlLoading ? "Escaneando..." : "Scan"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                ⚠️ Escaneo por URL disponible próximamente. Por ahora usa el catálogo o auto-match.
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}