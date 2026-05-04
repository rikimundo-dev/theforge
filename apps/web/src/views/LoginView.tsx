import { useEffect, useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { API_BASE, setAccessToken, getAccessToken, clearAccessToken } from "@/utils/apiClient";

interface LoginViewProps {
  onLoggedIn: () => void;
}

export default function LoginView({ onLoggedIn }: LoginViewProps) {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"send" | "code" | "sso">("send");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    const ssoUrl = import.meta.env.VITE_SSO_URL as string;
    if (ssoUrl?.trim()) {
      setSsoEnabled(true);
    }

    // Manejar redirect SSO con token
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get("sso_token");
    if (ssoToken) {
      handleSsoLogin(ssoToken);
    }
  }, []);

  async function handleSsoLogin(token: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/auth/sso/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (!r.ok || !data.accessToken) {
        throw new Error(data.message ?? "Error SSO");
      }
      setAccessToken(data.accessToken);
      // Limpiar query params
      window.history.replaceState({}, "", window.location.pathname);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error SSO");
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        body: JSON.stringify({ code: code.trim() }),
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
            El código se envía al correo configurado en el servidor (EMAIL_OTP).
          </p>
        </CardHeader>
        <CardContent>
          {step === "send" ? (
            <form onSubmit={requestOtp} className="space-y-4">
              {error && (
                <p className="text-sm text-[var(--destructive)]">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Enviar código
              </Button>
              {ssoEnabled && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-[var(--border)]" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-[var(--card)] px-2 text-[var(--foreground-muted)]">o</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const ssoUrl = import.meta.env.VITE_SSO_URL as string;
                      if (ssoUrl) window.location.href = ssoUrl;
                    }}
                    disabled={loading}
                  >
                    Iniciar sesión con SSO
                  </Button>
                </>
              )}
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
                    setStep("send");
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
