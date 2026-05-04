import { useEffect, useState, useCallback } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { apiFetch, API_BASE } from "@/utils/apiClient";

interface UserRow {
  id: string;
  email: string;
  role: "admin" | "developer";
  name: string | null;
  hasMcpSecret: boolean;
  createdAt: string;
}

export function UsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/users`);
      if (r.ok) {
        const data = (await r.json()) as UserRow[];
        setUsers(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, role: "admin" | "developer") => {
    const r = await apiFetch(`${API_BASE}/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (r.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-[var(--foreground-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando usuarios…
      </div>
    );
  }

  if (users.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] py-4">No hay usuarios registrados.</p>;
  }

  return (
    <div className="space-y-2 overflow-y-auto flex-1 min-h-0 py-2">
      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{u.email}</p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {u.hasMcpSecret ? "Token MCP configurado" : "Sin token MCP"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <select
              value={u.role}
              onChange={(e) => handleRoleChange(u.id, e.target.value as "admin" | "developer")}
              className="text-sm rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1"
            >
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
