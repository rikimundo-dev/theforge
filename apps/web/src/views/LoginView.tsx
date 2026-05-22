import { useEffect, useState } from "react";
import { Flame, Loader2, Mail, Shield } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { LoginScreenChrome, LoginThemeSwitcher } from "@/components/login/LoginChrome";
import { API_BASE, setAccessToken } from "@/utils/apiClient";
import { parseErrorBodyText } from "@/utils/httpError";
import { cn } from "@/lib/utils";

interface LoginViewProps {
  onLoggedIn: () => void;
}

type Step = "send" | "code" | "sso";

export default function LoginView({ onLoggedIn }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("send");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
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
      const rawText = await r.text();
      let data = {} as { devCode?: string };
      try {
        data = JSON.parse(rawText) as { devCode?: string };
      } catch {
        /* empty */
      }
      if (!r.ok) {
        throw new Error(parseErrorBodyText(rawText, "No se pudo enviar el código por correo", r.status));
      }
      setEmail(normalized);
      if (data.devCode) {
        setDevOtpHint(data.devCode);
        setCode(data.devCode);
      } else {
        setDevOtpHint(null);
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
      <div className="mx-auto flex w-full min-w-0 max-w-md flex-1 flex-col justify-start pb-4 pt-1 sm:justify-center sm:pb-8 sm:pt-0">
        <div
          className={cn(
            "relative w-full min-w-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--card-border)] bg-[var(--card)]",
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

          <div className="relative z-[3] px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5 md:px-8 md:pb-6 md:pt-10">
            <div className="mb-5 flex shrink-0 justify-end sm:mb-6 md:hidden">
              <LoginThemeSwitcher className="border-[color-mix(in_oklch,var(--border)_70%,transparent)] bg-[color-mix(in_oklch,var(--background)_30%,var(--card))] shadow-sm" />
            </div>
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  "mb-5 flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-2xl sm:mb-6 sm:h-[4.25rem] sm:w-[4.25rem]",
                  "border border-[color-mix(in_oklch,var(--border)_72%,var(--primary)_18%)] bg-white",
                  "shadow-[0_2px_12px_-4px_color-mix(in_oklch,var(--primary)_35%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.96)]",
                  "dark:border-[color-mix(in_oklch,var(--border)_65%,var(--primary)_15%)]",
                  "dark:bg-[color-mix(in_oklch,var(--popover)_96%,var(--card))]",
                  "dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]",
                )}
              >
                <Flame
                  className="h-[2rem] w-[2rem] shrink-0 text-[var(--primary)] sm:h-[2.35rem] sm:w-[2.35rem]"
                  fill="currentColor"
                  fillOpacity={0.92}
                  strokeWidth={1.35}
                  aria-hidden
                />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
                The Forge
              </h1>
              <p className="mt-2 max-w-sm px-0.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Introduce tu correo corporativo registrado; te enviaremos un código de acceso.
              </p>
              <div className="mt-4 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklch,var(--primary)_52%,var(--border))] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--primary)] dark:border-[color-mix(in_oklch,var(--primary)_42%,var(--border))] sm:px-3.5">
                <Shield className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                Acceso sin contraseña
              </div>
            </div>

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
                        className="h-12 min-h-[48px] rounded-xl pl-10 text-base sm:h-11 sm:min-h-0 sm:text-sm"
                      />
                    </div>
                  </div>
                  {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
                </form>

                <div
                  className={cn(
                    "-mx-4 mt-6 border-t border-[color-mix(in_oklch,var(--border)_85%,transparent)]",
                    "bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] px-4 py-4",
                    "rounded-b-[calc(var(--radius-xl)-1px)] sm:-mx-6 sm:px-6",
                    "dark:bg-[color-mix(in_oklch,var(--muted)_28%,var(--card))]",
                  )}
                >
                  <p className="text-center text-xs leading-relaxed text-[var(--foreground-muted)]">
                    Solo cuentas autorizadas reciben un código. Revisa spam si no ves el correo en
                    unos minutos.
                  </p>
                </div>
              </>
            ) : (
              <form id={verifyFormId} onSubmit={verifyOtp} className="space-y-5">
                <p className="break-words text-center text-sm text-[var(--foreground-muted)]">
                  {devOtpHint
                    ? "Código OTP (OTP_DEV_EXPOSE_CODE=1, sin correo)"
                    : "Código enviado a"}{" "}
                  {!devOtpHint ? (
                    <span className="break-all font-medium text-[var(--foreground)]">{email}</span>
                  ) : null}
                </p>
                {devOtpHint ? (
                  <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-center font-mono text-lg tracking-widest">
                    {devOtpHint}
                  </p>
                ) : null}
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
                    className="h-12 min-h-[48px] rounded-xl text-center text-base tracking-[0.28em] sm:h-11 sm:min-h-0 sm:text-lg sm:tracking-[0.3em]"
                    disabled={loading}
                  />
                </div>
                {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
              </form>
            )}
          </div>
        </div>

        {step === "send" ? (
          <>
            <Button
              type="submit"
              form={otpFormId}
              className="mt-5 h-12 min-h-[48px] w-full touch-manipulation rounded-xl text-base font-semibold shadow-[var(--shadow-sm)] active:scale-[0.99] sm:touch-auto sm:active:scale-100"
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
                  className="h-12 min-h-[48px] w-full touch-manipulation rounded-xl active:scale-[0.99] sm:h-11 sm:min-h-0 sm:active:scale-100"
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
              className="h-12 min-h-[48px] flex-1 touch-manipulation rounded-xl active:scale-[0.99] sm:min-h-0 sm:active:scale-100"
              onClick={() => {
                setStep("send");
                setCode("");
                setDevOtpHint(null);
                setError(null);
              }}
              disabled={loading}
            >
              Volver
            </Button>
            <Button
              type="submit"
              form={verifyFormId}
              className="h-12 min-h-[48px] flex-1 touch-manipulation rounded-xl text-base font-semibold active:scale-[0.99] sm:min-h-0 sm:active:scale-100"
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
