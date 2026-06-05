/**
 * @fileoverview Shared chrome for the passwordless login screen: ambient background,
 * contributor footer, and exported LoginThemeSwitcher for use inside the login card.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { Github, Monitor, Moon, Scale, Sun } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "@/theme/ThemeProvider";
import {
  FORGE_CONTRIBUTORS,
  FORGE_GITHUB_REPO_URL,
  FORGE_LICENSE_URL,
  getContributorRoleLabel,
  getGitHubProfileUrl,
  type ForgeContributor,
} from "@/constants/contributors";

function LoginAmbientBackground() {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(ellipse_120%_90%_at_50%_-15%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_52%)]",
          "dark:bg-[radial-gradient(ellipse_120%_90%_at_50%_-15%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(ellipse_70%_50%_at_100%_30%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_60%)]",
          "dark:bg-[radial-gradient(ellipse_70%_50%_at_100%_30%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_65%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(ellipse_55%_45%_at_0%_70%,color-mix(in_oklch,var(--muted-foreground)_10%,transparent),transparent_58%)]",
          "dark:bg-[radial-gradient(ellipse_55%_45%_at_0%_70%,color-mix(in_oklch,var(--muted-foreground)_8%,transparent),transparent_60%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-[0.42] dark:opacity-[0.22]",
          "[background-image:radial-gradient(color-mix(in_oklch,var(--foreground)_11%,transparent)_1px,transparent_1px)]",
          "[background-size:18px_18px]",
        )}
      />
    </>
  );
}

/** Theme control for the login screen; intended to sit inside the login card (not floating over the accent bar). */
export function LoginThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  function renderThemeButton(value: ThemePreference, label: string) {
    return (
      <button
        key={value}
        type="button"
        onClick={() => setPreference(value)}
        title={label}
        aria-label={label}
        aria-pressed={preference === value}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          preference === value
            ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            : "text-[var(--foreground-muted)] hover:bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]",
        )}
      >
        {value === "light" ? (
          <Sun className="h-4 w-4" aria-hidden />
        ) : value === "system" ? (
          <Monitor className="h-4 w-4" aria-hidden />
        ) : (
          <Moon className="h-4 w-4" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-[color-mix(in_oklch,var(--border)_85%,transparent)]",
        "bg-[color-mix(in_oklch,var(--card)_88%,var(--background))] px-1.5 py-1 shadow-sm backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="Tema de la interfaz"
    >
      {renderThemeButton("light", "Claro")}
      {renderThemeButton("system", "Sistema")}
      {renderThemeButton("dark", "Oscuro")}
    </div>
  );
}

function ContributorAvatarStrip({ contributors }: { contributors: readonly ForgeContributor[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col items-center gap-1 overflow-visible sm:w-auto sm:items-end">
      <p className="text-center text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)] sm:text-right">
        Colaboradores y autores
      </p>
      <ul className="flex justify-center overflow-visible pr-0.5 pt-0.5 sm:justify-end">
        {contributors.map((c, index) => {
          const profileUrl = getGitHubProfileUrl(c.githubLogin);
          const isHovered = hoveredId === c.id;
          const stackZ = index + 1;
          return (
            <li
              key={c.id}
              className="relative overflow-visible"
              style={{ marginLeft: index === 0 ? 0 : -8, zIndex: isHovered ? 80 : stackZ }}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                      "transition-[transform,box-shadow] duration-200 ease-forge-smooth",
                      "hover:-translate-y-2 hover:scale-[1.12] hover:shadow-md",
                      "active:scale-[1.06]",
                    )}
                    aria-label={`${c.displayName} en GitHub`}
                  >
                    <img
                      src={c.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full border border-white object-cover shadow-sm ring-1 ring-black/[0.05] dark:border-[color-mix(in_oklch,var(--card)_92%,var(--border))]"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={10}
                  className="max-w-[16rem] border-0 bg-zinc-900 px-3 py-2.5 text-left text-white shadow-lg dark:bg-zinc-950"
                >
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight text-white">{c.displayName}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{getContributorRoleLabel(c.role)}</p>
                    </div>
                    <Github className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition-colors hover:text-white" aria-hidden />
                  </a>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoginFooterBar() {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "relative z-[1] mt-auto w-full border-t border-[color-mix(in_oklch,var(--border)_65%,transparent)]",
        "bg-[color-mix(in_oklch,var(--card)_40%,transparent)] backdrop-blur-sm",
        "px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.625rem,env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2.5",
        "dark:bg-[color-mix(in_oklch,var(--card)_28%,transparent)]",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="max-w-xl space-y-1 text-center md:text-left">
          <p className="text-[11px] leading-snug text-[var(--foreground-muted)]">
            © {year} The Forge. Apache License 2.0. Código abierto en GitHub.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] md:justify-start">
            <a
              href={FORGE_GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              <Github className="h-3 w-3" aria-hidden />
              Código en GitHub
            </a>
            <a
              href={FORGE_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              <Scale className="h-3 w-3" aria-hidden />
              Licencia Apache 2.0
            </a>
          </div>
        </div>
        <ContributorAvatarStrip contributors={FORGE_CONTRIBUTORS} />
      </div>
    </footer>
  );
}

export interface LoginScreenChromeProps {
  children: ReactNode;
}

/**
 * Full-viewport shell: gradient mesh, dot grid, scrollable main, footer.
 * Desktop (md+): theme toggle floats top-right. Mobile: theme is rendered inside the login card (LoginView).
 */
export function LoginScreenChrome({ children }: LoginScreenChromeProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex min-h-screen min-h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]">
        <LoginAmbientBackground />
        <div className="pointer-events-none absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 hidden md:block md:right-8 md:top-6">
          <div className="pointer-events-auto">
            <LoginThemeSwitcher />
          </div>
        </div>
        <div
          className={cn(
            "relative z-[1] flex min-h-0 flex-1 flex-col",
            "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
            "pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]",
            "sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-8",
            "md:pl-[max(2rem,env(safe-area-inset-left))] md:pr-[max(2rem,env(safe-area-inset-right))] md:pt-12 lg:pt-14",
          )}
        >
          {children}
        </div>
        <LoginFooterBar />
      </div>
    </TooltipProvider>
  );
}
