import { Check } from "lucide-react";
import type { ProviderCatalogEntry, ProviderId } from "@/types/user-providers";
import { ProviderLogo } from "@/components/ProviderLogo";
import { cn } from "@/lib/utils";

interface ProviderTypePickerProps {
  catalog: ProviderCatalogEntry[];
  value: ProviderId;
  disabled?: boolean;
  onChange: (id: ProviderId) => void;
}

/** App-style provider selection grid (replaces native &lt;select&gt;). */
export function ProviderTypePicker({
  catalog,
  value,
  disabled,
  onChange,
}: ProviderTypePickerProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3"
      role="listbox"
      aria-label="Tipo de proveedor"
    >
      {catalog.map((entry) => {
        const selected = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(entry.id)}
            className={cn(
              "flex min-h-[3.25rem] items-center gap-3 border px-3.5 py-3 text-left transition-all",
              "rounded-2xl max-sm:min-h-[3.5rem] sm:rounded-xl sm:py-2.5",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_oklch,var(--foreground-muted)_35%,var(--border))] hover:bg-[color-mix(in_oklch,var(--muted)_30%,var(--card))]",
            )}
          >
            <ProviderLogo provider={entry.id} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                {entry.label}
              </span>
              <span className="block truncate text-[11px] text-[var(--foreground-muted)]">
                {entry.defaultChatModel}
              </span>
            </span>
            {selected ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                <Check className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : (
              <span className="h-6 w-6 shrink-0 rounded-full border border-[var(--border)]" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
