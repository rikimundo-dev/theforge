import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "./ui";
import { getStoredUser } from "@/utils/apiClient";
import type { ProviderInstanceSummary, UserAISettings } from "@/types/user-providers";
import {
  deleteProviderInstance,
  fetchAllProviderInstances,
  fetchEnabledProviderInstances,
  updateProviderInstance,
} from "@/lib/provider-instances-api";
import { fetchUserAISettings, updateUserAISettings } from "@/lib/user-providers-api";
import { ProviderInstanceModal } from "./ProviderInstanceModal";
import {
  ProviderInstanceCardDesktop,
  ProviderInstanceCardMobile,
} from "./ProviderInstanceCard";

function canManageInstances(role: string | undefined) {
  return role === "admin" || role === "super_admin";
}

export function ProviderInstancesCard() {
  const user = getStoredUser();
  const role = user?.role;
  const isSuperAdmin = role === "super_admin";
  const isDeveloper = role === "developer";
  const canManage = canManageInstances(role);

  const [instances, setInstances] = useState<ProviderInstanceSummary[]>([]);
  const [userSettings, setUserSettings] = useState<UserAISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderInstanceSummary | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const activeInstanceId = userSettings?.activeTenantInstanceId ?? null;

  const sortedInstances = useMemo(() => {
    if (!activeInstanceId) return instances;
    return [...instances].sort((a, b) => {
      if (a.id === activeInstanceId) return -1;
      if (b.id === activeInstanceId) return 1;
      return 0;
    });
  }, [instances, activeInstanceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const settingsPromise = fetchUserAISettings();
      const fetchInstances = canManage
        ? fetchAllProviderInstances
        : fetchEnabledProviderInstances;
      const [list, settings] = await Promise.all([fetchInstances(), settingsPromise]);
      setInstances(list);
      setUserSettings(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar instancias");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggleVisibleForTeam(inst: ProviderInstanceSummary) {
    if (!isSuperAdmin) return;
    const next = !inst.enabledForUsers;
    setTogglingId(inst.id);
    setError("");
    setInstances((prev) =>
      prev.map((i) => (i.id === inst.id ? { ...i, enabledForUsers: next } : i)),
    );
    try {
      const updated = await updateProviderInstance(inst.id, {
        providerType: inst.providerType,
        slug: inst.slug,
        displayName: inst.displayName,
        chatModel: inst.chatModel,
        chatModelFallbacks: inst.chatModelFallbacks,
        auditorChatModel: inst.auditorChatModel,
        embeddingModel: inst.embeddingModel,
        embeddingDimension: inst.embeddingDimension,
        sttModel: inst.sttModel,
        visionModel: inst.visionModel,
        baseUrl: inst.baseUrl,
        extras: inst.extras ?? null,
        enabledForUsers: next,
        isTenantDefault: next ? inst.isTenantDefault : false,
      });
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? updated : i)));
    } catch (e) {
      setInstances((prev) =>
        prev.map((i) => (i.id === inst.id ? { ...i, enabledForUsers: !next } : i)),
      );
      setError(e instanceof Error ? e.message : "No se pudieron actualizar la visibilidad");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleSetActive(inst: ProviderInstanceSummary) {
    setActivatingId(inst.id);
    setError("");
    try {
      const settings = await updateUserAISettings({ activeTenantInstanceId: inst.id });
      setUserSettings(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como activa");
    } finally {
      setActivatingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar esta instancia de proveedor?")) return;
    try {
      await deleteProviderInstance(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  const description = canManage
    ? isSuperAdmin
      ? "Crea proveedores para el equipo o personales. Activa el que quieras usar en el taller."
      : "Instancias del equipo y las tuyas. Marca una como activa para el taller."
    : isDeveloper
      ? "Usas el proveedor predeterminado del equipo configurado por el super_admin."
      : "Elige la instancia activa para el taller.";

  function canMutateInstance(inst: ProviderInstanceSummary) {
    if (!canManage) return false;
    if (isSuperAdmin) return true;
    return inst.createdByUserId === user?.id;
  }

  function openCreateModal() {
    setEditing(null);
    setModalOpen(true);
  }

  return (
    <>
      <section className="space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-3 max-sm:gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
              Instancias de proveedor
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
              {description}
            </p>
          </div>
          {canManage ? (
            <Button
              type="button"
              className="h-11 w-full shrink-0 gap-2 rounded-xl shadow-sm max-sm:rounded-2xl sm:w-auto sm:px-4"
              disabled={loading}
              onClick={openCreateModal}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar instancia
            </Button>
          ) : null}
        </div>

        {canManage ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full justify-center gap-2 rounded-2xl border-dashed bg-[color-mix(in_oklch,var(--muted)_25%,var(--card))] sm:hidden"
            disabled={loading}
            onClick={openCreateModal}
          >
            <Plus className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
            Agregar instancia
          </Button>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--foreground-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando instancias…
          </div>
        ) : sortedInstances.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_20%,var(--card))] px-6 py-10 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">
              {canManage
                ? "No hay instancias. Agrega la primera con el botón de arriba."
                : "No hay instancias disponibles. Pide a un administrador que configure una."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {sortedInstances.map((inst) => {
              const isActive = activeInstanceId === inst.id;
              const cardProps = {
                inst,
                isActive,
                isDeveloper,
                isSuperAdmin,
                canManage,
                canMutate: canMutateInstance(inst),
                togglingId,
                activatingId,
                onToggleVisibleForTeam: () => void handleToggleVisibleForTeam(inst),
                onSetActive: () => void handleSetActive(inst),
                onEdit: () => {
                  setEditing(inst);
                  setModalOpen(true);
                },
                onDelete: () => void handleDelete(inst.id),
              };
              return (
                <li key={inst.id} className="min-w-0">
                  <ProviderInstanceCardMobile {...cardProps} />
                  <ProviderInstanceCardDesktop {...cardProps} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage ? (
        <ProviderInstanceModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          editing={editing}
          existingInstances={instances}
          isSuperAdmin={isSuperAdmin}
          activeInstanceId={activeInstanceId}
          userSettings={userSettings}
          onSaved={() => void load()}
        />
      ) : null}
    </>
  );
}
