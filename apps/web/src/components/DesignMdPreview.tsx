import { useMemo } from "react";

// ─── Tipos compartidos ─────────────────────────────────────────

interface DesignTokens {
  name?: string;
  version?: string;
  description?: string;
  colors?: Record<string, string>;
  typography?: Record<string, TypographyToken>;
  rounded?: Record<string, string>;
  spacing?: Record<string, string>;
  elevation?: Record<string, string>;
  components?: Record<string, ComponentToken>;
}

interface TypographyToken {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: string;
}

interface ComponentToken {
  backgroundColor?: string;
  textColor?: string;
  rounded?: string;
  padding?: string | number;
  size?: string | number;
  height?: string | number;
  width?: string | number;
  typography?: string;
}

// ─── Resolver referencias tipo "{colors.primary}" ────────────

function resolveRef(value: string, tokens: DesignTokens): string {
  const match = value.match(/^\{([\w.]+)\}$/);
  if (!match) return value;
  const parts = match[1]!.split(".");
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

function hexValue(value: string, tokens: DesignTokens): string {
  const resolved = resolveRef(value, tokens);
  if (resolved.startsWith("#")) return resolved;
  if (/^[A-Fa-f0-9]{6}$/.test(resolved)) return `#${resolved}`;
  return resolved;
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

// ─── Google-style DESIGN.md parser (fallback sin YAML) ───────

const DESIGN_MD_CACHE = new Map<string, DesignTokens | null>();

function parseDesignMdContent(content: string): DesignTokens | null {
  const cached = DESIGN_MD_CACHE.get(content);
  if (cached !== undefined) return cached;

  const tokens: DesignTokens = {};

  // ── Colors ──────────────────────────────────────────────
  const colorsSection = extractSection(content, ["colors", "color"]);
  if (colorsSection) {
    const colors: Record<string, string> = {};
    const colorPatterns = [
      /(?:^|\n)\s*(?:\*\*)?(\w[\w\s-]*?)(?:\*\*)?\s*[:(]\s*[#]?\(?([A-Fa-f0-9]{6})\)?/gm,
      /--[\w-]+:\s*[#]?\(?([A-Fa-f0-9]{6})\)?/g,
    ];
    for (const pattern of colorPatterns) {
      let m: RegExpExecArray | null;
      const re = new RegExp(pattern.source, 'gm');
      while ((m = re.exec(colorsSection)) !== null) {
        if (m[1] && m[2]) {
          const name = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (name) colors[name] = `#${m[2].toUpperCase()}`;
        }
      }
    }
    const cssColorRe = /(\w[\w\s]*?)\s*\((#([A-Fa-f0-9]{6}))\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cssColorRe.exec(colorsSection)) !== null) {
      const name = cm[1]!.toLowerCase().trim().replace(/\s+/g, '-');
      const hex = cm[2]!.toUpperCase();
      if (name && !Object.values(colors).includes(hex)) {
        colors[name] = hex;
      }
    }
    // Markdown table patterns
    // Pattern A: | Name | Middle | #HEX | ... | (hex in col 3)
    const tableReHexCol3 = /\|\s*\*{0,2}([\w\s\-áéíóúñÑ/]+?)\*{0,2}\s*\|[^|]*\|\s*`?(?:#([A-Fa-f0-9]{6}))`?\s*\|/gm;
    for (const re of [tableReHexCol3]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(colorsSection)) !== null) {
        const name = m[1]!.replace(/\*\*/g, '').toLowerCase().trim().replace(/\s+/g, '-');
        const hex = `#${m[2]!.toUpperCase()}`;
        if (name && !Object.values(colors).includes(hex)) {
          colors[name] = hex;
        }
      }
    }
    // Pattern B: | Name | #HEX | ... | (hex in col 2 — common in UX/UI guide)
    const tableReHexCol2 = /\|\s*\*{0,2}([\w\s\-áéíóúñÑ/]+?)\*{0,2}\s*\|\s*`?(?:#([A-Fa-f0-9]{6}))`?\s*\|[^|]*\|/gm;
    {
      let m: RegExpExecArray | null;
      while ((m = tableReHexCol2.exec(colorsSection)) !== null) {
        const name = m[1]!.replace(/\*\*/g, '').toLowerCase().trim().replace(/\s+/g, '-');
        const hex = `#${m[2]!.toUpperCase()}`;
        if (name && !Object.values(colors).includes(hex)) {
          colors[name] = hex;
        }
      }
    }
    if (Object.keys(colors).length > 0) tokens.colors = colors;
  }

  // ── Typography ──────────────────────────────────────────
  const typographySection = extractSection(content, ["typography", "type", "fonts", "font"]);
  if (typographySection) {
    const typography: Record<string, TypographyToken> = {};
    const hierRe = /(h1|h2|h3|h4|h5|h6|body[\s-]?md|body[\s-]?sm|body|label[\s-]?sm|label|small|caption|footnote)\s+(\d+)\s*px\s+(\d{3})\s+(\d+)\s*px\s*([\d.-]+)?\s*(?:em)?/gi;
    let hm: RegExpExecArray | null;
    while ((hm = hierRe.exec(typographySection)) !== null) {
      const key = hm[1]!.toLowerCase().replace(/[\s_]+/g, '-');
      typography[key] = {
        fontSize: `${hm[2]}px`,
        fontWeight: parseInt(hm[3]!),
        lineHeight: `${hm[4]}px`,
        letterSpacing: hm[5] ? `${hm[5]}em` : undefined,
      };
    }
    const tableRe = /\|?\s*(h1|h2|h3|h4|h5|h6|body[\s-]?md|body[\s-]?sm|label[\s-]?sm)\s*\|?\s*(\d+)\s*px?\s*\|?\s*(\d{3})\s*\|?\s*(\d+)\s*px?\s*\|?\s*([\d.-]+)?\s*(?:em)?/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(typographySection)) !== null) {
      const key = tm[1]!.toLowerCase().replace(/[\s_]+/g, '-');
      if (!typography[key]) {
        typography[key] = {
          fontSize: `${tm[2]}px`,
          fontWeight: parseInt(tm[3]!),
          lineHeight: `${tm[4]}px`,
          letterSpacing: tm[5] ? `${tm[5]}em` : undefined,
        };
      }
    }
    if (Object.keys(typography).length > 0) {
      typography['font-sans'] = { fontFamily: "'Inter', system-ui, -apple-system, sans-serif" };
      tokens.typography = typography;
    }
    // Spanish typography table: | Propósito | Fuente | Peso | Tamaños clave |
    // e.g. | Títulos grandes (h1, h2) | Inter | Bold (700) | 32px, 28px |
    const spanishTypoRe = /\|\s*[\w\sáéíóúñÑ()/,]+\s*\|[^|]*\|[^|]*\|\s*([\d]+)px/gi;
    if (Object.keys(typography).length === 0) {
      let stm: RegExpExecArray | null;
      while ((stm = spanishTypoRe.exec(typographySection)) !== null) {
        const size = parseInt(stm[1]!);
        if (!typography['body-md'] && size >= 14 && size <= 18) {
          typography['body-md'] = { fontSize: `${size}px`, fontWeight: 400, lineHeight: `${Math.round(size * 1.5)}px` };
        }
      }
    }
  }

  // ── Components ─────────────────────────────────────────
  const componentsSection = extractSection(content, ["components"]);
  if (componentsSection) {
    const components: Record<string, ComponentToken> = {};
    const compPatterns = componentsSection.split(/\n(?=(?:[A-Z]\w[\w\s]*?)(?:\n|:)|###?\s+)/);
    for (const block of compPatterns) {
      const nameMatch = block.match(/^(?:###?\s+)?([A-Z]\w[\w\s/]+?)(?:\s*:)?(?:\n|$)/m);
      if (!nameMatch) continue;
      const compName = nameMatch[1]!.trim().toLowerCase().replace(/[\s/]+/g, '-');
      if (['overview', 'colors', 'typography', 'layout', 'components', 'elevation', 'shapes', "do's", "don'ts", 'dos', 'donts', 'introduction'].includes(compName)) continue;
      const comp: ComponentToken = {};
      const bgMatch = block.match(/(?:Color|Background|Fondo|Bg)[:\s]+(.+?)(?:\n|$)/i);
      if (bgMatch) {
        const val = bgMatch[1]!.trim();
        const hex = val.match(/#([A-Fa-f0-9]{6})/);
        if (hex) comp.backgroundColor = `#${hex[1]!.toUpperCase()}`;
        else if (val.includes('tertiary') || val.includes('amber') || val.includes('ámbar'))
          comp.backgroundColor = '#F4A261';
        else if (val.includes('primary') || val.includes('azul') || val.includes('blue'))
          comp.backgroundColor = '#1A5F7A';
        else if (val.includes('secondary') || val.includes('verde') || val.includes('green'))
          comp.backgroundColor = '#2E8B57';
        else if (val.includes('neutral') || val.includes('blanco') || val.includes('white') || val.includes('#FFF'))
          comp.backgroundColor = '#FFFFFF';
      }
      const fgMatch = block.match(/(?:Texto|Text|Color de texto)[:\s]+(.+?)(?:\n|$)/i);
      if (fgMatch) {
        const val = fgMatch[1]!.trim();
        if (val.includes('blanco') || val.includes('white') || val.includes('#FFF') || val.includes('#FFFFFF'))
          comp.textColor = '#FFFFFF';
        else if (val.includes('#') && val.match(/#([A-Fa-f0-9]{6})/))
          comp.textColor = `#${val.match(/#([A-Fa-f0-9]{6})/)![1]!.toUpperCase()}`;
        else comp.textColor = '#1A1C1E';
      }
      const rdMatch = block.match(/(?:rounded|border radius|border-radius|redondeado)[.\s:]+(.+?)(?:\n|$)/i);
      if (rdMatch) {
        const val = rdMatch[1]!.trim();
        const px = val.match(/(\d+)\s*px/);
        if (px) comp.rounded = `${px[1]}px`;
        else if (val.includes('sm')) comp.rounded = '6px';
        else if (val.includes('md')) comp.rounded = '12px';
        else if (val.includes('lg')) comp.rounded = '20px';
      }
      const padMatch = block.match(/(?:Padding|pad)[:\s]+(.+?)(?:\n|$)/i);
      if (padMatch) {
        const val = padMatch[1]!.trim();
        const px = val.match(/(\d+)\s*px/);
        if (px) comp.padding = `${px[1]}px`;
      }
      if (comp.backgroundColor || comp.textColor || comp.rounded || comp.padding) {
        components[compName] = comp;
      }
    }
    if (Object.keys(components).length > 0) tokens.components = components;
  }

  DESIGN_MD_CACHE.set(content, Object.keys(tokens).length > 0 ? tokens : null);
  return Object.keys(tokens).length > 0 ? tokens : null;
}

function extractSection(content: string, names: string[]): string | null {
  // Also try Spanish equivalents
  const spanishAliases: Record<string, string[]> = {
    colors: ["colores", "paleta", "color", "paleta de colores"],
    typography: ["tipografía", "tipografia", "fuentes", "fonts"],
    components: ["componentes", "ui clave", "componentes ui"],
    spacing: ["espaciado", "espacio", "layout"],
    elevation: ["elevación", "elevacion", "sombras"],
    shapes: ["formas", "bordes", "border", "rounded"],
  };
  // For each name, also try its Spanish aliases
  const allNames = [...names];
  for (const n of names) {
    const lower = n.toLowerCase();
    if (spanishAliases[lower]) {
      allNames.push(...spanishAliases[lower]);
    }
  }
  for (const name of allNames) {
    const patterns = [
      new RegExp(`##+\\s*\\d*\\.?\\s*${escapeRegex(name)}[^\\n]*(?:\\n(?:[^#][^\\n]*|\\s*)?)*`, 'i'),
      new RegExp(`\\*\\*${escapeRegex(name)}\\*\\*[^\\n]*(?:\\n(?!##|\\*\\*)[^\\n]*)*`, 'i'),
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(content);
      if (m) return m[0];
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── YAML Front-matter parser ────────────────────────────────

function parseYamlFrontMatter(content: string): { frontMatter: DesignTokens | null; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontMatter: null, body: content };

  const rawYaml: string = m[1] ?? "";
  const body: string = (m[2] ?? "").trim();
  const tokens: DesignTokens = {};
  let currentSection: string | null = null;

  const lines = rawYaml.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;

    const sec = t.match(/^(\w+):\s*$/);
    if (sec) {
      currentSection = sec[1]!;
      continue;
    }

    if (currentSection === "typography") {
      const sub = t.match(/^(\S+):\s*$/);
      if (sub) {
        const sk = sub[1]!;
        if (!tokens.typography) tokens.typography = {};
        if (!tokens.typography[sk]) tokens.typography[sk] = {};
        continue;
      }
      const kv = t.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
      if (kv) {
        const k = kv[1]!;
        const v = kv[2]!.replace(/["']/g, "").replace(/\s+#.*$/, "");
        const typoKeys = tokens.typography ? Object.keys(tokens.typography) : [];
        if (typoKeys.length > 0) {
          const lastKey: string = typoKeys[typoKeys.length - 1]!;
          if (!tokens.typography![lastKey]) tokens.typography![lastKey] = {};
          (tokens.typography![lastKey] as Record<string, string>)[k] = v;
        }
      }
      continue;
    }

    if (currentSection === "components") {
      const sub = t.match(/^(\S+):\s*$/);
      if (sub) {
        const sk = sub[1]!;
        if (!tokens.components) tokens.components = {};
        if (!tokens.components[sk]) tokens.components[sk] = {};
        continue;
      }
      const kv = t.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
      if (kv) {
        const k = kv[1]!;
        const v = kv[2]!.replace(/["']/g, "").replace(/\s+#.*$/, "");
        const compKeys = tokens.components ? Object.keys(tokens.components) : [];
        if (compKeys.length > 0) {
          const lastKey: string = compKeys[compKeys.length - 1]!;
          if (!tokens.components![lastKey]) tokens.components![lastKey] = {};
          (tokens.components![lastKey] as Record<string, string>)[k] = v;
        }
      }
      continue;
    }

    if (currentSection && ["colors", "rounded", "spacing", "elevation"].includes(currentSection)) {
      const kv = t.match(/^(\S+):\s*["']?(.+?)["']?\s*$/);
      if (kv) {
        const k = kv[1]!;
        const v = kv[2]!.replace(/["']/g, "").replace(/\s+#.*$/, "");
        const s = tokens as Record<string, Record<string, string>>;
        if (!s[currentSection]) s[currentSection] = {};
        s[currentSection]![k] = v;
      }
      continue;
    }

    if (!currentSection) {
      const kv = t.match(/^(\w+):\s*["']?(.+?)["']?\s*$/);
      if (kv && kv[1] && ["name", "description", "version"].includes(kv[1])) {
        (tokens as Record<string, string>)[kv[1]] = kv[2]!.replace(/["']/g, "").replace(/\s+#.*$/, "");
      }
    }
  }

  return { frontMatter: tokens, body };
}

// ─── Color desciptions from markdown ─────────────────────────

function parseColorDescriptions(body: string, colorKeys: string[]): Record<string, string> {
  const descs: Record<string, string> = {};
  const lines = body.split("\n");
  let currentColor: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "- **Name**: Description" or "- Name (#HEX): Description"
    const colorLine = trimmed.match(/^[-*]\s+\*{0,2}([\w\s-]+?)\*{0,2}\s*(?:\(#[A-Fa-f0-9]+\))?\s*:\s*(.+)/i);
    if (colorLine) {
      const key = colorLine[1]!.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (colorKeys.includes(key) || colorKeys.some(ck => key.includes(ck))) {
        currentColor = key;
        descs[key] = colorLine[2]!.trim();
        continue;
      }
    }
    // Also match CSS var style: "--primary (#HEX): Description"
    const cssLine = trimmed.match(/^--?([\w-]+)\s*\(#[A-Fa-f0-9]+\)\s*:\s*(.+)/i);
    if (cssLine) {
      const key = cssLine[1]!.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (colorKeys.includes(key) || colorKeys.some(ck => key.includes(ck))) {
        currentColor = key;
        descs[key] = cssLine[2]!.trim();
        continue;
      }
    }
    // Continuation of description on next line
    if (currentColor && trimmed && !trimmed.startsWith("-") && !trimmed.startsWith("#") && !trimmed.match(/^--?[\w-]/) && !trimmed.startsWith("|")) {
      descs[currentColor] = (descs[currentColor] || "") + " " + trimmed;
    } else if (trimmed.startsWith("-") || trimmed.startsWith("#")) {
      currentColor = null;
    }
  }
  return descs;
}

// ─── Componente: indicador de sección ────────────────────────

function SectionHeading({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-zinc-500">{number}</span>
      <h3 className="text-lg font-semibold text-zinc-100 mt-1">{title}</h3>
      {subtitle && <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

// ─── Componente: color swatch mejorado ─────────────────────

function ColorSwatch({ name, hex, description }: { name: string; hex: string; description?: string }) {
  const bg = hex.startsWith("#") ? hex : `#${hex}`;
  const fg = isLightColor(bg) ? "#1A1C1E" : "#FFFFFF";
  const label = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex flex-col rounded-lg overflow-hidden border border-zinc-700/40 bg-zinc-900/60 shadow-sm">
      <div
        className="h-16 sm:h-20 flex items-end p-3"
        style={{ backgroundColor: bg }}
      >
        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-black/30 backdrop-blur-sm" style={{ color: fg }}>
          {hex}
        </span>
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs font-medium text-zinc-200" style={{ color: isLightColor(bg) ? undefined : fg }}>
          {label}
        </p>
        {description && (
          <p className="text-[10px] leading-relaxed text-zinc-400">{description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Componente: preview de tipografía (estilo referencia) ──

function TypographySpec({ label, token }: { label: string; token: TypographyToken }) {
  const style: Record<string, string> = {};
  if (token.fontFamily) style.fontFamily = token.fontFamily;
  if (token.fontSize) style.fontSize = token.fontSize;
  if (token.fontWeight) style.fontWeight = String(token.fontWeight);
  if (token.lineHeight) style.lineHeight = String(token.lineHeight);
  if (token.letterSpacing) style.letterSpacing = token.letterSpacing;

  const fontName = token.fontFamily?.includes("Inter") ? "Inter" : token.fontFamily ?? "";

  // Sample text por nivel
  const samples: Record<string, string> = {
    "h1": "Bringing technology to life",
    "h2": "Two patterns, built to the same research foundation",
    "h3": "Section heading",
    "h4": "Sub-section heading",
    "h5": "Component title",
    "h6": "Small heading",
    "body-md": "Lead management for independent consultants and coaches in LATAM.",
    "body-sm": "Track deals, set reminders, and close more sales — all from any device.",
    "label-sm": "Button label",
    "label": "Button label",
    "small": "Small caption text",
    "caption": "Caption goes here",
    "footnote": "Footnote reference",
  };
  const sample = samples[label.toLowerCase()] ?? "The quick brown fox jumps over the lazy dog 123";

  return (
    <div>
      <div className="flex items-center justify-between gap-4 min-h-[3rem] sm:min-h-[3.5rem]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-zinc-100" style={style}>
            {sample}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-zinc-500 font-mono">
        <span>{token.fontSize ?? "—"}</span>
        <span className="text-zinc-600">/</span>
        <span>w{token.fontWeight ?? "—"}</span>
        <span className="text-zinc-600">/</span>
        <span>lh {token.lineHeight ?? "—"}</span>
        {token.letterSpacing && (
          <>
            <span className="text-zinc-600">/</span>
            <span>{token.letterSpacing}</span>
          </>
        )}
        {fontName && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-600">{fontName}</span>
          </>
        )}
      </div>
      <hr className="border-t border-zinc-800 mt-3" />
    </div>
  );
}

// ─── Componente: espacio ────────────────────────────────────

function SpacingScale({ tokens }: { tokens: Record<string, string> | undefined }) {
  if (!tokens || Object.keys(tokens).length === 0) return null;
  return (
    <div className="space-y-2">
      {Object.entries(tokens).map(([key, val]) => {
        const px = parseInt(val.replace("px", "").replace("rem", ""));
        const w = isNaN(px) ? 60 : Math.min(px * 3, 200);
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-8 shrink-0">{key}</span>
            <div className="h-3.5 rounded bg-zinc-600/40" style={{ width: `${Math.max(w, 8)}px` }} />
            <span className="text-[10px] font-mono text-zinc-500">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Border radius preview ──────────────────────────────────

function BorderRadiusPreview({ tokens }: { tokens: Record<string, string> | undefined }) {
  if (!tokens || Object.keys(tokens).length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(tokens).map(([key, val]) => (
        <div key={key} className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 bg-zinc-600/40" style={{ borderRadius: val }} />
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{key}</span>
          <span className="text-[9px] font-mono text-zinc-600">{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Elevation preview ──────────────────────────────────────

function ElevationPreview({ elevation: el }: { elevation: Record<string, string> | undefined }) {
  if (!el || Object.keys(el).length === 0) return null;
  return (
    <div className="space-y-3">
      {Object.entries(el).map(([key, val]) => {
        const shadowValue = typeof val === 'string' ? val : String(val);
        return (
          <div key={key} className="flex items-start gap-4 p-3.5 rounded-lg bg-zinc-800/40 border border-zinc-700/30">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-16 shrink-0">{key}</span>
            <div className="flex-1">
              <div
                className="w-full h-12 rounded-lg bg-zinc-900 flex items-center justify-center"
                style={{ boxShadow: shadowValue }}
              >
                <span className="text-[10px] text-zinc-500 font-mono">{key}</span>
              </div>
              <div className="mt-1.5 text-[9px] font-mono text-zinc-600 break-all">{shadowValue}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente: preview de componentes REALISTAS ──────────

type ComponentType = "button" | "input" | "card" | "badge" | "modal" | "kanban" | "lead" | "skeleton" | "toast" | "generic";

function detectComponentType(name: string): ComponentType {
  const n = name.toLowerCase();
  if (n.includes("button") || n.includes("btn") || n === "boton" || n === "botones") return "button";
  if (n.includes("input") || n.includes("field") || n.includes("textfield")) return "input";
  if (n.includes("card") || n.includes("tarjeta")) return "card";
  if (n.includes("badge") || n.includes("chip") || n.includes("tag") || n.includes("etiqueta") || n.includes("pill")) return "badge";
  if (n.includes("modal") || n.includes("dialog") || n.includes("overlay")) return "modal";
  if (n.includes("kanban") || n.includes("board") || n.includes("pipeline") || n.includes("column")) return "kanban";
  if (n.includes("lead") || n.includes("contact") || n.includes("card-item") || n.includes("contacto")) return "lead";
  if (n.includes("skeleton") || n.includes("loading") || n.includes("placeholder") || n.includes("shimmer")) return "skeleton";
  if (n.includes("toast") || n.includes("notification") || n.includes("snackbar") || n.includes("alert")) return "toast";
  return "generic";
}

function ComponentPreview({ name, token, tokens }: { name: string; token: ComponentToken; tokens: DesignTokens }) {
  const bg = token.backgroundColor ? hexValue(token.backgroundColor, tokens) : "#3B82F6";
  const fg = token.textColor ? hexValue(token.textColor, tokens) : "#FFFFFF";
  const radius = token.rounded ? resolveRef(token.rounded, tokens) : "8px";
  const pad = typeof token.padding === "number" ? `${token.padding}px` : (token.padding ?? "12px 16px");

  const type = detectComponentType(name);
  const displayName = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // ── Button ──────────────────────────────────────
  if (type === "button") {
    const borderRadius = radius;
    const height = typeof token.height === "number" ? `${token.height}px` : "40px";
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{displayName}</span>
        <button
          className="text-sm font-medium cursor-default select-none focus:outline-none"
          style={{
            backgroundColor: bg,
            color: fg,
            borderRadius: borderRadius,
            padding: pad,
            height: height,
            minWidth: "120px",
            border: bg === "transparent" ? `1px solid ${fg}` : "none",
            boxShadow: bg === "transparent" ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          {displayName.replace(/^Button /i, "")}
        </button>
        <p className="text-[9px] text-zinc-500 font-mono mt-1">
          {bg.includes("transparent") || bg === "transparent" ? "Transparent + 1px hairline border" : "Ink pill / 9999px / 40px"}
        </p>
      </div>
    );
  }

  // ── Input ────────────────────────────────────────
  if (type === "input") {
    const labels = ["email", "workspace", "api"];
    const placeholders = ["you@example.com", "Acme Studio", "sk_........"];
    const idx = name.includes("email") ? 0 : name.includes("api") ? 2 : name.includes("workspace") ? 1 : 0;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{displayName}</span>
        <div className="flex flex-col gap-0.5 w-full max-w-[200px]">
          <label className="text-[9px] font-medium text-zinc-400 uppercase tracking-wide">{labels[idx]}</label>
          <div
            className="flex items-center text-[11px] w-full h-9 px-3"
            style={{
              backgroundColor: bg,
              borderRadius: radius,
              border: `1px solid rgba(255,255,255,0.1)`,
              color: fg,
            }}
          >
            <span className="opacity-30">{placeholders[idx]}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Card ─────────────────────────────────────────
  if (type === "card") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div
          className="flex flex-col gap-2 w-full max-w-[200px]"
          style={{
            backgroundColor: bg,
            borderRadius: radius,
            padding: pad,
            border: `1px solid ${isLightColor(bg) ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: isLightColor(bg) ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.15)" }} />
            <div>
              <p className="text-[10px] font-medium" style={{ color: fg }}>Nombre del lead</p>
              <p className="text-[8px]" style={{ color: isLightColor(bg) ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)" }}>lead@email.com</p>
            </div>
          </div>
          <div className="flex gap-1">
            <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: isLightColor(bg) ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)", color: isLightColor(bg) ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }}>Contactado</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: isLightColor(bg) ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)", color: isLightColor(bg) ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }}>$5,000</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Badge ─────────────────────────────────────────
  if (type === "badge") {
    const badgeName = name.replace(/^badge[-\s]/i, "").toUpperCase();
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{displayName}</span>
        <div className="flex flex-wrap gap-2 items-center">
          <div
            className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-2.5 py-1 w-fit"
            style={{
              backgroundColor: bg,
              color: fg,
              borderRadius: radius,
            }}
          >
            {badgeName || "NEW"}
          </div>
        </div>
      </div>
    );
  }

  // ── Modal ─────────────────────────────────────────
  if (type === "modal") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div className="relative w-full max-w-[220px] min-h-[100px] rounded-lg overflow-hidden" style={{ border: `1px solid ${isLightColor(bg) ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}` }}>
          {/* Overlay background */}
          <div className="absolute inset-0" style={{ backgroundColor: bg === "#FFFFFF" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.4)" }} />
          <div
            className="relative mx-auto mt-4 mb-3 w-[85%] rounded-lg p-3"
            style={{
              backgroundColor: bg,
              color: fg,
              borderRadius: radius,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium">Confirmar</span>
              <span className="text-[9px] opacity-40">✕</span>
            </div>
            <p className="text-[9px] opacity-70 mb-2">¿Deseas realizar esta acción?</p>
            <div className="flex justify-end gap-1.5 mt-2">
              <span className="text-[8px] px-2 py-1 rounded opacity-60" style={{ border: `1px solid ${isLightColor(bg) ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"}` }}>Cancelar</span>
              <span className="text-[8px] px-2 py-1 rounded" style={{ backgroundColor: isLightColor(bg) ? "#1A5F7A" : "#F4A261", color: "#FFF" }}>Aceptar</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Kanban Board ─────────────────────────────────
  if (type === "kanban") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div className="flex gap-2 w-full max-w-[260px] min-h-[120px] p-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {["Nuevo", "Contactado", "Propuesta"].map((stage, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1.5 p-1.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              <span className="text-[8px] uppercase tracking-wider opacity-50">{stage}</span>
              <div className="h-6 rounded text-[8px] flex items-center justify-center opacity-60" style={{ backgroundColor: bg, color: fg, borderRadius: radius }}>
                {i + 1}
              </div>
              {i === 1 && (
                <div className="h-6 rounded text-[8px] flex items-center justify-center opacity-40" style={{ backgroundColor: bg, color: fg, borderRadius: radius }}>
                  2
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Lead Card ─────────────────────────────────────
  if (type === "lead") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div
          className="flex flex-col gap-1.5 w-full max-w-[180px] p-3 rounded-lg"
          style={{
            backgroundColor: isLightColor(bg) ? bg : "#1a1a2e",
            borderRadius: radius,
            border: `1px solid ${isLightColor(bg) ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <p className="text-[10px] font-medium" style={{ color: fg }}>María García</p>
          <p className="text-[8px]" style={{ color: isLightColor(bg) ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)" }}>marla@email.com</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: bg, color: fg }}>Contactado</span>
            <span className="text-[8px] opacity-50">$5,000</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Skeleton ──────────────────────────────────────
  if (type === "skeleton") {
    const shimmerBg = isLightColor(bg) ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    const shimmerFg = isLightColor(bg) ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div
          className="flex flex-col gap-2 w-full max-w-[200px] p-3 rounded-lg animate-pulse"
          style={{ backgroundColor: bg, borderRadius: radius, border: `1px solid ${shimmerBg}` }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: shimmerBg }} />
            <div className="flex-1 space-y-1">
              <div className="h-2 rounded w-3/4" style={{ backgroundColor: shimmerBg }} />
              <div className="h-1.5 rounded w-1/2" style={{ backgroundColor: shimmerFg }} />
            </div>
          </div>
          <div className="flex gap-1">
            <div className="h-3 rounded-full w-14" style={{ backgroundColor: shimmerBg }} />
            <div className="h-3 rounded-full w-10" style={{ backgroundColor: shimmerFg }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Toast ─────────────────────────────────────────
  if (type === "toast") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
        <div
          className="flex items-center gap-2 w-full max-w-[220px] px-3 py-2 rounded-lg shadow-lg"
          style={{
            backgroundColor: bg,
            color: fg,
            borderRadius: radius,
            border: `1px solid ${isLightColor(bg) ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          <span className="text-[10px]">✓</span>
          <p className="text-[9px] flex-1">Lead movido a Contactado</p>
          <span className="text-[8px] opacity-50">✕</span>
        </div>
      </div>
    );
  }

  // ── Generic fallback ──────────────────────────────
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{displayName}</span>
      <div
        className="inline-flex items-center justify-center text-[10px] font-medium min-h-[32px] w-fit"
        style={{
          backgroundColor: bg,
          color: fg,
          borderRadius: radius,
          padding: pad,
          border: bg === "transparent" ? `1px solid ${fg}` : "none",
        }}
      >
        {displayName}
      </div>
    </div>
  );
}

// ─── Relleno automático de secciones faltantes ─────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace("#", "");
  if (c.length !== 6) return null;
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function lighten(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * factor,
    rgb.g + (255 - rgb.g) * factor,
    rgb.b + (255 - rgb.b) * factor,
  );
}

function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r * (1 - factor),
    rgb.g * (1 - factor),
    rgb.b * (1 - factor),
  );
}

const DEFAULT_TYPOGRAPHY: Record<string, TypographyToken> = {
  "font-sans": { fontFamily: "'Inter', system-ui, -apple-system, sans-serif" },
  h1: { fontSize: "32px", fontWeight: 700, lineHeight: "40px", letterSpacing: "-0.02em" },
  h2: { fontSize: "24px", fontWeight: 600, lineHeight: "32px", letterSpacing: "-0.01em" },
  h3: { fontSize: "20px", fontWeight: 600, lineHeight: "28px" },
  h4: { fontSize: "18px", fontWeight: 600, lineHeight: "24px" },
  "body-md": { fontSize: "16px", fontWeight: 400, lineHeight: "26px" },
  "body-sm": { fontSize: "14px", fontWeight: 400, lineHeight: "22px" },
  "label-sm": { fontSize: "14px", fontWeight: 500, lineHeight: "20px" },
  caption: { fontSize: "12px", fontWeight: 400, lineHeight: "16px" },
  overline: { fontSize: "10px", fontWeight: 600, lineHeight: "14px", letterSpacing: "0.08em" },
};

const DEFAULT_ROUNDED: Record<string, string> = {
  none: "0px", sm: "6px", md: "12px", lg: "20px", xl: "28px", full: "9999px",
};

const DEFAULT_SPACING: Record<string, string> = {
  xxs: "2px", xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "2xl": "48px", "3xl": "64px",
};

const DEFAULT_ELEVATION: Record<string, string> = {
  card: "0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
  dropdown: "0 4px 6px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)",
  modal: "0 10px 25px rgba(0,0,0,0.15), 0 6px 10px rgba(0,0,0,0.10)",
  sticky: "0 2px 4px rgba(0,0,0,0.05)",
};

export function fillDesignMdDefaults(tokens: DesignTokens | null): DesignTokens | null {
  if (!tokens) return null;
  const t = { ...tokens };

  // Fill colors
  if (t.colors && Object.keys(t.colors).length > 0) {
    const c = { ...t.colors };
    const p = c["primary"] || c["primary"] || "#3B82F6";
    c["primary"] ??= p;
    c["secondary"] ??= p !== "#3B82F6" ? p : "#2E8B57";
    c["tertiary"] ??= p !== "#F4A261" ? "#F4A261" : lighten(p, 0.3);
    c["neutral"] ??= lighten(p, 0.8);
    c["foreground"] ??= darken(p, 0.8) || "#1A1A2E";
    c["background"] ??= "#FFFFFF";
    c["muted"] ??= lighten(p, 0.85);
    c["border"] ??= lighten(p, 0.7);
    c["danger"] ??= "#DC2626";
    c["success"] ??= "#16A34A";
    c["warning"] ??= "#F59E0B";
    c["info"] ??= "#3B82F6";
    t.colors = c;
  }

  // Fill typography
  if (!t.typography || Object.keys(t.typography).length === 0) {
    t.typography = { ...DEFAULT_TYPOGRAPHY };
  }

  // Fill rounded
  if (!t.rounded || Object.keys(t.rounded).length === 0) {
    t.rounded = { ...DEFAULT_ROUNDED };
  }

  // Fill spacing
  if (!t.spacing || Object.keys(t.spacing).length === 0) {
    t.spacing = { ...DEFAULT_SPACING };
  }

  // Fill elevation
  if (!t.elevation || Object.keys(t.elevation).length === 0) {
    (t as any).elevation = { ...DEFAULT_ELEVATION };
  }

  // Fill components
  if (t.colors && (!t.components || Object.keys(t.components).length === 0)) {
    const c = t.colors;
    t.components = {
      "button-primary": { backgroundColor: c["tertiary"] || "#F4A261", textColor: "#FFFFFF", rounded: "{rounded.sm}", padding: "12px 20px", typography: "label-sm" },
      "button-secondary": { backgroundColor: c["primary"] || "#1A5F7A", textColor: "#FFFFFF", rounded: "{rounded.sm}", padding: "12px 20px", typography: "label-sm" },
      "button-ghost": { backgroundColor: "transparent", textColor: c["primary"] || "#1A5F7A", rounded: "{rounded.sm}", padding: "8px 16px" },
      "button-danger": { backgroundColor: "#DC2626", textColor: "#FFFFFF", rounded: "{rounded.sm}", padding: "12px 20px", typography: "label-sm" },
      card: { backgroundColor: c["neutral"] || "#F5F7FA", textColor: c["foreground"] || "#1A1A2E", rounded: "{rounded.md}", padding: "24px" },
      badge: { backgroundColor: c["tertiary"] || "#F4A261", textColor: "#FFFFFF", rounded: "{rounded.full}", padding: "4px 10px" },
      input: { backgroundColor: "#FFFFFF", textColor: c["foreground"] || "#1A1A2E", rounded: "{rounded.sm}", padding: "10px 14px" },
      modal: { backgroundColor: "#FFFFFF", rounded: "{rounded.lg}", padding: "24px" },
      toast: { backgroundColor: c["foreground"] || "#1A1A2E", textColor: "#FFFFFF", rounded: "{rounded.md}", padding: "12px 16px" },
      skeleton: { backgroundColor: c["muted"] || "#E8ECF0", rounded: "{rounded.sm}" },
    };
  }

  return t;
}

// ─── Componente principal ────────────────────────────────────

export function DesignMdPreview({ content }: { content: string }) {
  const frontMatter = useMemo(() => {
    const { frontMatter: yaml } = parseYamlFrontMatter(content);
    const bodyTokens = parseDesignMdContent(content);

    // Merge: YAML frontmatter takes precedence, body markdown fills gaps
    // (e.g. PrimaryHover, Surface, SurfaceHover, Accent defined in body tables)
    if (yaml && (yaml.colors || yaml.typography || yaml.components)) {
      // Merge body tokens into YAML — each section independently
      // (YAML may have typography but no colors, or vice versa)
      if (bodyTokens?.colors) {
        if (yaml.colors) {
          for (const [k, v] of Object.entries(bodyTokens.colors)) {
            if (!(k in yaml.colors)) yaml.colors[k] = v;
          }
        } else {
          yaml.colors = { ...bodyTokens.colors };
        }
      }
      if (bodyTokens?.typography) {
        if (yaml.typography) {
          for (const [k, v] of Object.entries(bodyTokens.typography)) {
            if (!(k in yaml.typography)) yaml.typography[k] = v;
          }
        } else {
          yaml.typography = { ...bodyTokens.typography };
        }
      }
      if (bodyTokens?.components) {
        if (yaml.components) {
          for (const [k, v] of Object.entries(bodyTokens.components)) {
            if (!(k in yaml.components)) yaml.components[k] = v;
          }
        } else {
          yaml.components = { ...bodyTokens.components };
        }
      }
      return fillDesignMdDefaults(yaml);
    }
    return fillDesignMdDefaults(bodyTokens);
  }, [content]);

  const body = useMemo(() => {
    const { body } = parseYamlFrontMatter(content);
    return body;
  }, [content]);

  const title = useMemo(() => {
    if (frontMatter?.name) return frontMatter.name;
    const h1 = content.match(/^#\s+(.+)/m);
    return h1?.[1] ?? "Vista previa de diseño";
  }, [content, frontMatter]);

  const description = useMemo(() => {
    if (frontMatter?.description) return frontMatter.description;
    const overview = extractSection(content, ["overview", "introduction", "intro"]);
    if (overview) {
      const firstLine = overview.split("\n").slice(1).find(l => l.trim() && !l.startsWith("#"));
      return firstLine?.trim() ?? null;
    }
    return null;
  }, [content, frontMatter]);

  if (!frontMatter || (!frontMatter.colors && !frontMatter.typography && !frontMatter.components)) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-zinc-500 text-sm">
        No se encontraron tokens de diseño en formato DESIGN.md. Genera la Guía UX/UI para ver la vista previa visual.
      </div>
    );
  }

  const colors = frontMatter.colors;
  const typography = frontMatter.typography;
  const spacing = frontMatter.spacing;
  const rounded = frontMatter.rounded;
  const elevation = frontMatter.elevation ?? (frontMatter as any).elevation;
  const components = frontMatter.components;

  const colorDescriptions = useMemo(() => {
    if (!colors || Object.keys(colors).length === 0) return {};
    return parseColorDescriptions(body, Object.keys(colors));
  }, [body, colors]);

  // Separate component groups
  const buttonComponents: [string, ComponentToken][] = [];
  const cardComponents: [string, ComponentToken][] = [];
  const badgeComponents: [string, ComponentToken][] = [];
  const inputComponents: [string, ComponentToken][] = [];
  const otherComponents: [string, ComponentToken][] = [];

  if (components) {
    Object.entries(components).forEach(([name, token]) => {
      const type = detectComponentType(name);
      if (type === "button") buttonComponents.push([name, token]);
      else if (type === "card") cardComponents.push([name, token]);
      else if (type === "badge") badgeComponents.push([name, token]);
      else if (type === "input") inputComponents.push([name, token]);
      else otherComponents.push([name, token]);
    });
  }

  return (
    <div className="p-5 space-y-10 max-w-2xl">
      {/* Header */}
      {title && (
        <div>
          <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-zinc-500">DESIGN.md</span>
          <h2 className="text-xl font-semibold text-zinc-100 mt-1">{title}</h2>
          {description && (
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-prose">{description}</p>
          )}
        </div>
      )}

      {/* Colors */}
      {colors && Object.keys(colors).length > 0 && (
        <section>
          <SectionHeading number="01" title="Color Palette" subtitle="Brand colors and surface tokens for the interface." />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(colors).map(([name, hex]) => (
              <ColorSwatch key={name} name={name} hex={hex} description={colorDescriptions[name]} />
            ))}
          </div>
        </section>
      )}

      {/* Typography */}
      {typography && Object.keys(typography).length > 0 && (
        <section>
          <SectionHeading number="02" title="Typography" subtitle="Type scale with font size, weight, line-height, and tracking." />
          <div className="space-y-2">
            {Object.entries(typography).filter(([key]) => key !== 'font-sans').map(([key, val]) => (
              <TypographySpec key={key} label={key} token={val} />
            ))}
          </div>
        </section>
      )}

      {/* Spacing */}
      {spacing && Object.keys(spacing).length > 0 && (
        <section>
          <SectionHeading number="03" title="Spacing Scale" subtitle="Consistent spacing values for margins and paddings." />
          <SpacingScale tokens={spacing} />
        </section>
      )}

      {/* Border Radius */}
      {rounded && Object.keys(rounded).length > 0 && (
        <section>
          <SectionHeading number="04" title="Border Radius" subtitle="Corner radius tokens for components." />
          <BorderRadiusPreview tokens={rounded} />
        </section>
      )}

      {/* Elevation */}
      {elevation && Object.keys(elevation).length > 0 && (
        <section>
          <SectionHeading number="05" title="Elevation & Depth" subtitle="Shadows used to convey hierarchy and layering." />
          <ElevationPreview elevation={elevation} />
        </section>
      )}

      {/* Components */}
      {components && Object.keys(components).length > 0 && (
        <section>
          <SectionHeading number="06" title="Components" subtitle="Reusable UI components and their visual tokens." />

          {buttonComponents.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">Buttons</h4>
              <div className="flex flex-wrap gap-4 items-start">
                {buttonComponents.map(([name, token]) => (
                  <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
                ))}
              </div>
            </div>
          )}

          {inputComponents.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">Inputs & Fields</h4>
              <div className="flex flex-wrap gap-4 items-start">
                {inputComponents.map(([name, token]) => (
                  <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
                ))}
              </div>
            </div>
          )}

          {badgeComponents.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">Badges & Chips</h4>
              <div className="flex flex-wrap gap-4 items-start">
                {badgeComponents.map(([name, token]) => (
                  <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
                ))}
              </div>
            </div>
          )}

          {cardComponents.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">Cards</h4>
              <div className="flex flex-wrap gap-4 items-start">
                {cardComponents.map(([name, token]) => (
                  <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
                ))}
              </div>
            </div>
          )}

          {otherComponents.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">Other Components</h4>
              <div className="flex flex-wrap gap-4 items-start">
                {otherComponents.map(([name, token]) => (
                  <ComponentPreview key={name} name={name} token={token} tokens={frontMatter} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function extractDesignMdFrontMatter(content: string): DesignTokens | null {
  const { frontMatter: yaml } = parseYamlFrontMatter(content);
  const bodyTokens = parseDesignMdContent(content);

  if (yaml && (yaml.colors || yaml.typography || yaml.components)) {
    // Merge body tokens into YAML — each section independently
    if (bodyTokens?.colors) {
      if (yaml.colors) {
        for (const [k, v] of Object.entries(bodyTokens.colors)) {
          if (!(k in yaml.colors)) yaml.colors[k] = v;
        }
      } else {
        yaml.colors = { ...bodyTokens.colors };
      }
    }
    if (bodyTokens?.typography) {
      if (yaml.typography) {
        for (const [k, v] of Object.entries(bodyTokens.typography)) {
          if (!(k in yaml.typography)) yaml.typography[k] = v;
        }
      } else {
        yaml.typography = { ...bodyTokens.typography };
      }
    }
    if (bodyTokens?.components) {
      if (yaml.components) {
        for (const [k, v] of Object.entries(bodyTokens.components)) {
          if (!(k in yaml.components)) yaml.components[k] = v;
        }
      } else {
        yaml.components = { ...bodyTokens.components };
      }
    }
    return yaml;
  }
  return bodyTokens;
}

/**
 * Convierte DesignTokens a string YAML frontmatter para prepender al markdown.
 * Útil cuando el orquestador no devuelve YAML frontmatter en la guía UX/UI.
 */
export function tokensToYamlFrontMatter(tokens: DesignTokens): string {
  const lines: string[] = ["---"];
  if (tokens.name) lines.push(`name: ${JSON.stringify(tokens.name)}`);

  function writeSection(key: string, obj: Record<string, unknown> | undefined, indent = 0): void {
    if (!obj || Object.keys(obj).length === 0) return;
    const pad = "  ".repeat(indent);
    lines.push(`${pad}${key}:`);
    for (const [k, v] of Object.entries(obj)) {
      const innerPad = "  ".repeat(indent + 1);
      if (v !== null && typeof v === "object") {
        lines.push(`${innerPad}${k}:`);
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (typeof sv === "string" || typeof sv === "number") {
            if (typeof sv === "string" && (sv.includes(":") || sv.startsWith("{") || sv.startsWith("#") || sv.includes("'") || sv.includes('"'))) {
              lines.push(`${innerPad}  ${sk}: ${JSON.stringify(sv)}`);
            } else {
              lines.push(`${innerPad}  ${sk}: ${sv}`);
            }
          }
        }
      } else if (typeof v === "string" || typeof v === "number") {
        if (typeof v === "string" && (v.includes(":") || v.startsWith("{") || v.startsWith("#") || v.includes("'"))) {
          lines.push(`${innerPad}${k}: ${JSON.stringify(v)}`);
        } else {
          lines.push(`${innerPad}${k}: ${v}`);
        }
      }
    }
  }

  if (tokens.version) lines.push(`version: ${tokens.version}`);

  writeSection("colors", tokens.colors as Record<string, unknown>);
  writeSection("typography", tokens.typography as Record<string, unknown>);
  writeSection("rounded", tokens.rounded as Record<string, unknown>);
  writeSection("spacing", tokens.spacing as Record<string, unknown>);
  writeSection("elevation", tokens.elevation as Record<string, unknown>);
  writeSection("components", tokens.components as Record<string, unknown>);

  lines.push("---");
  return lines.join("\n");
}

/**
 * Reemplaza el YAML frontmatter del contenido de la guía UX/UI a partir del body markdown.
 * - Si ya tiene YAML frontmatter, lo extrae y regenera desde el body.
 * - Si no tiene YAML frontmatter, lo genera desde el markdown.
 * - Si no se pueden extraer tokens, devuelve el contenido original sin cambios.
 */
export function replaceYamlFrontMatter(content: string, projectName?: string): string {
  const { body } = parseYamlFrontMatter(content);
  const tokens = extractDesignMdFrontMatter(content);
  if (!tokens) return content;
  const filled = fillDesignMdDefaults(tokens);
  if (!filled) return content;
  if (projectName) filled.name = filled.name || projectName;
  const yamlStr = tokensToYamlFrontMatter(filled);
  return yamlStr + "\n\n" + body;
}
