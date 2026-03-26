import { useState } from "react";
import { Flame, Loader2, Mail } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { API_BASE, setAccessToken } from "@/utils/apiClient";

interface LoginViewProps {
  onLoggedIn: () => void;
}

export default function LoginView({ onLoggedIn }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(
          typeof err.message === "string" ? err.message : "No se pudo enviar el código",
        );
      }
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        accessToken?: string;
        message?: string | string[];
      };
      if (!r.ok) {
        const msg = data.message;
        const text = Array.isArray(msg) ? msg.join(", ") : msg;
        throw new Error(text ?? "Código incorrecto");
      }
      if (typeof data.accessToken !== "string") {
        throw new Error("Respuesta inválida del servidor");
      }
      setAccessToken(data.accessToken);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-lg border-[var(--border)]">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl flex items-center gap-2 text-[var(--primary)]">
            <Flame className="w-7 h-7" />
            The Forge
          </CardTitle>
          <p className="text-sm text-[var(--foreground-muted)] font-normal">
            Acceso por código enviado al correo autorizado.
          </p>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={requestOtp} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm text-[var(--foreground-muted)]">
                  Correo
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@empresa.com"
                    className="pl-10"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-[var(--destructive)]">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Enviar código
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm text-[var(--foreground-muted)]">
                  Código de 6 dígitos
                </label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  minLength={6}
                />
              </div>
              {error && (
                <p className="text-sm text-[var(--destructive)]">{error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Volver
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Entrar
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
