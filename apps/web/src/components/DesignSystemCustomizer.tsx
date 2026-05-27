import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import type { DesignTokens, TypographyToken } from "@/components/design-system-types";
import {
  buildPreviewTheme,
  fallbackFromColors,
  generateColorScale,
  getTypographyScaleEntries,
  hexValue,
  isLightColor,
  normalizeHex,
  typographySampleText,
  getElevationPreviewItems,
  type PreviewMode,
} from "@/components/design-system-utils";
import { DesignSystemUIKit } from "@/components/DesignSystemUIKit";

const SCALE_LABELS = [
  { range: "1–2", label: "Backgrounds", span: 2 },
  { range: "3–5", label: "Interactive components", span: 3 },
  { range: "6–8", label: "Borders and separators", span: 3 },
  { range: "9–10", label: "Solid colors", span: 2 },
  { range: "11–12", label: "Accessible text", span: 2 },
] as const;

interface DesignSystemCustomizerProps {
  tokens: DesignTokens;
  title?: string;
  description?: string | null;
}

function ThemeToggle({
  mode,
  onChange,
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-[var(--border)] bg-[var(--muted)] p-0.5"
      role="group"
      aria-label="Preview theme"
    >
      <button
        type="button"
        onClick={() => onChange("light")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "light"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <Sun className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Light
      </button>
      <button
        type="button"
        onClick={() => onChange("dark")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "dark"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <Moon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Dark
      </button>
    </div>
  );
}

function ColorInputReadonly({
  label,
  hex,
}: {
  label: string;
  hex: string;
}) {
  const normalized = normalizeHex(hex);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-[var(--foreground-muted)]">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5">
        <span
          className="h-6 w-6 shrink-0 rounded-md border border-black/10 shadow-inner"
          style={{ backgroundColor: normalized }}
          aria-hidden
        />
        <span className="truncate font-mono text-xs text-[var(--foreground)]">{normalized}</span>
      </div>
    </div>
  );
}

function ColorScaleStrip({
  name,
  baseHex,
  mode,
}: {
  name: string;
  baseHex: string;
  mode: PreviewMode;
}) {
  const scale = useMemo(() => generateColorScale(baseHex, 12, mode), [baseHex, mode]);
  const normalized = normalizeHex(baseHex);

  return (
    <section className="space-y-3" aria-label={name}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--ds-fg)]">{name}</h3>
        <code className="shrink-0 font-mono text-xs text-[var(--ds-muted-fg)]">{normalized}</code>
      </div>

      <div
        className="grid grid-cols-12 gap-x-1 text-[10px] leading-snug text-[var(--ds-muted-fg)] sm:gap-x-2 sm:text-[11px]"
        aria-hidden
      >
        {SCALE_LABELS.map((item) => (
          <div
            key={item.range}
            className="min-w-0 truncate"
            style={{ gridColumn: `span ${item.span}` }}
          >
            <span className="font-semibold text-[var(--ds-fg)]">{item.range}</span>
            <span className="ml-1 hidden opacity-80 sm:inline">{item.label}</span>
            <span className="ml-1 opacity-80 sm:hidden">{item.label.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <div
        className="flex overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] ring-1 ring-[var(--ds-border)]"
        role="img"
        aria-label={`${name} — 12 steps from ${scale[0]} to ${scale[11]}`}
      >
        {scale.map((color, i) => {
          const step = i + 1;
          const light = isLightColor(color);
          return (
            <div
              key={step}
              className="group relative min-h-[44px] flex-1 cursor-default sm:min-h-[52px]"
              style={{ backgroundColor: color }}
              title={`Step ${step}: ${color}`}
            >
              <span
                className="absolute bottom-1.5 left-2 font-mono text-[9px] font-semibold tabular-nums sm:text-[10px]"
                style={{
                  color: light ? "rgba(0,0,0,0.52)" : "rgba(255,255,255,0.88)",
                  textShadow: light
                    ? "0 1px 0 rgba(255,255,255,0.35)"
                    : "0 1px 1px rgba(0,0,0,0.25)",
                }}
              >
                {step}
              </span>
              <span
                className="pointer-events-none absolute inset-x-0 top-1 flex justify-center opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              >
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[8px] font-medium sm:text-[9px]"
                  style={{
                    backgroundColor: light ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.92)",
                    color: light ? "#fff" : "#111",
                  }}
                >
                  {color}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TypographyPanel({
  typography,
}: {
  typography: Record<string, TypographyToken>;
}) {
  const entries = getTypographyScaleEntries(typography);
  const sans = typography["font-sans"]?.fontFamily;
  if (entries.length === 0) {
    return (
      <p className="text-xs text-[var(--ds-muted-fg)]">
        No type scale tokens found. Add h1, body-md, etc. in DESIGN.md typography.
      </p>
    );
  }

  return (
    <div className="space-y-0 divide-y divide-[var(--ds-border)]">
      {sans && (
        <p className="pb-3 text-[10px] text-[var(--ds-muted-fg)]">
          <span className="font-medium uppercase tracking-wide">Font family</span>
          <span className="mt-1 block font-mono text-[var(--ds-fg)]">{sans}</span>
        </p>
      )}
      {entries.map(([key, token]) => {
        const style: React.CSSProperties = {
          color: "var(--ds-fg)",
          fontFamily: token.fontFamily,
          fontSize: token.fontSize ?? "16px",
          fontWeight: token.fontWeight ?? 400,
          lineHeight: token.lineHeight ?? 1.5,
          letterSpacing: token.letterSpacing,
        };
        return (
          <div key={key} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--ds-muted)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-fg)]">
                {key}
              </span>
              <span className="font-mono text-[10px] text-[var(--ds-muted-fg)]">
                {token.fontSize ?? "—"} · w{token.fontWeight ?? "—"} · lh{" "}
                {token.lineHeight ?? "—"}
              </span>
            </div>
            <p className="leading-tight" style={style}>
              {typographySampleText(key)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SpacingPanel({ spacing }: { spacing: Record<string, string> }) {
  const entries = Object.entries(spacing).slice(0, 8);
  const maxPx = Math.max(
    ...entries.map(([, val]) => parseInt(val.replace(/[^\d]/g, ""), 10) || 0),
    1,
  );

  return (
    <div className="space-y-3">
      {entries.map(([key, val]) => {
        const px = parseInt(val.replace(/[^\d]/g, ""), 10);
        const barPct = Number.isNaN(px) ? 20 : Math.max(8, (px / maxPx) * 100);
        return (
          <div key={key} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--ds-muted-fg)]">
              {key}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--ds-muted)]">
              <div
                className="h-full rounded-full bg-[var(--ds-accent)]"
                style={{ width: `${barPct}%`, opacity: 0.75 }}
              />
            </div>
            <span className="min-w-[2.5rem] text-right font-mono text-[10px] tabular-nums text-[var(--ds-muted-fg)]">
              {val}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RadiusPanel({ rounded }: { rounded: Record<string, string> }) {
  return (
    <div className="flex flex-wrap justify-between gap-4">
      {Object.entries(rounded).slice(0, 6).map(([key, val]) => (
        <div key={key} className="flex flex-col items-center gap-2">
          <div
            className="h-12 w-12 border-2 border-[var(--ds-border)] bg-[var(--ds-muted)]"
            style={{ borderRadius: val }}
            aria-hidden
          />
          <span className="font-mono text-[10px] font-medium text-[var(--ds-muted-fg)]">{key}</span>
          <span className="font-mono text-[9px] text-[var(--ds-muted-fg)] opacity-70">{val}</span>
        </div>
      ))}
    </div>
  );
}

function ElevationPanel({
  elevation,
  mode,
}: {
  elevation: Record<string, string>;
  mode: PreviewMode;
}) {
  const items = getElevationPreviewItems(elevation, mode);

  return (
    <div className="rounded-xl bg-[var(--ds-playground-bg)] p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
        {items.map(({ key, shadow, level }) => {
          const cardHeight = 32 + level * 14;
          const stageMinHeight = 64 + level * 20;
          return (
            <div key={key} className="flex min-w-0 flex-col items-center text-center">
              <div
                className="flex w-full items-end justify-center px-2"
                style={{ minHeight: stageMinHeight }}
              >
                <div
                  className="w-full rounded-lg bg-[var(--ds-card)]"
                  style={{
                    height: cardHeight,
                    boxShadow: shadow,
                    border: "1px solid color-mix(in oklch, var(--ds-border) 65%, transparent)",
                  }}
                  title={shadow}
                />
              </div>
              <p className="mt-2.5 text-xs font-semibold capitalize tracking-tight text-[var(--ds-fg)]">
                {key}
              </p>
              <p
                className="mt-0.5 line-clamp-2 max-w-full px-0.5 font-mono text-[8px] leading-tight text-[var(--ds-muted-fg)]"
                title={shadow}
              >
                {shadow.length > 42 ? `${shadow.slice(0, 40)}…` : shadow}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TokenPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 shadow-sm">
      <h4 className="text-xs font-semibold text-[var(--ds-fg)]">{title}</h4>
      <p className="mt-0.5 text-[10px] text-[var(--ds-muted-fg)]">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Radix Colors–style design system customizer: theme toggle, palettes, token panels, UI playground.
 * @see https://www.radix-ui.com/colors/custom
 */
export function DesignSystemCustomizer({
  tokens,
  title,
  description,
}: DesignSystemCustomizerProps) {
  const { resolved: appTheme } = useTheme();
  /** Preview canvas mode — follows app light/dark until changed via the page toggle. */
  const [previewMode, setPreviewMode] = useState<PreviewMode>(appTheme);

  useEffect(() => {
    setPreviewMode(appTheme);
  }, [appTheme]);

  const previewTheme = useMemo(
    () => buildPreviewTheme(tokens, previewMode),
    [tokens, previewMode],
  );

  const palette = fallbackFromColors(tokens);
  const colors = tokens.colors ?? {};
  const typography = tokens.typography ?? {};
  const spacing = tokens.spacing ?? {};
  const rounded = tokens.rounded ?? {};
  const elevation = tokens.elevation ?? {};

  const accentHex = hexValue(palette.primary, tokens);
  const grayHex = hexValue(palette.muted, tokens);
  return (
    <div
      data-design-system-print-root
      className="design-system-preview w-full bg-[var(--background)] text-[var(--foreground)]"
    >
      {/* App chrome header */}
      <header className="design-system-print-header border-b border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
          {title ?? "Design System"}
        </h1>
        {description && (
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            {description}
          </p>
        )}
        <div className="design-system-print-hide mt-4 flex justify-center">
          <ThemeToggle mode={previewMode} onChange={setPreviewMode} />
        </div>
      </header>

      {/* Themed preview canvas (Radix-style) */}
      <div
        className="design-system-print-canvas min-h-[480px] bg-[var(--ds-bg)] text-[var(--ds-fg)] transition-[background-color,color] duration-300 ease-out print:min-h-0"
        style={previewTheme.cssVars as React.CSSProperties}
      >
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
          {/* Colors — single print block (inputs, scales, brand swatches) */}
          <div className="design-system-print-section space-y-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <ColorInputReadonly label="Accent" hex={accentHex} />
              <ColorInputReadonly label="Gray" hex={grayHex} />
              <ColorInputReadonly label="Background" hex={previewTheme.background} />
            </div>

            <div className="space-y-8">
              <ColorScaleStrip name="Accent scale" baseHex={accentHex} mode={previewMode} />
              <ColorScaleStrip name="Neutral scale" baseHex={grayHex} mode={previewMode} />
            </div>

          {/* Brand swatches */}
          {Object.keys(colors).length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-muted-fg)]">
                Brand palette
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {Object.entries(colors).slice(0, 12).map(([name, hex]) => (
                  <div
                    key={name}
                    className="overflow-hidden rounded-lg border border-[var(--ds-border)]"
                  >
                    <div
                      className="h-10"
                      style={{ backgroundColor: hexValue(hex, tokens) }}
                    />
                    <div className="bg-[var(--ds-card)] px-2 py-1.5">
                      <p className="truncate text-[9px] font-medium capitalize text-[var(--ds-fg)]">
                        {name.replace(/-/g, " ")}
                      </p>
                      <p className="truncate font-mono text-[8px] text-[var(--ds-muted-fg)]">
                        {hexValue(hex, tokens)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Token panels */}
          <div className="design-system-print-section grid gap-4 md:grid-cols-2">
            {getTypographyScaleEntries(typography).length > 0 && (
              <div className="md:col-span-2">
                <TokenPanel title="Typography" subtitle="Type scale — size, weight, line-height">
                  <TypographyPanel typography={typography} />
                </TokenPanel>
              </div>
            )}
            {Object.keys(spacing).length > 0 && (
              <TokenPanel title="Spacing" subtitle="Margins and paddings">
                <SpacingPanel spacing={spacing} />
              </TokenPanel>
            )}
            {Object.keys(rounded).length > 0 && (
              <TokenPanel title="Border radius" subtitle="Corner tokens for components">
                <RadiusPanel rounded={rounded} />
              </TokenPanel>
            )}
            {Object.keys(elevation).length > 0 && (
              <div className="md:col-span-2">
                <TokenPanel title="Elevation & depth" subtitle="Shadows for hierarchy">
                  <ElevationPanel elevation={elevation} mode={previewMode} />
                </TokenPanel>
              </div>
            )}
          </div>
        </div>

        {/* Playground — hidden when printing (interactive component demos only) */}
        <div className="design-system-print-hide flex w-full min-w-0 justify-center px-2 py-3 sm:px-4 sm:py-4">
          <DesignSystemUIKit
            tokens={tokens}
            embedded
            useDesignVars
            previewMode={previewMode}
          />
        </div>
      </div>
    </div>
  );
}
