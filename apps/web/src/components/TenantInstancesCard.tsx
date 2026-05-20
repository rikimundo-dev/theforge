import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "./ui";
import { cn } from "@/lib/utils";
import { getProviderIcon } from "@/constants/provider-icons";
import type { ProviderInstanceSummary } from "@/types/user-providers";
import { fetchEnabledProviderInstances } from "@/lib/provider-instances-api";
import { fetchUserAISettings, updateUserAISettings } from "@/lib/user-providers-api";

interface TenantInstancesCardProps {
  /** En Ajustes de super_admin: vista previa de lo que ve el equipo. */
  superAdminPreview?: boolean;
}

export function TenantInstancesCard({ superAdminPreview = false }: TenantInstancesCardProps) {
  const [instances, setInstances] = useState<ProviderInstanceSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, settings] = await Promise.all([
        fetchEnabledProviderInstances(),
        fetchUserAISettings(),
      ]);
      setInstances(list);
      setActiveId(settings.activeTenantInstanceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar instancias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectInstance(id: string | null) {
    setSaving(true);
    setError("");
    try {
      await updateUserAISettings({ activeTenantInstanceId: id });
      setActiveId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la selección");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-[var(--foreground-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proveedores del equipo…
        </CardContent>
      </Card>
    );
  }

  if (instances.length === 0) {
    if (superAdminPreview) {
      return (
        <Card className="border-dashed">
          <CardContent className="py-6 text-sm text-[var(--foreground-muted)]">
            Aún no hay instancias visibles para el equipo. Crea una arriba y activa{" "}
            <strong className="text-[var(--foreground)]">Visible para el equipo</strong>.
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {superAdminPreview ? "Vista del equipo (selector)" : "Proveedor del equipo"}
        </CardTitle>
        <CardDescription>
          {superAdminPreview
            ? "Así verán tus usuarios las instancias que marcaste como visibles. Puedes probar la selección aquí."
            : "Instancias configuradas por el administrador. Si no eliges ninguna, se usa la instancia predeterminada del tenant cuando exista."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
        <ul className="space-y-2">
          {instances.map((inst) => {
            const Icon = getProviderIcon(inst.providerType);
            const selected = activeId === inst.id;
            return (
              <li key={inst.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void selectInstance(selected ? null : inst.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary)]/10"
                      : "border-[var(--border)] hover:bg-[var(--muted)]/40",
                  )}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--foreground)]">
                        {inst.displayName}
                      </span>
                      {inst.isTenantDefault ? (
                        <Badge variant="secondary" className="text-xs">
                          Predeterminada
                        </Badge>
                      ) : null}
                      {selected ? (
                        <Check className="h-4 w-4 text-[var(--primary)]" aria-hidden />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                      {inst.providerType} · {inst.chatModel}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
