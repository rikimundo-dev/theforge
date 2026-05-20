import { Settings } from "lucide-react";
import { ProviderInstancesCard } from "@/components/ProviderInstancesCard";
import { McpSecretCard } from "@/components/McpSecretCard";
import { AriadneConfigCard } from "@/components/AriadneConfigCard";
interface SettingsViewProps {
  showIaCost: boolean;
  onToggleIaCost: () => void;
}

/** Vista de ajustes (proveedores IA, Ariadne, cuenta). Renderizada dentro del layout con sidebar (`App.tsx`). */
export default function SettingsView({ showIaCost, onToggleIaCost }: SettingsViewProps) {
  return (
    <div className="mx-auto w-full max-w-[min(100%,88rem)] space-y-6 px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8 xl:px-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="border-b border-[var(--border)] pb-4 sm:pb-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--primary)] sm:text-3xl">
              <Settings className="h-8 w-8 shrink-0" />
              Ajustes
            </h1>
            <p className="mt-1 text-sm text-[var(--foreground-muted)] sm:text-base">
              Proveedores de IA, Ariadne y cuenta
            </p>
          </div>
        </header>

        <ProviderInstancesCard />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--foreground-subtle)]">
            Cuenta y herramientas
          </h2>
          <McpSecretCard />
          <AriadneConfigCard />
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <span className="text-sm font-medium">Mostrar costo de IA en semáforo</span>
            <button
              type="button"
              role="switch"
              aria-checked={showIaCost}
              onClick={onToggleIaCost}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                showIaCost ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  showIaCost ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </section>
      </div>
    </div>
  );
}
