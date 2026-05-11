import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui";
import { Cable, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface AriadneConfig {
  url: string;
  token: string;
}

export function AriadneConfigCard() {
  const [config, setConfig] = useState<AriadneConfig>({ url: "", token: "" });
  const [initial, setInitial] = useState<AriadneConfig>({ url: "", token: "" });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/admin/ariadne-config");
      if (!res.ok) throw new Error("No se pudo obtener la configuración");
      const data: AriadneConfig = await res.json();
      setConfig(data);
      setInitial(data);
    } catch {
      setError("Error al cargar configuración de Ariadne");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const hasChanges =
    config.url !== initial.url || config.token !== initial.token;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.put("/api/admin/ariadne-config", {
        url: config.url || undefined,
        token: config.token || undefined,
      });
      if (!res.ok) throw new Error("Error al guardar");
      setInitial({ ...config });
      setSuccess("Configuración guardada correctamente");
    } catch {
      setError("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/api/admin/ariadne-config/test", {
        url: config.url,
        token: config.token,
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Conexión fallida");
      setSuccess("Conexión exitosa con Ariadne MCP");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al probar conexión",
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
            <Cable className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <CardTitle>Base de conocimientos Ariadne</CardTitle>
            <CardDescription>
              Conexión al MCP de Ariadne para importar proyectos existentes
              como base de conocimiento.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[var(--foreground-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando configuración…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Messages */}
            {success && (
              <div className="rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-4 py-3 text-sm text-[var(--foreground)]">
                {success}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
                {error}
              </div>
            )}

            {/* URL */}
            <div className="space-y-1.5">
              <label
                htmlFor="ariadne-url"
                className="text-sm font-medium text-[var(--foreground)]"
              >
                URL del MCP
              </label>
              <input
                id="ariadne-url"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="https://ariadne.kreoint.mx/mcp"
                value={config.url}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, url: e.target.value }))
                }
              />
            </div>

            {/* Token */}
            <div className="space-y-1.5">
              <label
                htmlFor="ariadne-token"
                className="text-sm font-medium text-[var(--foreground)]"
              >
                Token MCP de Ariadne
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="ariadne-token"
                    type={tokenVisible ? "text" : "password"}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    placeholder="mcp_secret_del_usuario_en_ariadne"
                    value={config.token}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, token: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                    onClick={() => setTokenVisible(!tokenVisible)}
                    tabIndex={-1}
                  >
                    {tokenVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={saving || !hasChanges}
              >
                {saving ? "Guardando…" : <Check className="h-4 w-4" />}
                {hasChanges ? "Guardar cambios" : "Guardado"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                loading={testing}
                disabled={testing || !config.url}
              >
                {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                Probar conexión
              </Button>
            </div>

            <p className="text-xs text-[var(--foreground-muted)]">
              El token debe ser el MCP Secret del usuario en Ariadne que
              tendrá acceso como base de conocimientos. Sin esto, los
              proyectos de Ariadne no podrán importarse.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
