import { useMemo } from "react";

interface DesignTokens {
  name?: string;
  description?: string;
  colors?: Record<string, string>;
  typography?: Record<string, {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: number | string;
    lineHeight?: number | string;
    letterSpacing?: string;
  }>;
  rounded?: Record<string, string>;
  spacing?: Record<string, string>;
  components?: Record<string, {
    backgroundColor?: string;
    textColor?: string;
    rounded?: string;
    padding?: string | number;
    size?: string | number;
    height?: string | number;
    width?: string | number;
    typography?: string;
  }>;
}

function resolveRef(value: string, tokens: DesignTokens): string {
  const match = value.match(/^\{([\w.]+)\}$/);
  if (!match) return value;
  const parts = match[1].split(".");
  let obj: unknown = tokens;
  for (const part of parts) {
    if (obj && typeof obj === "object" && part in obj) {
      obj = (obj as Record<string, unknown>)[part];
    } else {
      return value;
    }
  }
  return typeof obj === "string" ? obj : value;
}

function parseYamlFrontMatter(content: string): { frontMatter: DesignTokens | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontMatter: null, body: content };

  const yamlLines = match[1];
  const body = match[2]?.trim() ?? "";
  const tokens: DesignTokens = {};

  let currentSection: string | null = null;
  let currentTypographyKey: string | null = null;

  for (const line of yamlLines.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Detect section headers (colors:, typography:, rounded:, spacing:, components:)
    const sectionMatch = trimmed.match(/^(\w+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Detect typography sub-keys (h1:, body-md:, etc.)
    if (currentSection === "typography") {
      const typoKeyMatch = trimmed.match(/^(\S+):\s*$/);
      if (typoKeyMatch) {
        currentTypographyKey = typoKeyMatch[1];
        if (!tokens.typography) tokens.typography = {};
        tokens.typography[currentTypographyKey] = {};
        continue;
      }
      // Typography field values (fontFamily:, fontSize:, etc.)
      if (currentTypographyKey && tokens.typography?.[currentTypographyKey]) {
        const kvMatch = trimmed.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
        if (kvMatch) {
          const val = kvMatch[2].replace(/["']/g, "");
          (tokens.typography[currentTypographyKey] as Record<string, string>)[kvMatch[1]] = val;
        }
      }
      continue;
    }

    // Handle simple key-value sections (colors:, rounded:, spacing:)
    if (currentSection && ["colors", "rounded", "spacing"].includes(currentSection)) {
      const kvMatch = trimmed.match(/^(\S+):\s*["']?(.+?)["']?\s*$/);
      if (kvMatch) {
        const val = kvMatch[2].replace(/["']/g, "");
        if (!(tokens as Record<string, Record<string, string>>)[currentSection]) {
          (tokens as Record<string, Record<string, string>>)[currentSection] = {};
        }
        (tokens as Record<string, Record<string, string>>)[currentSection][kvMatch[1]] = val;
      }
      continue;
    }

    // Handle components section
    if (currentSection === "components") {
      const compKeyMatch = trimmed.match(/^(\S+):\s*$/);
      if (compKeyMatch) {
        currentTypographyKey = compKeyMatch[1];
        if (!tokens.components) tokens.components = {};
        tokens.components[currentTypographyKey] = {};
        continue;
      }
      if (currentTypographyKey && tokens.components?.[currentTypographyKey]) {
        const kvMatch = trimmed.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
        if (kvMatch) {
          const val = kvMatch[2].replace(/["']/g, "");
          (tokens.components[currentTypographyKey] as Record<string, string>)[kvMatch[1]] = val;
        }
      }
      continue;
    }

    // Top-level fields (version, name, description)
    if (!currentSection) {
      const kvMatch = trimmed.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
      if (kvMatch && ["name", "description", "version"].includes(kvMatch[1])) {
        (tokens as Record<string, string>)[kvMatch[1]] = kvMatch[2].replace(/["']/g, "");
      }
    }
  }

  return { frontMatter: tokens, body };
}

function ColorSwatch({ name, hex, textColor }: { name: string; hex: string; textColor?: string }) {
  const bg = hex.startsWith("#") ? hex : `#${hex}`;
  const fg = textColor ?? (isLightColor(bg) ? "#1A1C1E" : "#FFFFFF");
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg p-3 min-w-[90px] min-h-[80px] gap-1 border border-zinc-600/30"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className="text-[11px] font-medium capitalize">{name}</span>
      <span className="text-[10px] opacity-80 font-mono">{hex}</span>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

function TypographySpec({
  label,
  token,
}: {
  label: string;
  token: { fontFamily?: string; fontSize?: string; fontWeight?: number | string; lineHeight?: number | string; letterSpacing?: string };
}) {
  const style: Record<string, string> = {};
  if (token.fontFamily) style.fontFamily = token.fontFamily;
  if (token.fontSize) style.fontSize = token.fontSize;
  if (token.fontWeight) style.fontWeight = String(token.fontWeight);
  if (token.lineHeight) style.lineHeight = String(token.lineHeight);
  if (token.letterSpacing) style.letterSpacing = token.letterSpacing;

  return (
    <div className="flex items-start gap-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-600/30">
      <div className="min-w-[70px] shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-zinc-100 truncate" style={style}>
          The quick brown fox jumps over the lazy dog 123
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-zinc-500 font-mono">
          {token.fontFamily && <span>{token.fontFamily}</span>}
          {token.fontSize && <span>{token.fontSize}</span>}
          {token.fontWeight && <span>w{token.fontWeight}</span>}
          {token.lineHeight && <span>lh {token.lineHeight}</span>}
          {token.letterSpacing && <span>{token.letterSpacing}</span>}
        </div>
      </div>
    </div>
  );
}

function SpacingScale({ tokens }: { tokens: Record<string, string> | undefined }) {
  if (!tokens || Object.keys(tokens).length === 0) return null;
  return (
    <div className="space-y-2">
      {Object.entries(tokens).map(([key, val]) => {
        const px = parseInt(val.replace("px", "").replace("rem", ""));
        const width = isNaN(px) ? 60 : Math.min(px * 4, 200);
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-8 shrink-0">{key}</span>
            <div className="h-4 rounded bg-amber-500/40" style={{ width: `${Math.max(width, 8)}px` }} />
            <span className="text-[10px] font-mono text-zinc-500">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function ComponentPreview({
  name,
  token,
  tokens,
}: {
  name: string;
  token: { backgroundColor?: string; textColor?: string; rounded?: string; padding?: string | number };
  tokens: DesignTokens;
}) {
  const bg = token.backgroundColor ? resolveRef(token.backgroundColor, tokens) : "#3B82F6";
  const fg = token.textColor ? resolveRef(token.textColor, tokens) : "#FFFFFF";
  const radius = token.rounded ? resolveRef(token.rounded, tokens) : "8px";
  const pad = typeof token.padding === "number" ? `${token.padding}px` : (token.padding ?? "12px");

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{name.replace(/-/g, " ")}</span>
      <div
        className="inline-flex items-center justify-center text-xs font-medium min-h-[32px]"
        style={{ backgroundColor: bg, color: fg, borderRadius: radius, padding: pad }}
      >
        {name.replace(/-/g, " ")}
      </div>
    </div>
  );
}

export function DesignMdPreview({ content }: { content: string }) {
  const { frontMatter } = useMemo(() => parseYamlFrontMatter(content), [content]);

  if (!frontMatter || (!frontMatter.colors && !frontMatter.typography && !frontMatter.components)) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-zinc-500 text-sm">
        No se encontraron tokens de diseño en formato DESIGN.md. Genera la Guía UX/UI para ver la vista previa visual.
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4 space-y-8">
      {/* Header */}
      {frontMatter.name && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{frontMatter.name}</h2>
          {frontMatter.description && (
            <p className="text-sm text-zinc-400 mt-1">{frontMatter.description}</p>
          )}
        </div>
      )}

      {/* Colors */}
      {frontMatter.colors && Object.keys(frontMatter.colors).length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Colors</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(frontMatter.colors).map(([name, hex]) => (
              <ColorSwatch key={name} name={name} hex={hex} />
            ))}
          </div>
        </section>
      )}

      {/* Typography */}
      {frontMatter.typography && Object.keys(frontMatter.typography).length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Typography</h3>
          <div className="space-y-2">
            {Object.entries(frontMatter.typography).map(([key, val]) => (
              <TypographySpec key={key} label={key} token={val} />
            ))}
          </div>
        </section>
      )}

      {/* Spacing */}
      {frontMatter.spacing && Object.keys(frontMatter.spacing).length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Spacing Scale</h3>
          <SpacingScale tokens={frontMatter.spacing} />
        </section>
      )}

      {/* Border Radius */}
      {frontMatter.rounded && Object.keys(frontMatter.rounded).length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Border Radius</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(frontMatter.rounded).map(([key, val]) => {
              const px = parseInt(val.replace("px", ""));
              const size = isNaN(px) ? 32 : Math.min(px * 2, 80);
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 bg-amber-500/30 border border-amber-500/50"
                    style={{ borderRadius: val }}
                  />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{key}</span>
                  <span className="text-[9px] font-mono text-zinc-600">{val}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Components */}
      {frontMatter.components && Object.keys(frontMatter.components).length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Components</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(frontMatter.components).map(([name, token]) => (
              <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function extractDesignMdFrontMatter(content: string): DesignTokens | null {
  return parseYamlFrontMatter(content).frontMatter;
}
