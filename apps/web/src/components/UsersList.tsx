import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  UserPlus,
  Trash2,
  X,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { apiFetch, API_BASE, getStoredUser } from "@/utils/apiClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
  assignableChatModels: string[];
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

function canEditUserRole(
  viewerIsSuperAdmin: boolean,
  targetRole: UserRow["role"],
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (targetRole === "super_admin" && !viewerIsSuperAdmin) return false;
  return true;
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

function parseUsersResponse(
  raw: UserRow[] | UsersListPayload,
): { users: UserRow[]; assignableChatModels: string[] } {
  if (Array.isArray(raw)) {
    return { users: raw, assignableChatModels: [] };
  }
  return {
    users: raw.users ?? [],
    assignableChatModels: raw.assignableChatModels ?? [],
  };
}

export function UsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignableChatModels, setAssignableChatModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "developer">("developer");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleActionError, setRoleActionError] = useState<string | null>(null);
  const [openSecretFor, setOpenSecretFor] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, SecretState>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [savingModelsFor, setSavingModelsFor] = useState<string | null>(null);
  const [modelsActionError, setModelsActionError] = useState<string | null>(null);

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
    try {
      const r = await apiFetch(`${API_BASE}/users`);
      if (r.ok) {
        const raw = (await r.json()) as UserRow[] | UsersListPayload;
        const { users: list, assignableChatModels: pool } = parseUsersResponse(raw);
        setUsers(list);
        setAssignableChatModels(pool);
        if (isSuperAdmin) {
          const modelDraft: Record<string, string> = {};
          for (const u of list) {
            modelDraft[u.id] = (u.allowedChatModels ?? []).join(", ");
          }
          setModelDrafts(modelDraft);
        }
      }
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
        assignableChatModels?: string[];
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
      if (data.assignableChatModels?.length) {
        setAssignableChatModels(data.assignableChatModels);
      }
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
        setNewEmail("");
        setNewName("");
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

  return (
    <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-2">
      {showCreate ? (
        <form onSubmit={handleCreate} className="rounded-lg border border-[var(--border)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Nuevo usuario</span>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setError(null);
              }}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input
            placeholder="Email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="text-sm"
          />
          <Input
            placeholder="Nombre (opcional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "developer")}
            className="w-full text-sm rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5"
          >
            <option value="developer">Developer</option>
            <option value="admin">Admin</option>
          </select>
          {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={creating || !newEmail.trim()}>
              {creating ? "Creando..." : "Crear"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            Se generará automáticamente una API key para uso del MCP. Podrás verla o regenerarla luego.
          </p>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setRoleActionError(null);
          }}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:border-[var(--primary)]/40 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo usuario
        </button>
      )}

      {roleActionError && (
        <p className="text-sm text-[var(--destructive)] rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2">
          {roleActionError}
        </p>
      )}
      {modelsActionError && (
        <p className="text-sm text-[var(--destructive)] rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2">
          {modelsActionError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[var(--foreground-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando usuarios…
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)] py-2">No hay usuarios registrados.</p>
      ) : (
        users.map((u) => {
          const secret = secrets[u.id] ?? EMPTY_SECRET;
          const isOpen = openSecretFor === u.id;
          const isSelf = u.id === myId;
          return (
            <div key={u.id} className="rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{u.name ?? u.email}</p>
                  {u.name && (
                    <p className="text-xs text-[var(--foreground-muted)] truncate">{u.email}</p>
                  )}
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {u.hasMcpSecret ? "API key configurada" : "Sin API key"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {isSelf ? (
                    <span
                      className="text-sm rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 font-medium capitalize text-[var(--foreground)]"
                      title="Tu rol solo puede cambiarlo otro administrador"
                    >
                      {formatRoleLabel(u.role)}
                    </span>
                  ) : canEditUserRole(isSuperAdmin, u.role, isSelf) ? (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(
                          u.id,
                          e.target.value as "super_admin" | "admin" | "developer",
                        )
                      }
                      className="text-sm rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                    >
                      {isSuperAdmin ? <option value="super_admin">Super admin</option> : null}
                      <option value="admin">Admin</option>
                      <option value="developer">Developer</option>
                    </select>
                  ) : (
                    <span className="text-sm rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 font-medium text-[var(--foreground)]">
                      {formatRoleLabel(u.role)}
                    </span>
                  )}
                  <button
                    onClick={() => toggleSecret(u.id)}
                    className={`p-1.5 rounded-md transition-colors ${
                      isOpen
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--foreground-muted)] hover:text-[var(--accent)]"
                    }`}
                    title="API key"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  {isSelf ? (
                    <span
                      className="p-1.5 text-[var(--foreground-muted)] opacity-45 cursor-not-allowed"
                      title="No puedes eliminar tu propia cuenta"
                      aria-hidden
                    >
                      <Trash2 className="w-4 h-4" />
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      className="p-1.5 text-[var(--foreground-muted)] hover:text-[var(--destructive)] transition-colors"
                      title="Eliminar usuario"
                      type="button"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {isSuperAdmin && u.role !== "super_admin" ? (
                <div className="border-t border-[var(--border)] px-3 py-3 space-y-2 bg-[var(--muted)]/20">
                  <label
                    htmlFor={`models-${u.id}`}
                    className="block text-xs font-medium text-[var(--foreground)]"
                  >
                    Modelos de chat permitidos (compartidos)
                  </label>
                  <p className="text-[11px] text-[var(--foreground-muted)]">
                    Separa con comas. Puedes escribir cualquier identificador de modelo; el usuario
                    solo podrá usar los que guardes aquí (debe coincidir con el modelo del
                    proveedor activo en Ajustes).
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
                  {assignableChatModels.length > 0 ? (
                    <details className="text-[10px] text-[var(--foreground-muted)]">
                      <summary className="cursor-pointer select-none">
                        Sugerencias del sistema ({assignableChatModels.length}, opcional)
                      </summary>
                      <p className="mt-1 break-words">{assignableChatModels.join(", ")}</p>
                    </details>
                  ) : null}
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

              {isOpen && (
                <div className="border-t border-[var(--border)] p-3 space-y-3 bg-[var(--muted)]/30">
                  {secret.error && (
                    <p className="text-xs text-[var(--destructive)]">{secret.error}</p>
                  )}
                  <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2 flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-xs text-[var(--foreground)]">
                      {secret.loading
                        ? "Cargando…"
                        : secret.value
                          ? secret.visible
                            ? secret.value
                            : secret.value.replace(/./g, "•")
                          : "—"}
                    </code>
                    <button
                      onClick={() => updateSecret(u.id, { visible: !secret.visible })}
                      disabled={!secret.value}
                      className="p-1 text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                      title={secret.visible ? "Ocultar" : "Ver"}
                    >
                      {secret.visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleCopy(u.id)}
                      disabled={!secret.value}
                      className="p-1 text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                      title="Copiar"
                    >
                      {secret.copied ? (
                        <Check className="w-4 h-4 text-[var(--success)]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[var(--foreground-muted)] flex-1">
                      Token único por usuario para autenticar el MCP server.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRegenerate(u.id)}
                      disabled={secret.loading}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${secret.loading ? "animate-spin" : ""}`} />
                      Regenerar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
