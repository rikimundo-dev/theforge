import { useEffect, useState } from "react";
import { Flame, Loader2, Mail, Shield } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { LoginScreenChrome } from "@/components/login/LoginChrome";
import { API_BASE, setAccessToken } from "@/utils/apiClient";
import { parseErrorBodyText, parseErrorMessageFromResponse } from "@/utils/httpError";
import { cn } from "@/lib/utils";

interface LoginViewProps {
  onLoggedIn: () => void;
}

type Step = "send" | "code" | "sso";

export default function LoginView({ onLoggedIn }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("send");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    const ssoUrl = import.meta.env.VITE_SSO_URL as string;
    if (ssoUrl?.trim()) {
      setSsoEnabled(true);
    }

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
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Email requerido");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      if (!r.ok) {
        const msg = await parseErrorMessageFromResponse(r, "No se pudo enviar el código por correo");
        throw new Error(msg);
      }
      setEmail(normalized);
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const rawText = await r.text();
      let data = {} as {
        accessToken?: string;
        message?: string | string[];
      };
      try {
        data = JSON.parse(rawText) as typeof data;
      } catch {
        /* empty */
      }
      if (!r.ok) {
        throw new Error(parseErrorBodyText(rawText, "Código incorrecto", r.status));
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

  const otpFormId = "login-otp-request-form";
  const verifyFormId = "login-otp-verify-form";

  return (
    <LoginScreenChrome>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-8">
        <div
          className={cn(
            "relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--card-border)] bg-[var(--card)]",
            "shadow-[var(--shadow-lg)]",
          )}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[3px] bg-gradient-to-r from-transparent via-[color-mix(in_oklch,var(--primary)_88%,white)] to-transparent opacity-[0.98] dark:via-[color-mix(in_oklch,var(--primary)_75%,transparent)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[7rem] bg-gradient-to-b from-[color-mix(in_oklch,var(--primary)_16%,transparent)] via-[color-mix(in_oklch,var(--primary)_6%,transparent)] to-transparent dark:from-[color-mix(in_oklch,var(--primary)_22%,transparent)] dark:via-[color-mix(in_oklch,var(--primary)_8%,transparent)]"
            aria-hidden
          />

          <div className="relative z-[3] px-6 pb-6 pt-10 md:px-8">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  "mb-6 flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-2xl",
                  "border border-[color-mix(in_oklch,var(--border)_72%,var(--primary)_18%)] bg-white",
                  "shadow-[0_2px_12px_-4px_color-mix(in_oklch,var(--primary)_35%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.96)]",
                  "dark:border-[color-mix(in_oklch,var(--border)_65%,var(--primary)_15%)]",
                  "dark:bg-[color-mix(in_oklch,var(--popover)_96%,var(--card))]",
                  "dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]",
                )}
              >
                <Flame
                  className="h-[2.35rem] w-[2.35rem] shrink-0 text-[var(--primary)]"
                  fill="currentColor"
                  fillOpacity={0.92}
                  strokeWidth={1.35}
                  aria-hidden
                />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                The Forge
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--foreground-muted)]">
                Ingresa tu correo registrado para recibir el código de acceso.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklch,var(--primary)_52%,var(--border))] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[var(--primary)] dark:border-[color-mix(in_oklch,var(--primary)_42%,var(--border))]">
                <Shield className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                Acceso sin contraseña
              </div>
            </div>

            <div className="my-6 h-px w-full bg-[var(--border)]" />

            {step === "send" ? (
              <>
                <form id={otpFormId} onSubmit={requestOtp} className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="login-email"
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]"
                    >
                      Correo corporativo
                    </label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]"
                        aria-hidden
                      />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        placeholder="tu@empresa.com"
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        disabled={loading}
                        required
                        className="h-11 rounded-xl pl-10"
                      />
                    </div>
                  </div>
                  {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
                </form>

                <div
                  className={cn(
                    "-mx-6 mt-6 border-t border-[color-mix(in_oklch,var(--border)_85%,transparent)]",
                    "bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] px-6 py-4",
                    "rounded-b-[calc(var(--radius-xl)-1px)]",
                    "dark:bg-[color-mix(in_oklch,var(--muted)_28%,var(--card))]",
                  )}
                >
                  <p className="text-center text-xs leading-relaxed text-[var(--foreground-muted)]">
                    Solo cuentas autorizadas reciben un código. Revisa spam si no ves el correo en
                    unos minutos.
                  </p>
                </div>
              </>
            ) : null}

            {step === "send" ? null : (
              <>
                <form id={verifyFormId} onSubmit={verifyOtp} className="space-y-5">
                  <p className="text-center text-sm text-[var(--foreground-muted)]">
                    Código enviado a{" "}
                    <span className="font-medium text-[var(--foreground)]">{email}</span>
                  </p>
                  <div className="space-y-2">
                    <label
                      htmlFor="login-code"
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]"
                    >
                      Código de 6 dígitos
                    </label>
                    <Input
                      id="login-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      placeholder="000000"
                      maxLength={6}
                      pattern="\d{6}"
                      value={code}
                      onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      className="h-11 rounded-xl text-center text-lg tracking-[0.3em]"
                      disabled={loading}
                    />
                  </div>
                  {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
                </form>
              </>
            )}
          </div>
        </div>

        {step === "send" ? (
          <>
            <Button
              type="submit"
              form={otpFormId}
              className="mt-5 h-12 w-full rounded-xl text-base font-semibold shadow-[var(--shadow-sm)]"
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <span className="sr-only">Enviando</span>
                </>
              ) : (
                "Enviar código"
              )}
            </Button>

            {ssoEnabled ? (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[var(--border)]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[var(--background)] px-2 text-[var(--foreground-muted)]">
                      o
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => {
                    const ssoUrl = import.meta.env.VITE_SSO_URL as string;
                    if (ssoUrl) window.location.href = ssoUrl;
                  }}
                  disabled={loading}
                >
                  Iniciar sesión con SSO
                </Button>
              </>
            ) : null}
          </>
        ) : (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 rounded-xl"
              onClick={() => {
                setStep("send");
                setCode("");
                setError(null);
              }}
              disabled={loading}
            >
              Volver
            </Button>
            <Button
              type="submit"
              form={verifyFormId}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : "Entrar"}
            </Button>
          </div>
        )}
      </div>
    </LoginScreenChrome>
  );
}
