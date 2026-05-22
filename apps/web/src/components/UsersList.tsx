import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Loader2,
  UserPlus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Search,
  Users,
} from "lucide-react";
import { apiFetch, API_BASE, getStoredUser } from "@/utils/apiClient";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Badge,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  ListRowIconButton,
  ListRowIconTooltipButton,
  ListRowSelect,
  listRowSelectClass,
} from "@/components/ListRowIconButton";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "developer";
  name: string | null;
  hasMcpSecret: boolean;
  createdAt: string;
  allowedChatModels?: string[];
}

interface UsersListPayload {
  users: UserRow[];
}

interface SecretState {
  value: string;
  visible: boolean;
  copied: boolean;
  loading: boolean;
  error: string | null;
}

declare module "react" {
  interface ButtonHTMLAttributes<T> extends React.HTMLAttributes<T> {
    loading?: boolean;
  }
}

const EMPTY_SECRET: SecretState = {
  value: "",
  visible: false,
  copied: false,
  loading: false,
  error: null,
};

type RoleFilter = "all" | UserRow["role"];

function formatRoleLabel(role: UserRow["role"]): string {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "developer":
      return "Developer";
  }
}

function roleBadgeVariant(role: UserRow["role"]): "default" | "warning" | "secondary" {
  switch (role) {
    case "super_admin":
      return "default";
    case "admin":
      return "warning";
    case "developer":
      return "secondary";
  }
}

function getUserInitials(name: string | null, email: string): string {
  const n = name?.trim() ?? "";
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  if (n.length === 1) return (n + (email[0] ?? "?")).slice(0, 2).toUpperCase();
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function canEditUserRole(isSelf: boolean): boolean {
  return !isSelf;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function parseUsersResponse(raw: UserRow[] | UsersListPayload): UserRow[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.users ?? [];
}

export function UsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "admin" | "developer">("developer");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleActionError, setRoleActionError] = useState<string | null>(null);
  const [openSecretFor, setOpenSecretFor] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, SecretState>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [savingModelsFor, setSavingModelsFor] = useState<string | null>(null);
  const [modelsActionError, setModelsActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const me = getStoredUser();
  const myId = me?.id ?? "";
  const isSuperAdmin = me?.role === "super_admin";

  const updateSecret = (userId: string, patch: Partial<SecretState>) => {
    setSecrets((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? EMPTY_SECRET), ...patch },
    }));
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/users`);
      if (r.ok) {
        const raw = (await r.json()) as UserRow[] | UsersListPayload;
        const list = parseUsersResponse(raw);
        setUsers(list);
        if (isSuperAdmin) {
          const modelDraft: Record<string, string> = {};
          for (const u of list) {
            if (u.role === "admin") {
              modelDraft[u.id] = (u.allowedChatModels ?? []).join(", ");
            }
          }
          setModelDrafts(modelDraft);
        }
        return;
      }
      const data = (await r.json().catch(() => ({}))) as { message?: string | string[] };
      const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      if (r.status === 403) {
        setError("No tienes permisos para ver usuarios (se requiere admin o super admin).");
      } else {
        setError(msg ?? `No se pudo cargar la lista de usuarios (HTTP ${r.status}).`);
      }
      setUsers([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar usuarios");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSaveAllowedModels = async (userId: string) => {
    setSavingModelsFor(userId);
    setModelsActionError(null);
    try {
      const r = await apiFetch(`${API_BASE}/users/${userId}/allowed-chat-models`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedChatModels: modelDrafts[userId] ?? "" }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { message?: string | string[] };
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
        throw new Error(msg ?? "No se pudieron guardar los modelos");
      }
      const data = (await r.json()) as {
        allowedChatModels: string[];
      };
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, allowedChatModels: data.allowedChatModels } : u,
        ),
      );
      setModelDrafts((prev) => ({
        ...prev,
        [userId]: data.allowedChatModels.join(", "),
      }));
    } catch (e) {
      setModelsActionError(e instanceof Error ? e.message : "Error al guardar modelos");
    } finally {
      setSavingModelsFor(null);
    }
  };

  const handleRoleChange = async (
    userId: string,
    role: "super_admin" | "admin" | "developer",
  ) => {
    setRoleActionError(null);
    const r = await apiFetch(`${API_BASE}/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (r.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } else {
      const data = (await r.json().catch(() => ({}))) as { message?: string | string[] };
      const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      setRoleActionError(msg ?? "No se pudo cambiar el rol");
    }
  };

  const handleCloseCreateModal = useCallback(() => {
    if (creating) return;
    setShowCreate(false);
    setError(null);
    setNewEmail("");
    setNewName("");
    setNewRole("developer");
  }, [creating]);

  const handleCreateDialogOpenChange = useCallback(
    (open: boolean) => {
      if (creating) return;
      if (open) {
        setShowCreate(true);
        setError(null);
      } else {
        handleCloseCreateModal();
      }
    },
    [creating, handleCloseCreateModal],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          role: newRole,
        }),
      });
      if (r.ok) {
        setShowCreate(false);
        setError(null);
        setNewEmail("");
        setNewName("");
        setNewRole("developer");
        await loadUsers();
      } else {
        const data = await r.json().catch(() => ({}));
        setError((data as { message?: string }).message ?? "Error al crear usuario");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`¿Eliminar usuario ${email}?`)) return;
    setRoleActionError(null);
    const r = await apiFetch(`${API_BASE}/users/${userId}`, { method: "DELETE" });
    if (r.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSecrets((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      if (openSecretFor === userId) setOpenSecretFor(null);
    } else {
      const data = (await r.json().catch(() => ({}))) as { message?: string | string[] };
      const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      setRoleActionError(msg ?? "No se pudo eliminar el usuario");
    }
  };

  const fetchSecret = async (userId: string) => {
    updateSecret(userId, { loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/users/${userId}/mcp-secret`);
      if (!r.ok) throw new Error("No se pudo obtener");
      const data = (await r.json()) as { mcpSecret?: string };
      updateSecret(userId, { value: data.mcpSecret ?? "", loading: false });
    } catch {
      updateSecret(userId, { loading: false, error: "Error al obtener API key" });
    }
  };

  const toggleSecret = async (userId: string) => {
    if (openSecretFor === userId) {
      setOpenSecretFor(null);
      return;
    }
    setOpenSecretFor(userId);
    if (!secrets[userId]?.value) {
      await fetchSecret(userId);
    }
  };

  const handleRegenerate = async (userId: string) => {
    if (!confirm("¿Regenerar API key? La anterior dejará de funcionar inmediatamente.")) return;
    updateSecret(userId, { loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/users/${userId}/mcp-secret/regenerate`, {
        method: "POST",
      });
      if (!r.ok) throw new Error("No se pudo regenerar");
      const data = (await r.json()) as { mcpSecret?: string };
      updateSecret(userId, {
        value: data.mcpSecret ?? "",
        visible: true,
        loading: false,
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, hasMcpSecret: true } : u)));
    } catch {
      updateSecret(userId, { loading: false, error: "Error al regenerar API key" });
    }
  };

  const handleCopy = async (userId: string) => {
    const value = secrets[userId]?.value;
    if (!value) return;
    await copyToClipboard(value);
    updateSecret(userId, { copied: true });
    setTimeout(() => updateSecret(userId, { copied: false }), 2000);
  };

  const roleCounts = useMemo(() => {
    const counts = { all: users.length, super_admin: 0, admin: 0, developer: 0 };
    for (const u of users) counts[u.role] += 1;
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      const hay = `${u.name ?? ""} ${u.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, searchQuery, roleFilter]);

  const roleFilterTabs: { id: RoleFilter; label: string }[] = [
    { id: "all", label: `Todos (${roleCounts.all})` },
    { id: "super_admin", label: `Super admin (${roleCounts.super_admin})` },
    { id: "admin", label: `Admin (${roleCounts.admin})` },
    { id: "developer", label: `Developer (${roleCounts.developer})` },
  ];

  return (
    <TooltipProvider delayDuration={280}>
      <Dialog open={showCreate} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent
          size="md"
          className={cn(
            "gap-0 p-0 sm:max-w-md",
            /* Mobile: bottom sheet */
            "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:max-h-[min(92dvh,640px)] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-b-0 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
            "max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=closed]:slide-out-to-bottom-8",
            "max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0",
            "max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0",
            "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100",
          )}
        >
          <form onSubmit={handleCreate} className="flex max-h-[inherit] flex-col">
            <div
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--border)] sm:hidden"
              aria-hidden
            />
            <DialogHeader className="space-y-1.5 border-b border-[var(--border)] px-4 py-4 text-left sm:px-6 sm:py-5">
              <DialogTitle className="text-left text-base sm:text-lg">Nuevo usuario</DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed sm:text-sm">
                Se creará la cuenta y una API key MCP automática. Podrás verla o regenerarla después.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <label htmlFor="new-user-email" className="text-sm font-medium text-[var(--foreground)]">
                  Email <span className="text-[var(--destructive)]">*</span>
                </label>
                <Input
                  id="new-user-email"
                  placeholder="usuario@empresa.com"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  autoFocus
                  disabled={creating}
                  className="h-11 rounded-xl border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] text-[15px] focus-visible:ring-[var(--ring)]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-user-name" className="text-sm font-medium text-[var(--foreground)]">
                  Nombre
                </label>
                <Input
                  id="new-user-name"
                  placeholder="Opcional"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  className="h-11 rounded-xl border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-user-role" className="text-sm font-medium text-[var(--foreground)]">
                  Rol
                </label>
                <select
                  id="new-user-role"
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as "super_admin" | "admin" | "developer")
                  }
                  disabled={creating}
                  className={cn(
                    listRowSelectClass,
                    "h-11 w-full rounded-xl border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] px-3 text-[15px] text-[var(--foreground)]",
                  )}
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </div>
              {error ? (
                <p className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="shrink-0 flex flex-col gap-2 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:justify-end sm:gap-2 sm:px-6">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                className="h-11 w-full rounded-xl sm:order-1 sm:w-auto"
                onClick={handleCloseCreateModal}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={creating || !newEmail.trim()}
                className="h-11 w-full rounded-xl sm:order-2 sm:w-auto"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Creando…
                  </>
                ) : (
                  "Crear usuario"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="relative flex h-full min-h-0 flex-col">
      {/* —— Mobile app shell (sm:hidden) —— */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)]/70 bg-[color-mix(in_oklch,var(--background)_88%,transparent)] px-4 py-3 backdrop-blur-lg sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--primary)_16%,var(--background))] text-[var(--primary)]">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--foreground)]">
                Usuarios
              </h1>
              <p className="text-xs text-[var(--foreground-muted)]">
                {loading ? "Cargando…" : `${users.length} cuenta${users.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full border-[var(--border)] bg-[var(--card)]"
              disabled={loading}
              aria-label="Actualizar lista"
              onClick={() => void loadUsers()}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-5 w-5" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-full shadow-md"
              aria-label="Nuevo usuario"
              onClick={() => {
                setShowCreate(true);
                setRoleActionError(null);
              }}
            >
              <UserPlus className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <div className="shrink-0 space-y-3 px-4 pb-2 pt-3 sm:hidden">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="h-11 rounded-2xl border-0 bg-[color-mix(in_oklch,var(--muted)_55%,var(--card))] pl-10 text-[15px] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_80%,transparent)]"
            aria-label="Buscar usuarios"
          />
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filtrar por rol"
        >
          {roleFilterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={roleFilter === tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={cn(
                "shrink-0 snap-start rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                roleFilter === tab.id
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                  : "bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] text-[var(--foreground-muted)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* —— Desktop shell (unchanged layout) —— */}
      <header className="hidden shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-4 py-4 sm:block sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
              Administración
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--primary)_14%,var(--background))] text-[var(--primary)]">
                <Shield className="h-5 w-5" aria-hidden />
              </span>
              Usuarios
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-[var(--foreground-muted)]">
              Alta de cuentas, roles y API keys MCP por usuario.
            </p>
          </div>
          <Button
            type="button"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => {
              setShowCreate(true);
              setRoleActionError(null);
            }}
          >
            <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
            Nuevo usuario
          </Button>
        </div>
      </header>

      <div className="hidden shrink-0 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_40%,var(--background))] px-4 py-3 sm:block sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o email…"
              className="h-10 pl-9"
              aria-label="Buscar usuarios"
            />
          </div>
          <Tooltip delayDuration={280}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={loading}
                aria-label="Actualizar lista de usuarios"
                onClick={() => void loadUsers()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
                Actualizar
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" sideOffset={6}>
              Actualizar lista de usuarios
            </TooltipContent>
          </Tooltip>
        </div>
        <div
          className="mx-auto mt-3 flex max-w-5xl gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filtrar por rol"
        >
          {roleFilterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={roleFilter === tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                roleFilter === tab.id
                  ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 max-sm:px-4 max-sm:pb-28 sm:px-6 sm:py-6 lg:px-8">
        {/* Mobile: card list without outer table container */}
        <div className="mx-auto max-w-5xl sm:hidden">
          {(roleActionError || modelsActionError) && (
            <div className="mb-3 space-y-2">
              {roleActionError ? (
                <p className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2.5 text-sm text-[var(--destructive)]">
                  {roleActionError}
                </p>
              ) : null}
              {modelsActionError ? (
                <p className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2.5 text-sm text-[var(--destructive)]">
                  {modelsActionError}
                </p>
              ) : null}
            </div>
          )}
          {loading ? (
            <div className="flex min-h-[12rem] items-center justify-center gap-2 py-12 text-sm text-[var(--foreground-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Cargando usuarios…
            </div>
          ) : error ? (
            <EmptyState
              className="min-h-[240px] rounded-2xl border-solid"
              icon={Users}
              title="No se pudieron cargar los usuarios"
              description={error}
              action={{
                label: "Reintentar",
                icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                onClick: () => void loadUsers(),
              }}
            />
          ) : users.length === 0 ? (
            <EmptyState
              className="min-h-[240px] rounded-2xl border-solid"
              icon={Users}
              title="Sin usuarios"
              description="Crea el primer usuario con el botón +."
              action={{
                label: "Nuevo usuario",
                icon: <UserPlus className="h-4 w-4" aria-hidden />,
                onClick: () => setShowCreate(true),
              }}
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              className="min-h-[200px] rounded-2xl border-solid"
              icon={Search}
              title="Sin coincidencias"
              description="Prueba otro término de búsqueda o cambia el filtro de rol."
            />
          ) : (
            <ul className="space-y-3">
              {filteredUsers.map((u) => {
                const secret = secrets[u.id] ?? EMPTY_SECRET;
                const isOpen = openSecretFor === u.id;
                const isSelf = u.id === myId;
                return (
                  <li key={`mobile-${u.id}`}>
                    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
                      <div className="flex items-start gap-3 p-4">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))] text-sm font-semibold text-[var(--primary)]"
                          aria-hidden
                        >
                          {getUserInitials(u.name, u.email)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold leading-tight text-[var(--foreground)]">
                                {u.name ?? u.email}
                              </p>
                              {u.name ? (
                                <p className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">
                                  {u.email}
                                </p>
                              ) : null}
                            </div>
                            {isSelf ? (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                Tú
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-2.5">
                            {isSelf ? (
                              <Badge variant={roleBadgeVariant(u.role)} className="text-[11px]">
                                {formatRoleLabel(u.role)}
                              </Badge>
                            ) : canEditUserRole(isSelf) ? (
                              <ListRowSelect
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(
                                    u.id,
                                    e.target.value as "super_admin" | "admin" | "developer",
                                  )
                                }
                                aria-label={`Rol de ${u.email}`}
                                className={cn(
                                  listRowSelectClass,
                                  "h-10 w-full rounded-xl border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] text-sm",
                                )}
                              >
                                <option value="super_admin">Super admin</option>
                                <option value="admin">Admin</option>
                                <option value="developer">Developer</option>
                              </ListRowSelect>
                            ) : (
                              <Badge variant={roleBadgeVariant(u.role)} className="text-[11px]">
                                {formatRoleLabel(u.role)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-t border-[var(--border)]">
                        <button
                          type="button"
                          className={cn(
                            "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors active:bg-[var(--muted)]",
                            isOpen
                              ? "bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-[var(--primary)]"
                              : "text-[var(--foreground-muted)]",
                          )}
                          aria-pressed={isOpen}
                          onClick={() => void toggleSecret(u.id)}
                        >
                          <KeyRound className="h-5 w-5" aria-hidden />
                          {isOpen ? "Ocultar MCP" : "Ver MCP"}
                        </button>
                        {isSelf ? (
                          <button
                            type="button"
                            disabled
                            className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-3 text-xs font-medium text-[var(--foreground-muted)] opacity-40"
                          >
                            <Trash2 className="h-5 w-5" aria-hidden />
                            Eliminar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-3 text-xs font-medium text-[var(--destructive)] transition-colors active:bg-[var(--destructive)]/10"
                            onClick={() => void handleDelete(u.id, u.email)}
                          >
                            <Trash2 className="h-5 w-5" aria-hidden />
                            Eliminar
                          </button>
                        )}
                      </div>

                      {isSuperAdmin && u.role === "admin" ? (
                        <div className="space-y-2.5 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_28%,var(--card))] p-4">
                          <label
                            htmlFor={`mobile-models-${u.id}`}
                            className="block text-xs font-medium text-[var(--foreground)]"
                          >
                            Modelos permitidos
                          </label>
                          <Input
                            id={`mobile-models-${u.id}`}
                            value={modelDrafts[u.id] ?? ""}
                            onChange={(e) =>
                              setModelDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                            placeholder="modelo1, modelo2"
                            disabled={savingModelsFor === u.id}
                            className="rounded-xl text-xs font-mono"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full rounded-xl"
                            disabled={savingModelsFor === u.id}
                            onClick={() => void handleSaveAllowedModels(u.id)}
                          >
                            {savingModelsFor === u.id ? "Guardando…" : "Guardar modelos"}
                          </Button>
                        </div>
                      ) : null}

                      {isOpen ? (
                        <div className="space-y-2.5 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_32%,var(--card))] p-4">
                          {secret.error ? (
                            <p className="text-xs text-[var(--destructive)]">{secret.error}</p>
                          ) : null}
                          <p className="text-[11px] font-medium text-[var(--foreground-muted)]">
                            API key MCP
                          </p>
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                            <code className="block break-all font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
                              {secret.loading
                                ? "Cargando…"
                                : secret.value
                                  ? secret.visible
                                    ? secret.value
                                    : secret.value.replace(/./g, "•")
                                  : "—"}
                            </code>
                            <div className="mt-3 flex items-center justify-center gap-2">
                              <ListRowIconTooltipButton
                                tooltip={secret.visible ? "Ocultar" : "Mostrar"}
                                disabled={!secret.value}
                                onClick={() => updateSecret(u.id, { visible: !secret.visible })}
                              >
                                {secret.visible ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </ListRowIconTooltipButton>
                              <ListRowIconTooltipButton
                                tooltip={secret.copied ? "Copiado" : "Copiar"}
                                disabled={!secret.value}
                                onClick={() => void handleCopy(u.id)}
                              >
                                {secret.copied ? (
                                  <Check className="h-5 w-5 text-[var(--success)]" />
                                ) : (
                                  <Copy className="h-5 w-5" />
                                )}
                              </ListRowIconTooltipButton>
                              <ListRowIconTooltipButton
                                tooltip="Regenerar"
                                disabled={secret.loading}
                                onClick={() => handleRegenerate(u.id)}
                              >
                                <RefreshCw
                                  className={`h-5 w-5 ${secret.loading ? "animate-spin" : ""}`}
                                />
                              </ListRowIconTooltipButton>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Desktop: original table card */}
        <div className="mx-auto hidden h-full min-h-[min(100%,32rem)] max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm sm:flex">
          {(roleActionError || modelsActionError) && (
            <div className="shrink-0 space-y-2 border-b border-[var(--border)] p-4">
              {roleActionError ? (
                <p className="rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                  {roleActionError}
                </p>
              ) : null}
              {modelsActionError ? (
                <p className="rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                  {modelsActionError}
                </p>
              ) : null}
            </div>
          )}

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-[var(--foreground-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Cargando usuarios…
            </div>
          ) : error ? (
            <EmptyState
              className="m-4 min-h-[240px] border-solid"
              icon={Users}
              title="No se pudieron cargar los usuarios"
              description={error}
              action={{
                label: "Reintentar",
                icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                onClick: () => void loadUsers(),
              }}
            />
          ) : users.length === 0 ? (
            <EmptyState
              className="m-4 min-h-[240px] border-solid"
              icon={Users}
              title="Sin usuarios"
              description="Crea el primer usuario con el botón «Nuevo usuario»."
              action={{
                label: "Nuevo usuario",
                icon: <UserPlus className="h-4 w-4" aria-hidden />,
                onClick: () => setShowCreate(true),
              }}
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              className="m-4 min-h-[200px] border-solid"
              icon={Search}
              title="Sin coincidencias"
              description="Prueba otro término de búsqueda o cambia el filtro de rol."
            />
          ) : (
            <>
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_8.5rem_5.5rem] gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_25%,var(--card))] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
                <span>Usuario</span>
                <span>Rol</span>
                <span className="text-right">Acciones</span>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
                {filteredUsers.map((u) => {
                  const secret = secrets[u.id] ?? EMPTY_SECRET;
                  const isOpen = openSecretFor === u.id;
                  const isSelf = u.id === myId;
                  return (
                    <li key={u.id}>
                      <div className="grid grid-cols-[minmax(0,1fr)_9rem_5.75rem] items-center gap-4 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-xs font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_22%,transparent)]"
                            aria-hidden
                          >
                            {getUserInitials(u.name, u.email)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-[var(--foreground)]">
                                {u.name ?? u.email}
                              </p>
                              {isSelf ? (
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  Tú
                                </Badge>
                              ) : null}
                            </div>
                            {u.name ? (
                              <p className="truncate text-xs text-[var(--foreground-muted)]">{u.email}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center min-w-[9rem]">
                          {isSelf ? (
                            <Badge
                              variant={roleBadgeVariant(u.role)}
                              title="Tu rol solo puede cambiarlo otro administrador"
                            >
                              {formatRoleLabel(u.role)}
                            </Badge>
                          ) : canEditUserRole(isSelf) ? (
                            <ListRowSelect
                              value={u.role}
                              onChange={(e) =>
                                handleRoleChange(
                                  u.id,
                                  e.target.value as "super_admin" | "admin" | "developer",
                                )
                              }
                              aria-label={`Rol de ${u.email}`}
                              className="w-full max-w-[9rem]"
                            >
                              <option value="super_admin">Super admin</option>
                              <option value="admin">Admin</option>
                              <option value="developer">Developer</option>
                            </ListRowSelect>
                          ) : (
                            <Badge variant={roleBadgeVariant(u.role)}>{formatRoleLabel(u.role)}</Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <ListRowIconButton
                            variant={isOpen ? "default" : "outline"}
                            tooltip={isOpen ? "Ocultar API key MCP" : "Ver API key MCP"}
                            aria-pressed={isOpen}
                            onClick={() => void toggleSecret(u.id)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </ListRowIconButton>
                          {isSelf ? (
                            <ListRowIconButton
                              disabled
                              tooltip="No puedes eliminar tu propia cuenta"
                            >
                              <Trash2 className="h-4 w-4" />
                            </ListRowIconButton>
                          ) : (
                            <ListRowIconButton
                              tooltip="Eliminar usuario"
                              onClick={() => void handleDelete(u.id, u.email)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </ListRowIconButton>
                          )}
                        </div>
                      </div>

                      {isSuperAdmin && u.role === "admin" ? (
                        <div className="space-y-2 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_30%,var(--card))] px-4 py-3 pl-[3.25rem]">
                  <label
                    htmlFor={`models-${u.id}`}
                    className="block text-xs font-medium text-[var(--foreground)]"
                  >
                    Modelos de chat permitidos (compartidos)
                  </label>
                  <p className="text-[11px] text-[var(--foreground-muted)]">
                    Separa identificadores con comas. El usuario solo podrá usar los que guardes aquí.
                  </p>
                  <Input
                    id={`models-${u.id}`}
                    value={modelDrafts[u.id] ?? ""}
                    onChange={(e) =>
                      setModelDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    placeholder="minimax/minimax-m2.5, openai/gpt-4o-mini"
                    disabled={savingModelsFor === u.id}
                    className="text-xs font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingModelsFor === u.id}
                    onClick={() => void handleSaveAllowedModels(u.id)}
                  >
                    {savingModelsFor === u.id ? "Guardando…" : "Guardar modelos"}
                  </Button>
                </div>
              ) : null}

                      {isOpen ? (
                        <div className="space-y-3 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_35%,var(--card))] px-4 py-3 pl-[3.25rem]">
                  {secret.error && (
                    <p className="text-xs text-[var(--destructive)]">{secret.error}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs text-[var(--foreground)]">
                      {secret.loading
                        ? "Cargando…"
                        : secret.value
                          ? secret.visible
                            ? secret.value
                            : secret.value.replace(/./g, "•")
                          : "—"}
                    </code>
                    <div className="flex shrink-0 items-center gap-1">
                      <ListRowIconTooltipButton
                        tooltip={secret.visible ? "Ocultar API key" : "Mostrar API key"}
                        disabled={!secret.value}
                        onClick={() => updateSecret(u.id, { visible: !secret.visible })}
                      >
                        {secret.visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </ListRowIconTooltipButton>
                      <ListRowIconTooltipButton
                        tooltip={secret.copied ? "Copiado" : "Copiar API key"}
                        disabled={!secret.value}
                        onClick={() => void handleCopy(u.id)}
                      >
                        {secret.copied ? (
                          <Check className="w-4 h-4 text-[var(--success)]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </ListRowIconTooltipButton>
                      <ListRowIconTooltipButton
                        tooltip="Regenerar API key MCP"
                        disabled={secret.loading}
                        onClick={() => handleRegenerate(u.id)}
                      >
                        <RefreshCw className={`w-4 h-4 ${secret.loading ? "animate-spin" : ""}`} />
                      </ListRowIconTooltipButton>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--foreground-muted)]">
                    Token único por usuario para autenticar el MCP server.
                  </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
