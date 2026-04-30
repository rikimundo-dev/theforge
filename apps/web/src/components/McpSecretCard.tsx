import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card";
import { Shield, RefreshCw, Eye, EyeOff, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Panel de configuración del secret MCP M2M.
 * Permite ver el secret actual, copiarlo al portapapeles y regenerarlo.
 * El secret se usa para que el MCP server se autentique como este usuario.
 */
export function McpSecretCard() {
  const [mcpSecret, setMcpSecret] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const fetchSecret = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/auth/mcp-secret");
      if (!res.ok) throw new Error("No se pudo obtener el secret");
      const data = await res.json();
      setMcpSecret(data.mcpSecret ?? "");
      setMessage(data.message ?? "");
    } catch {
      setError("Error al obtener el secret MCP");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!mcpSecret && !confirm("¿Estás seguro? Esto invalidará el secret actual.")) return;
    if (mcpSecret && !confirm("¿Regenerar el secret MCP? El secret anterior dejará de funcionar inmediatamente.")) return;

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/api/auth/mcp-secret/regenerate");
      if (!res.ok) throw new Error("No se pudo regenerar el secret");
      const data = await res.json();
      setMcpSecret(data.mcpSecret ?? "");
      setMessage("Secret regenerado exitosamente. Guárdalo de inmediato.");
    } catch {
      setError("Error al regenerar el secret MCP");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = mcpSecret;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    fetchSecret();
  }, []);

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
            <Shield className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <CardTitle>Secret MCP</CardTitle>
            <CardDescription>
              Token para autenticar el MCP server como tu usuario. Se genera automáticamente y es rotable.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Mensajes */}
          {message && (
            <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}

          {/* Secret display */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-sm text-[var(--foreground)]">
                {mcpSecret
                  ? visible
                    ? mcpSecret
                    : mcpSecret.replace(/./g, "•")
                  : loading
                  ? "Cargando..."
                  : "Sin secret disponible"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setVisible(!visible)}
                disabled={!mcpSecret}
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopy}
                disabled={!mcpSecret}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              loading={loading}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerar secret
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSecret}
              disabled={loading}
            >
              Recargar
            </Button>
          </div>

          <p className="text-xs text-[var(--foreground-muted)]">
            Este secret permite que el MCP server actúe en tu nombre. Si lo comprometes,
            regéneralo para invalidar el anterior.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
