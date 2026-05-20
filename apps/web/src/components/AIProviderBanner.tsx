import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchProviderStatus } from "@/lib/user-providers-api";

interface AIProviderBannerProps {
  onOpenSettings?: () => void;
}

/**
 * Aviso en el taller cuando no hay proveedor de IA activo configurado.
 */
export function AIProviderBanner({ onOpenSettings }: AIProviderBannerProps) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const st = await fetchProviderStatus();
        if (!cancelled) setMissing(!st.usable);
      } catch {
        if (!cancelled) setMissing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!missing) return null;

  return (
    <div
      className="shrink-0 border-b border-[color-mix(in_oklch,var(--warning)_42%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_14%,var(--card))] px-3 py-2 sm:px-4"
      role="region"
      aria-label="Proveedor de IA no configurado"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning)]" />
        <span className="text-[var(--foreground)]">
          Configura un proveedor de IA del equipo o tu clave API personal en
          ajustes para usar generación y análisis.
        </span>
        {onOpenSettings ? (
          <button
            type="button"
            className="font-medium text-[var(--primary)] underline-offset-2 hover:underline"
            onClick={onOpenSettings}
          >
            Abrir ajustes
          </button>
        ) : null}
      </div>
    </div>
  );
}
