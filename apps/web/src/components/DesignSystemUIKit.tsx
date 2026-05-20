import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  Box,
  Check,
  ChevronDown,
  Globe,
  Grid3X3,
  Hash,
  Heart,
  Image,
  Info,
  Layers,
  Palette,
  Plus,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Square,
  Star,
  Type,
  User,
} from "lucide-react";
import type { ComponentToken, DesignTokens } from "@/components/design-system-types";
import type { PreviewMode } from "@/components/design-system-utils";
import {
  fallbackFromColors,
  hexValue,
  resolveElevation,
  resolveRadius,
} from "@/components/design-system-utils";

function findComponentToken(
  tokens: DesignTokens,
  patterns: RegExp[],
): ComponentToken | null {
  const comps = tokens.components;
  if (!comps) return null;
  for (const pattern of patterns) {
    const entry = Object.entries(comps).find(([name]) => pattern.test(name));
    if (entry) return entry[1];
  }
  return null;
}

interface ThemeStyles {
  primary: string;
  primaryFg: string;
  secondary?: string;
  secondaryFg?: string;
  accent: string;
  fg: string;
  mutedFg: string;
  card: string;
  bg: string;
  border: string;
  muted: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  shadowMd: string;
  shadowSm?: string;
  accentSubtle: string;
  accentBorder: string;
}

function useThemeStyles(tokens: DesignTokens, useDesignVars: boolean): ThemeStyles {
  return useMemo(() => {
    const palette = fallbackFromColors(tokens);
    const primaryToken =
      findComponentToken(tokens, [/button.*primary|primary.*button/i]) ??
      findComponentToken(tokens, [/^button|btn/i]);
    const componentPrimary = primaryToken?.backgroundColor
      ? hexValue(primaryToken.backgroundColor, tokens)
      : palette.primary;
    const componentPrimaryFg = primaryToken?.textColor
      ? hexValue(primaryToken.textColor, tokens)
      : "#FFFFFF";

    const elevationToken = findComponentToken(tokens, [/card|panel|dialog/i]);
    const shadowFromTokens = resolveElevation(
      tokens,
      elevationToken ? undefined : "{elevation.md}",
    );

    if (useDesignVars) {
      return {
        primary: "var(--ds-button-primary-bg, var(--ds-accent))",
        primaryFg: "var(--ds-button-primary-fg, var(--ds-accent-fg))",
        secondary: "var(--ds-button-secondary-bg, var(--ds-color-secondary, var(--ds-accent)))",
        secondaryFg: "var(--ds-button-secondary-fg, #FFFFFF)",
        accent: "var(--ds-accent)",
        fg: "var(--ds-fg)",
        mutedFg: "var(--ds-muted-fg)",
        card: "var(--ds-card)",
        bg: "var(--ds-bg)",
        border: "var(--ds-border)",
        muted: "var(--ds-muted)",
        radiusSm: "var(--ds-radius-sm, var(--ds-radius-md, 6px))",
        radiusMd: "var(--ds-radius-md, 12px)",
        radiusLg: "var(--ds-radius-lg, 20px)",
        shadowMd: "var(--ds-shadow-card, var(--ds-shadow-md))",
        shadowSm: "var(--ds-shadow-sm)",
        accentSubtle: "var(--ds-accent-subtle)",
        accentBorder: "var(--ds-accent-border)",
      };
    }

    return {
      primary: componentPrimary,
      primaryFg: componentPrimaryFg,
      accent: palette.accent,
      fg: "var(--foreground)",
      mutedFg: "var(--foreground-muted)",
      card: "var(--card)",
      bg: "var(--background)",
      border: "var(--border)",
      muted: "var(--muted)",
      radiusSm: resolveRadius(tokens, "{rounded.sm}"),
      radiusMd: resolveRadius(tokens, "{rounded.md}"),
      radiusLg: resolveRadius(tokens, "{rounded.lg}"),
      shadowMd: shadowFromTokens ?? "0 4px 6px rgba(0,0,0,0.08)",
      accentSubtle: palette.muted,
      accentBorder: palette.border,
    };
  }, [tokens, useDesignVars]);
}

function usePlaygroundTypography(tokens: DesignTokens): React.CSSProperties {
  return useMemo(() => {
    const typo = tokens.typography ?? {};
    const body =
      typo["body-md"] ?? typo.body ?? typo["body-sm"] ?? Object.values(typo)[0];
    if (!body) return {};
    return {
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      fontWeight: body.fontWeight,
      lineHeight: body.lineHeight,
      letterSpacing: body.letterSpacing,
    };
  }, [tokens]);
}

function headingStyle(tokens: DesignTokens): React.CSSProperties {
  const typo = tokens.typography ?? {};
  const h = typo.h3 ?? typo.h2 ?? typo.h4;
  if (!h) return {};
  return {
    fontFamily: h.fontFamily,
    fontSize: h.fontSize,
    fontWeight: h.fontWeight,
    lineHeight: h.lineHeight,
    letterSpacing: h.letterSpacing,
  };
}

interface PlaygroundProps {
  tokens: DesignTokens;
  t: ThemeStyles;
  typographyStyle: React.CSSProperties;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [ref, onClose, active]);
}

function ActionsMenu({ t }: { t: ThemeStyles }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const items = [
    { id: "duplicate", label: "Duplicate" },
    { id: "export", label: "Export" },
    { id: "delete", label: "Delete", danger: true },
  ];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-1 border bg-[var(--ds-card)] px-2.5 text-sm font-medium transition-colors",
          "border-[var(--ds-border)] text-[var(--ds-fg)]",
          "hover:bg-[color-mix(in_oklch,var(--ds-muted)_55%,var(--ds-card))]",
          open && "bg-[color-mix(in_oklch,var(--ds-muted)_55%,var(--ds-card))]",
        )}
        style={{ borderRadius: t.radiusMd }}
      >
        Actions
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[148px] overflow-hidden rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] py-1 shadow-lg"
          style={{ boxShadow: t.shadowMd, borderRadius: t.radiusMd }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                "flex w-full px-3 py-1.5 text-left text-xs transition-colors",
                item.danger
                  ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  : "text-[var(--ds-fg)] hover:bg-[color-mix(in_oklch,var(--ds-muted)_50%,var(--ds-card))]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full Radix-style component playground (3 columns). */
function DesignSystemPlayground({ tokens, t, typographyStyle }: PlaygroundProps) {
  const [activeTab, setActiveTab] = useState<"themes" | "primitives" | "icons" | "colors">("colors");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeToolbar, setActiveToolbar] = useState<string | null>("grid");
  const [switchA, setSwitchA] = useState(false);
  const [switchB, setSwitchB] = useState(true);
  const [iconActive, setIconActive] = useState<Record<string, boolean>>({
    star: true,
    bookmark: true,
    globe: false,
    heart: false,
    share: false,
  });
  const [checks, setChecks] = useState<Record<string, boolean>>({
    inbox: false,
    calendar: false,
    search: false,
    finances: true,
    invoice: true,
  });
  const [signup, setSignup] = useState({ name: "", email: "", password: "" });
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({ grid: true });

  const inputBg = "var(--ds-input-bg)";
  const inputFg = "var(--ds-fg)";
  const inputRadius =
    "var(--ds-input-radius, var(--ds-radius-md, 12px))";

  const badgeFilledBg =
    "var(--ds-button-secondary-bg, var(--ds-color-primary, var(--ds-accent-subtle)))";
  const badgeFilledFg =
    "var(--ds-button-secondary-fg, var(--ds-color-foreground, var(--ds-fg)))";

  function toggleIcon(key: string) {
    setIconActive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleCheck(key: string) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const tabs = [
    { id: "themes" as const, label: "Themes" },
    { id: "primitives" as const, label: "Primitives" },
    { id: "icons" as const, label: "Icons" },
    { id: "colors" as const, label: "Colors" },
  ];

  const toolbarIcons = [
    { Icon: Plus, label: "Add" },
    { Icon: Hash, label: "Hash" },
    { Icon: Square, label: "Square" },
    { Icon: Layers, label: "Layers" },
    { Icon: Grid3X3, label: "Grid" },
    { Icon: Type, label: "Type" },
    { Icon: Sparkles, label: "Sparkles" },
    { Icon: Scissors, label: "Scissors" },
    { Icon: Palette, label: "Palette" },
  ];

  /** Spacing between related components inside a group (12px) */
  const stackGap = "gap-3";
  /** Spacing between major UI blocks (16px) */
  const blockGap = "gap-4";
  const columnBlock = "w-full min-w-0";
  const columnPanel = cn(
    columnBlock,
    "rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)]",
  );
  /**
   * Column shell: grows/shrinks with flex-wrap parent so columns stack when the
   * container is narrow (mobile, collapsed workshop panel) and sit side-by-side
   * when there is room (~300px+ per column).
   */
  const columnShell = cn(
    "flex w-full min-w-0 max-w-[340px] flex-[1_1_280px] flex-col sm:flex-[1_1_300px]",
    blockGap,
  );
  /** Horizontal rows that span the full column width with even spacing */
  const spreadRow = cn(
    columnBlock,
    "flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-2",
  );
  /** Flex-wrap layout is container-width aware (unlike viewport-only grid breakpoints). */
  const playgroundLayout =
    "mx-auto flex w-full min-w-0 flex-wrap items-stretch justify-center gap-x-6 gap-y-6 sm:gap-x-8 sm:gap-y-8 lg:gap-x-10";

  return (
    <div className={playgroundLayout} style={typographyStyle}>
      {/* Column 1 — search + left stack */}
      <div className={columnShell}>
        <div
          className={cn(
            columnBlock,
            "flex flex-col overflow-hidden border bg-[var(--ds-card)] transition-[border-color,box-shadow] min-[400px]:flex-row min-[400px]:items-center",
            searchFocused && "ring-2 ring-[color-mix(in_oklch,var(--ds-accent)_35%,transparent)]",
          )}
          style={{
            borderRadius: t.radiusMd,
            borderColor: searchFocused ? "var(--ds-accent)" : "var(--ds-border)",
          }}
        >
          <div className="flex min-w-0 flex-1 items-center">
            <span className="flex shrink-0 items-center pl-3 text-[var(--ds-muted-fg)]">
              <Search className="h-4 w-4" strokeWidth={2} />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search the docs…"
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--ds-fg)] outline-none placeholder:text-[var(--ds-muted-fg)]"
            />
          </div>
          <button
            type="button"
            className="h-9 w-full shrink-0 px-4 text-sm font-medium transition-[filter,opacity] hover:brightness-110 active:scale-[0.98] min-[400px]:w-auto"
            style={{
              backgroundColor: "var(--ds-button-secondary-bg, var(--ds-color-primary, var(--ds-accent)))",
              color: "var(--ds-button-secondary-fg, var(--ds-accent-fg))",
              borderRadius: "var(--ds-button-secondary-radius, var(--ds-radius-sm))",
            }}
          >
            Submit
          </button>
        </div>

        <div className={cn(columnBlock, "flex flex-col", blockGap)}>
          <div
            className={cn(columnBlock, "flex items-start gap-2.5 rounded-lg px-3 py-2.5")}
            style={{
              backgroundColor: t.accentSubtle,
              border: `1px solid ${t.accentBorder}`,
              borderRadius: t.radiusMd,
            }}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: t.primary }} strokeWidth={2} />
            <p className="text-sm text-[var(--ds-fg)]">Please upgrade to the new version.</p>
          </div>

          <TreePanel treeOpen={treeOpen} setTreeOpen={setTreeOpen} t={t} />

          <div className={cn(columnBlock, "flex flex-col", stackGap)}>
            <div className={spreadRow}>
              <span
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: badgeFilledBg,
                  color: badgeFilledFg,
                  borderRadius: t.radiusSm,
                }}
              >
                Fully-featured
              </span>
              {["Built with Radix", "Open source"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--ds-fg)] transition-colors hover:border-[color-mix(in_oklch,var(--ds-accent)_40%,var(--ds-border))] hover:bg-[color-mix(in_oklch,var(--ds-muted)_35%,var(--ds-card))]"
                  style={{ borderColor: t.border, borderRadius: t.radiusSm }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={spreadRow}>
              {(
                [
                  { key: "star", Icon: Star },
                  { key: "bookmark", Icon: Bookmark },
                  { key: "globe", Icon: Globe },
                  { key: "heart", Icon: Heart },
                  { key: "share", Icon: Share2 },
                ] as const
              ).map(({ key, Icon }) => {
                const filled = iconActive[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleIcon(key)}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                      !filled &&
                        "hover:border-[color-mix(in_oklch,var(--ds-accent)_40%,var(--ds-border))] hover:bg-[color-mix(in_oklch,var(--ds-muted)_45%,var(--ds-card))]",
                    )}
                    style={{
                      backgroundColor: filled
                        ? "var(--ds-button-primary-bg, var(--ds-accent))"
                        : "var(--ds-card)",
                      color: filled
                        ? "var(--ds-button-primary-fg, var(--ds-accent-fg))"
                        : "var(--ds-muted-fg)",
                      borderColor: filled
                        ? "var(--ds-button-primary-bg, var(--ds-accent))"
                        : "var(--ds-border)",
                      borderRadius: t.radiusSm,
                    }}
                    aria-pressed={filled}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </button>
                );
              })}
              <ToggleSwitch checked={switchA} onChange={setSwitchA} t={t} label="Off" />
              <ToggleSwitch checked={switchB} onChange={setSwitchB} t={t} label="On" />
            </div>
          </div>

          <div className={cn(columnBlock, "flex flex-col", blockGap)}>
            <UserCard t={t} name="Emily Adams" email="emily.adams@example.com" />
            <UserCard t={t} name="Emily Adams" email="emily.adams@example.com" />
          </div>
        </div>
      </div>

      {/* Column 2 — toolbar + sign up */}
      <div className={columnShell}>
        <div
          className={cn(
            columnBlock,
            "flex w-full flex-col gap-2 min-[360px]:flex-row min-[360px]:items-center",
          )}
        >
          <div className="flex min-w-0 w-full min-[360px]:flex-1 items-center justify-between gap-0.5 overflow-x-auto rounded-full border border-[var(--ds-border)] bg-[var(--ds-card)] p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {toolbarIcons.map(({ Icon, label }) => {
              const active = activeToolbar === label.toLowerCase();
              return (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-pressed={active}
                  onClick={() => setActiveToolbar(label.toLowerCase())}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                    active
                      ? "bg-[color-mix(in_oklch,var(--ds-muted)_70%,var(--ds-card))] text-[var(--ds-fg)]"
                      : "text-[var(--ds-muted-fg)] hover:bg-[color-mix(in_oklch,var(--ds-muted)_60%,var(--ds-card))] hover:text-[var(--ds-fg)]",
                  )}
                  style={{ borderRadius: t.radiusSm }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </button>
              );
            })}
          </div>
          <ActionsMenu t={t} />
        </div>

        <SignUpCard
          tokens={tokens}
          t={t}
          inputBg={inputBg}
          inputFg={inputFg}
          inputRadius={inputRadius}
          signup={signup}
          setSignup={setSignup}
        />
      </div>

      {/* Column 3 — tabs + right stack */}
      <div className={columnShell}>
        <div
          className={cn(
            columnBlock,
            "flex w-full gap-x-4 gap-y-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 lg:justify-end [&::-webkit-scrollbar]:hidden",
          )}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap pb-1 text-sm font-medium transition-colors hover:text-[var(--ds-fg)]",
                activeTab !== tab.id && "text-[var(--ds-muted-fg)]",
              )}
              style={{
                color: activeTab === tab.id ? t.primary : undefined,
                borderBottom:
                  activeTab === tab.id ? `2px solid ${t.primary}` : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={cn(columnBlock, "flex min-h-0 flex-1 flex-col", blockGap)}>
          <div className={cn(columnPanel, "p-3")} style={{ borderRadius: t.radiusMd }}>
            <AvatarGroup t={t} tokens={tokens} />
          </div>

          <div
            className={cn(columnPanel, "flex h-fit shrink-0 flex-col gap-[11px] p-3")}
            style={{ borderRadius: t.radiusMd }}
          >
            <blockquote
              className="border-l-4 py-1 pl-3 text-sm leading-relaxed text-[var(--ds-fg)]"
              style={{ borderColor: t.primary }}
            >
              A modal dialog that interrupts the user with important content and expects a
              response. You can{" "}
              <a
                href="#preview"
                className="underline transition-opacity hover:opacity-80"
                style={{ color: t.primary }}
                onClick={(e) => e.preventDefault()}
              >
                embed links
              </a>{" "}
              inline.
            </blockquote>
            <p className="text-sm leading-relaxed text-[var(--ds-muted-fg)]">
              A modal dialog that interrupts the user with important content and expects a
              response. You can embed links inline.
            </p>
          </div>

          <ul
            className={cn(columnPanel, "flex min-h-0 flex-col gap-2.5 p-3 min-[300px]:flex-1")}
            style={{ borderRadius: t.radiusMd }}
          >
            {[
              { id: "inbox", label: "Respond to urgent emails" },
              { id: "calendar", label: "Review calendar" },
              { id: "search", label: "Read documentation" },
              { id: "finances", label: "Close Q2 finances" },
              { id: "invoice", label: "Review invoice #3456" },
            ].map(({ id, label }) => (
              <li key={id} className="w-full">
                <label className="flex w-full cursor-pointer items-center gap-2.5 text-sm text-[var(--ds-fg)]">
                  <Checkbox checked={checks[id] ?? false} onChange={() => toggleCheck(id)} t={t} />
                  <span className={checks[id] ? "line-through opacity-60" : ""}>{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

}

function ToggleSwitch({
  checked,
  onChange,
  t,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  t: ThemeStyles;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)]"
      style={{ backgroundColor: checked ? t.primary : "var(--ds-muted)" }}
    >
      <span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  t,
}: {
  checked: boolean;
  onChange: () => void;
  t: ThemeStyles;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors hover:border-[color-mix(in_oklch,var(--ds-accent)_50%,var(--ds-border))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-accent)]"
      style={{
        backgroundColor: checked ? t.primary : "var(--ds-card)",
        borderColor: checked ? t.primary : "var(--ds-border)",
        borderRadius: 4,
      }}
    >
      {checked && (
        <Check className="h-3 w-3" style={{ color: t.primaryFg }} strokeWidth={3} />
      )}
    </button>
  );
}

function TreePanel({
  treeOpen,
  setTreeOpen,
  t,
}: {
  treeOpen: Record<string, boolean>;
  setTreeOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  t: ThemeStyles;
}) {
  return (
    <div
      className="w-full min-w-0 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-2 text-sm"
      style={{ borderRadius: t.radiusMd }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[var(--ds-fg)] hover:bg-[color-mix(in_oklch,var(--ds-muted)_50%,var(--ds-card))]"
        onClick={() => setTreeOpen((o) => ({ ...o, box: !o.box }))}
      >
        <Box className="h-4 w-4 text-[var(--ds-muted-fg)]" />
        <span className="font-medium">Box</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[var(--ds-fg)] hover:bg-[color-mix(in_oklch,var(--ds-muted)_50%,var(--ds-card))]"
        onClick={() => setTreeOpen((o) => ({ ...o, grid: !o.grid }))}
      >
        <Grid3X3 className="h-4 w-4 text-[var(--ds-muted-fg)]" />
        <span className="font-medium">Grid</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 transition-transform ${treeOpen.grid ? "rotate-180" : ""}`}
        />
      </button>
      {treeOpen.grid && (
        <div className="ml-4 border-l border-[var(--ds-border)] pl-2">
          {[
            { Icon: Image, label: "Image" },
            { Icon: Image, label: "Image" },
            { Icon: Type, label: "Text" },
          ].map(({ Icon, label }, i) => (
            <button
              key={`${label}-${i}`}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[var(--ds-muted-fg)] transition-colors hover:bg-[color-mix(in_oklch,var(--ds-muted)_50%,var(--ds-card))] hover:text-[var(--ds-fg)]"
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ t, name, email }: { t: ThemeStyles; name: string; email: string }) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3 transition-colors hover:bg-[color-mix(in_oklch,var(--ds-muted)_25%,var(--ds-card))]"
      style={{ borderRadius: t.radiusMd, boxShadow: t.shadowMd }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--ds-brand-1, var(--ds-color-primary, var(--ds-accent)))" }}
      >
        {name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--ds-fg)]">{name}</p>
        <p className="truncate text-xs text-[var(--ds-muted-fg)]">{email}</p>
      </div>
    </div>
  );
}

function SignUpCard({
  tokens,
  t,
  inputBg,
  inputFg,
  inputRadius,
  signup,
  setSignup,
}: {
  tokens: DesignTokens;
  t: ThemeStyles;
  inputBg: string;
  inputFg: string;
  inputRadius: string;
  signup: { name: string; email: string; password: string };
  setSignup: React.Dispatch<React.SetStateAction<{ name: string; email: string; password: string }>>;
}) {
  const inputBaseStyle: React.CSSProperties = {
    backgroundColor: inputBg,
    color: inputFg,
    borderRadius: inputRadius,
    border: "1px solid var(--ds-border)",
  };

  const fieldBlock = "w-full min-w-0";

  return (
    <div
      className={cn(
        fieldBlock,
        "box-border flex w-full flex-col gap-4 border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 sm:p-6 min-[300px]:min-h-0 min-[300px]:flex-1",
      )}
      style={{ borderRadius: t.radiusLg, boxShadow: t.shadowMd }}
    >
      <h3
        className={cn(fieldBlock, "text-lg font-semibold text-[var(--ds-fg)]")}
        style={headingStyle(tokens)}
      >
        Sign up
      </h3>
      <div className={cn(fieldBlock, "flex flex-col gap-[11px]")}>
        {(
          [
            { key: "name" as const, label: "Full name", placeholder: "Emily Adams", type: "text" },
            { key: "email" as const, label: "Email", placeholder: "you@example.com", type: "email" },
            { key: "password" as const, label: "Password", placeholder: "••••••••", type: "password" },
          ] as const
        ).map(({ key, label, placeholder, type }) => (
          <div key={key} className={fieldBlock}>
            <label className="mb-1.5 block w-full text-sm font-medium text-[var(--ds-fg)]">
              {label}
            </label>
            <input
              type={type}
              value={signup[key]}
              onChange={(e) => setSignup((s) => ({ ...s, [key]: e.target.value }))}
              placeholder={placeholder}
              className="box-border h-10 w-full min-w-0 px-3 text-sm text-[var(--ds-fg)] outline-none placeholder:text-[var(--ds-muted-fg)] transition-[border-color,box-shadow] hover:border-[color-mix(in_oklch,var(--ds-accent)_30%,var(--ds-border))] focus:border-[var(--ds-accent)] focus:ring-2 focus:ring-[color-mix(in_oklch,var(--ds-accent)_35%,transparent)]"
              style={inputBaseStyle}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className={cn(
          fieldBlock,
          "h-10 text-sm font-medium transition-[filter,transform] hover:brightness-110 active:scale-[0.99]",
        )}
        style={{
          backgroundColor: t.primary,
          color: t.primaryFg,
          borderRadius: "var(--ds-button-primary-radius, var(--ds-radius-sm))",
        }}
      >
        Create account
      </button>
      <div className={cn(fieldBlock, "flex items-center gap-3")}>
        <div className="min-h-px min-w-0 flex-1 border-t border-[var(--ds-border)]" />
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--ds-muted-fg)]">
          OR
        </span>
        <div className="min-h-px min-w-0 flex-1 border-t border-[var(--ds-border)]" />
      </div>
      <button
        type="button"
        className={cn(
          fieldBlock,
          "flex h-10 items-center justify-center gap-2 border text-sm font-medium transition-colors hover:border-[color-mix(in_oklch,var(--ds-accent)_35%,var(--ds-border))] hover:bg-[color-mix(in_oklch,var(--ds-muted)_40%,var(--ds-card))] active:scale-[0.99]",
        )}
        style={{
          backgroundColor: "var(--ds-button-ghost-bg, var(--ds-card))",
          color: "var(--ds-button-ghost-fg, var(--ds-fg))",
          borderColor: "var(--ds-border)",
          borderRadius: "var(--ds-button-ghost-radius, var(--ds-radius-sm))",
        }}
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.02.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        Continue with GitHub
      </button>
    </div>
  );
}

function AvatarGroup({ t }: { t: ThemeStyles; tokens: DesignTokens }) {
  const avatars = [
    { type: "initials" as const, text: "V", brandVar: "--ds-brand-1" },
    { type: "initials" as const, text: "BG", brandVar: "--ds-brand-2" },
    { type: "icon" as const, brandVar: null },
    { type: "initials" as const, text: "JD", brandVar: "--ds-brand-3" },
    { type: "initials" as const, text: "AK", brandVar: "--ds-brand-4" },
  ];

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-between">
      {avatars.map((a, i) => (
        <div
          key={i}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--ds-card)] text-xs font-semibold text-white"
          style={{
            backgroundColor:
              a.type === "initials"
                ? `var(${a.brandVar}, var(--ds-accent))`
                : "var(--ds-muted)",
            boxShadow: t.shadowSm,
          }}
        >
          {a.type === "icon" ? (
            <User className="h-4 w-4 text-[var(--ds-muted-fg)]" />
          ) : (
            a.text
          )}
        </div>
      ))}
    </div>
  );
}

interface DesignSystemUIKitProps {
  tokens: DesignTokens;
  embedded?: boolean;
  useDesignVars?: boolean;
  previewMode?: PreviewMode;
}

export function DesignSystemUIKit({
  tokens,
  embedded = false,
  useDesignVars = false,
}: DesignSystemUIKitProps) {
  const t = useThemeStyles(tokens, useDesignVars);
  const typographyStyle = usePlaygroundTypography(tokens);

  if (embedded && useDesignVars) {
    return (
      <section aria-label="UI Kit playground" className="mx-auto w-full min-w-0 max-w-full text-left">
        <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-[var(--ds-muted-fg)]">
          Component preview
        </h3>
        <DesignSystemPlayground tokens={tokens} t={t} typographyStyle={typographyStyle} />
      </section>
    );
  }

  const borderClass = useDesignVars ? "border-[var(--ds-border)]" : "border-[var(--border)]";
  const cardBg = useDesignVars ? "bg-[var(--ds-card)]" : "bg-[color-mix(in_oklch,var(--card)_90%,var(--background))]";
  const fgClass = useDesignVars ? "text-[var(--ds-fg)]" : "text-[var(--foreground)]";
  const mutedClass = useDesignVars ? "text-[var(--ds-muted-fg)]" : "text-[var(--foreground-muted)]";

  return (
    <section
      aria-label="UI Kit playground"
      className={`overflow-hidden rounded-xl border ${borderClass} ${embedded && useDesignVars ? "bg-transparent shadow-none" : `${cardBg} shadow-sm`}`}
    >
      <div className={`border-b ${borderClass} px-4 py-3`}>
        {!embedded && (
          <div className="mb-3 flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-border)] text-[var(--primary)]"
              aria-hidden
            >
              <Layers className="h-4 w-4" strokeWidth={2} />
            </div>
            <div>
              <h3 className={`text-sm font-semibold ${fgClass}`}>Component preview</h3>
              <p className={`text-[11px] ${mutedClass}`}>
                Interactive examples wearing your design tokens
              </p>
            </div>
          </div>
        )}
        {embedded && (
          <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wider ${mutedClass}`}>
            Component preview
          </h3>
        )}
      </div>

      <div
        className={useDesignVars ? "bg-[var(--ds-playground-bg)] p-4 sm:p-6" : "p-4 sm:p-6"}
      >
        <DesignSystemPlayground tokens={tokens} t={t} typographyStyle={typographyStyle} />
      </div>
    </section>
  );
}
