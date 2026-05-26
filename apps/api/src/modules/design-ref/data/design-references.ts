/**
 * Catálogo de 54 Design References extraídos del skill popular-web-designs.
 * Cada referencia contiene metadata + tokens clave para inyectar en prompts de Guía UX/UI.
 *
 * Fuente: Hermes Agent skill popular-web-designs (VoltAgent/awesome-design-md)
 */

export interface DesignReference {
  /** Slug único (ej. "stripe", "linear-app") */
  slug: string;
  /** Nombre visible */
  name: string;
  /** Categoría */
  category: DesignCategory;
  /** Descripción corta del estilo */
  style: string;
  /** Tags para matching automático */
  tags: string[];
  /** Paleta de colores clave (valores normativos) */
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    text?: string;
    textSecondary?: string;
    border?: string;
  };
  /** Sugerencia de tipografía principal */
  fonts?: {
    primary: string;
    mono?: string;
  };
  /** Descripción extendida para inyectar en prompts */
  description: string;
}

export type DesignCategory =
  | "ai-ml"
  | "developer-tools"
  | "infra-cloud"
  | "design-productivity"
  | "fintech"
  | "enterprise-consumer";

export const DESIGN_CATEGORIES: Record<DesignCategory, string> = {
  "ai-ml": "AI & Machine Learning",
  "developer-tools": "Developer Tools & Platforms",
  "infra-cloud": "Infrastructure & Cloud",
  "design-productivity": "Design & Productivity",
  "fintech": "Fintech & Crypto",
  "enterprise-consumer": "Enterprise & Consumer",
};

/**
 * Todas las 54 design references.
 */
export const DESIGN_REFERENCES: DesignReference[] = [
  // ============ AI & Machine Learning ============
  {
    slug: "claude",
    name: "Anthropic Claude",
    category: "ai-ml",
    style: "Warm terracotta accent, clean editorial layout",
    tags: ["editorial", "warm", "serif", "ai", "content", "premium"],
    colors: {
      primary: "#c96442",
      secondary: "#5e5d59",
      accent: "#d97757",
      background: "#f5f4ed",
      surface: "#faf9f5",
      text: "#141413",
      textSecondary: "#87867f",
      border: "#f0eee6",
    },
    fonts: { primary: "Georgia / Anthropic Serif", mono: "Courier New" },
    description: "Paleta cálida tipo pergamino, tipografía serif con aire editorial. Tonos terracota, grises con matiz amarillo-marrón. Ideal para contenido y productos que quieren transmitir calidez intelectual y confianza.",
  },
  {
    slug: "cohere",
    name: "Cohere",
    category: "ai-ml",
    style: "Vibrant gradients, data-rich dashboard aesthetic",
    tags: ["gradients", "dark", "data-dense", "ai", "developer"],
    colors: {
      primary: "#39594d",
      secondary: "#1d4b5c",
      accent: "#d4a25c",
      background: "#0d1117",
      text: "#e6edf3",
      textSecondary: "#8b949e",
    },
    fonts: { primary: "Inter" },
    description: "Estilo oscuro con gradientes vibrantes. Ideal para dashboards de datos y productos AI con mucha información.",
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    category: "ai-ml",
    style: "Dark cinematic UI, audio-waveform aesthetics",
    tags: ["dark", "cinematic", "audio", "ai", "creative"],
    colors: {
      primary: "#3b82f6",
      accent: "#a855f7",
      background: "#0a0a0f",
      surface: "#14141f",
      text: "#fafafa",
      textSecondary: "#888899",
      border: "#1e1e2e",
    },
    fonts: { primary: "Inter" },
    description: "UI oscura cinematográfica, estética de formas de onda. Ideal para productos de audio, voz y medios creativos.",
  },
  {
    slug: "minimax",
    name: "Minimax",
    category: "ai-ml",
    style: "Bold dark interface with neon accents",
    tags: ["dark", "neon", "bold", "ai", "gaming"],
    colors: {
      primary: "#00f0ff",
      accent: "#ff00e5",
      background: "#0a0a0f",
      surface: "#14141f",
      text: "#fafafa",
      textSecondary: "#666680",
    },
    fonts: { primary: "Inter" },
    description: "Interfaz oscura audaz con acentos neón. Impactante y moderno, ideal para productos AI que buscan diferenciarse.",
  },
  {
    slug: "mistral-ai",
    name: "Mistral AI",
    category: "ai-ml",
    style: "French-engineered minimalism, purple-toned",
    tags: ["minimal", "purple", "french", "ai", "elegant"],
    colors: {
      primary: "#6c47ff",
      accent: "#8b6fff",
      background: "#ffffff",
      text: "#1a1a2e",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Minimalismo de ingeniería francesa. Tonos púrpura, limpio y elegante. Para productos AI con personalidad refinada.",
  },
  {
    slug: "ollama",
    name: "Ollama",
    category: "ai-ml",
    style: "Terminal-first, monochrome simplicity",
    tags: ["terminal", "monochrome", "minimal", "developer", "open-source"],
    colors: {
      primary: "#808080",
      background: "#000000",
      surface: "#111111",
      text: "#ffffff",
      textSecondary: "#808080",
      border: "#333333",
    },
    fonts: { primary: "system-ui", mono: "monospace" },
    description: "Estilo terminal-first, monocromático y mínimo. Sin adornos, puro contenido técnico. Ideal para proyectos open-source, CLI y desarrolladores.",
  },
  {
    slug: "opencode-ai",
    name: "OpenCode AI",
    category: "ai-ml",
    style: "Developer-centric dark theme, full monospace",
    tags: ["dark", "monospace", "developer", "code", "terminal"],
    colors: {
      primary: "#58a6ff",
      background: "#0d1117",
      surface: "#161b22",
      text: "#c9d1d9",
      textSecondary: "#8b949e",
      border: "#30363d",
    },
    fonts: { primary: "system-ui", mono: "JetBrains Mono" },
    description: "Tema oscuro centrado en desarrolladores. Monospace como tipografía principal. Ideal para coding tools, CLIs y plataformas developer.",
  },
  {
    slug: "replicate",
    name: "Replicate",
    category: "ai-ml",
    style: "Clean white canvas, code-forward",
    tags: ["light", "clean", "code", "ai", "developer"],
    colors: {
      primary: "#1a1a1a",
      accent: "#6c47ff",
      background: "#ffffff",
      surface: "#f6f6f6",
      text: "#1a1a1a",
      textSecondary: "#666666",
    },
    fonts: { primary: "Inter", mono: "JetBrains Mono" },
    description: "Lienzo blanco limpio, código como elemento central. Estilo funcional y directo para plataformas AI/ML.",
  },
  {
    slug: "runwayml",
    name: "RunwayML",
    category: "ai-ml",
    style: "Cinematic dark UI, media-rich layout",
    tags: ["dark", "cinematic", "media", "ai", "creative"],
    colors: {
      primary: "#6366f1",
      accent: "#a855f7",
      background: "#050505",
      surface: "#111111",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "Inter" },
    description: "UI oscura cinematográfica ideal para productos de medios y creativos. Layout rico en contenido visual.",
  },
  {
    slug: "together-ai",
    name: "Together AI",
    category: "ai-ml",
    style: "Technical, blueprint-style design",
    tags: ["technical", "blueprint", "developer", "ai", "clean"],
    colors: {
      primary: "#6366f1",
      background: "#ffffff",
      surface: "#f9fafb",
      text: "#111827",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Diseño técnico estilo blueprint. Limpio y profesional, ideal para plataformas AI de infraestructura.",
  },
  {
    slug: "voltagent",
    name: "VoltAgent",
    category: "ai-ml",
    style: "Void-black canvas, emerald accent, terminal-native",
    tags: ["dark", "terminal", "emerald", "developer", "ai"],
    colors: {
      primary: "#00c853",
      accent: "#00e676",
      background: "#000000",
      surface: "#0a0a0a",
      text: "#e0e0e0",
      textSecondary: "#616161",
      border: "#1a1a1a",
    },
    fonts: { primary: "system-ui", mono: "JetBrains Mono" },
    description: "Lienzo negro profundo con acentos esmeralda vibrantes. Estética terminal-native con sensación tecnológica premium.",
  },
  {
    slug: "x-ai",
    name: "xAI",
    category: "ai-ml",
    style: "Stark monochrome, futuristic minimalism, full monospace",
    tags: ["dark", "monochrome", "futuristic", "minimal", "monospace", "ai"],
    colors: {
      primary: "#ffffff",
      background: "#000000",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "system-ui", mono: "monospace" },
    description: "Monocromático severo, minimalismo futurista. Monospace dominante. Para productos AI que buscan una identidad rompedora.",
  },

  // ============ Developer Tools & Platforms ============
  {
    slug: "cursor",
    name: "Cursor",
    category: "developer-tools",
    style: "Sleek dark interface, warm accent",
    tags: ["dark", "sleek", "warm", "editor", "developer"],
    colors: {
      primary: "#f54e00",
      accent: "#cf2d56",
      background: "#f2f1ed",
      surface: "#ebeae5",
      text: "#26251e",
      textSecondary: "rgba(38,37,30,0.55)",
      border: "rgba(38,37,30,0.1)",
    },
    fonts: { primary: "Inter" },
    description: "Interfaz elegante con acentos naranja/coral cálidos. Basado en VS Code, con un look moderno y accesible para desarrolladores.",
  },
  {
    slug: "expo",
    name: "Expo",
    category: "developer-tools",
    style: "Dark theme, tight letter-spacing, code-centric",
    tags: ["dark", "code", "mobile", "developer", "react-native"],
    colors: {
      primary: "#4630eb",
      accent: "#00b4d8",
      background: "#0a0a0f",
      surface: "#14141f",
      text: "#e6edf3",
      textSecondary: "#8b949e",
    },
    fonts: { primary: "Inter" },
    description: "Tema oscuro centrado en código móvil. Tipografía ajustada y profesional. Ideal para herramientas de desarrollo React Native.",
  },
  {
    slug: "linear-app",
    name: "Linear",
    category: "developer-tools",
    style: "Ultra-minimal dark-mode, precise, purple accent",
    tags: ["dark", "minimal", "purple", "precise", "developer", "project-management"],
    colors: {
      primary: "#5e6ad2",
      secondary: "#7170ff",
      accent: "#828fff",
      background: "#08090a",
      surface: "#0f1011",
      text: "#f7f8f8",
      textSecondary: "#8a8f98",
      border: "rgba(255,255,255,0.08)",
    },
    fonts: { primary: "Inter", mono: "JetBrains Mono" },
    description: "Modo oscuro ultra-minimalista. Negro profundo (#08090a) con acentos índigo-violeta. Tipografía Inter con peso 510 característico. Bordes semitransparentes blancos. El estándar de diseño para herramientas developer.",
  },
  {
    slug: "lovable",
    name: "Lovable",
    category: "developer-tools",
    style: "Playful gradients, friendly dev aesthetic",
    tags: ["gradients", "playful", "friendly", "developer", "ai"],
    colors: {
      primary: "#6366f1",
      accent: "#ec4899",
      background: "#ffffff",
      text: "#0f172a",
      textSecondary: "#64748b",
    },
    fonts: { primary: "Inter" },
    description: "Gradientes divertidos y estética amigable para desarrolladores. Moderno y accesible.",
  },
  {
    slug: "mintlify",
    name: "Mintlify",
    category: "developer-tools",
    style: "Clean, green-accented, reading-optimized",
    tags: ["light", "green", "documentation", "reading", "developer"],
    colors: {
      primary: "#0d9373",
      accent: "#0ab193",
      background: "#ffffff",
      surface: "#fafafa",
      text: "#0f172a",
      textSecondary: "#64748b",
      border: "#e2e8f0",
    },
    fonts: { primary: "Inter" },
    description: "Limpio y optimizado para lectura. Acentos verdes. El estándar para documentación técnica moderna.",
  },
  {
    slug: "posthog",
    name: "PostHog",
    category: "developer-tools",
    style: "Playful branding, developer-friendly dark UI",
    tags: ["dark", "playful", "branding", "developer", "analytics"],
    colors: {
      primary: "#f54e00",
      background: "#0a0a0a",
      surface: "#141414",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "Inter" },
    description: "Marca lúdica con UI oscura amigable para desarrolladores. Personalidad fuerte y distintiva para herramientas de analytics.",
  },
  {
    slug: "raycast",
    name: "Raycast",
    category: "developer-tools",
    style: "Sleek dark chrome, vibrant gradient accents",
    tags: ["dark", "sleek", "gradients", "developer", "productivity"],
    colors: {
      primary: "#6366f1",
      accent: "#22d3ee",
      background: "#0f0f0f",
      surface: "#1a1a1a",
      text: "#ffffff",
      textSecondary: "#a1a1aa",
    },
    fonts: { primary: "Inter" },
    description: "Chrome oscuro elegante con gradientes vibrantes. Estilo productividad premium. Referente en UX de herramientas developer.",
  },
  {
    slug: "resend",
    name: "Resend",
    category: "developer-tools",
    style: "Minimal dark theme, monospace accents",
    tags: ["dark", "minimal", "monospace", "developer", "email"],
    colors: {
      primary: "#000000",
      accent: "#6366f1",
      background: "#000000",
      surface: "#0f0f0f",
      text: "#ffffff",
      textSecondary: "#a1a1aa",
    },
    fonts: { primary: "Inter", mono: "JetBrains Mono" },
    description: "Tema oscuro mínimo con acentos monospace. Limpio y funcional para APIs de email.",
  },
  {
    slug: "sentry",
    name: "Sentry",
    category: "developer-tools",
    style: "Dark dashboard, data-dense, pink-purple accent",
    tags: ["dark", "dashboard", "data-dense", "developer", "monitoring"],
    colors: {
      primary: "#362d59",
      accent: "#b100cd",
      background: "#0b0c0e",
      surface: "#141518",
      text: "#e2e4e7",
      textSecondary: "#94979c",
    },
    fonts: { primary: "Rubik" },
    description: "Dashboard oscuro denso en datos con acentos rosas y púrpura. Ideal para monitoreo, errores y dashboards analíticos.",
  },
  {
    slug: "supabase",
    name: "Supabase",
    category: "developer-tools",
    style: "Dark emerald theme, code-first developer tool",
    tags: ["dark", "emerald", "code-first", "developer", "database", "open-source"],
    colors: {
      primary: "#3ecf8e",
      accent: "#00c573",
      background: "#0f0f0f",
      surface: "#171717",
      text: "#fafafa",
      textSecondary: "#b4b4b4",
      border: "#242424",
    },
    fonts: { primary: "DM Sans / Inter" },
    description: "Tema oscuro esmeralda. Fondo #171717 con acentos verde brillante (#3ecf8e). Ideal para developer tools, backend-as-a-service y open-source.",
  },
  {
    slug: "superhuman",
    name: "Superhuman",
    category: "developer-tools",
    style: "Premium dark UI, keyboard-first, purple glow",
    tags: ["dark", "premium", "purple", "keyboard-first", "productivity"],
    colors: {
      primary: "#6c5ce7",
      background: "#0a0a0f",
      surface: "#14141f",
      text: "#ffffff",
      textSecondary: "#666680",
    },
    fonts: { primary: "Inter" },
    description: "UI oscura premium. Primer teclado, brillo púrpura. Productividad de lujo para profesionales exigentes.",
  },
  {
    slug: "vercel",
    name: "Vercel",
    category: "developer-tools",
    style: "Black and white precision, Geist font system",
    tags: ["light", "minimal", "black-white", "developer", "deployment", "geist"],
    colors: {
      primary: "#171717",
      accent: "#0072f5",
      background: "#ffffff",
      text: "#171717",
      textSecondary: "#4d4d4d",
      border: "rgba(0,0,0,0.08)",
    },
    fonts: { primary: "Geist / Inter", mono: "Geist Mono / JetBrains Mono" },
    description: "Precisión en blanco y negro con sistema tipográfico Geist. Acento azul (#0072f5). El estándar de diseño para plataformas de deployment y developer tools. Fondo blanco inmaculado con sombras sutiles.",
  },
  {
    slug: "warp",
    name: "Warp",
    category: "developer-tools",
    style: "Dark IDE-like interface, block-based command UI",
    tags: ["dark", "terminal", "ide", "developer", "blocks"],
    colors: {
      primary: "#8250df",
      background: "#0d1117",
      surface: "#161b22",
      text: "#c9d1d9",
      textSecondary: "#8b949e",
    },
    fonts: { primary: "Inter", mono: "JetBrains Mono" },
    description: "Interfaz tipo IDE oscura con UI de comandos por bloques. Moderno y técnico para terminales inteligentes.",
  },
  {
    slug: "zapier",
    name: "Zapier",
    category: "developer-tools",
    style: "Warm orange, friendly illustration-driven",
    tags: ["light", "orange", "friendly", "illustration", "automation"],
    colors: {
      primary: "#ff4a00",
      accent: "#ff6f00",
      background: "#ffffff",
      surface: "#fcfcfc",
      text: "#1a1a1a",
      textSecondary: "#666666",
    },
    fonts: { primary: "Inter" },
    description: "Naranja cálido como identidad. Impulsado por ilustraciones amigables. Para plataformas de automatización y herramientas accesibles.",
  },

  // ============ Infrastructure & Cloud ============
  {
    slug: "clickhouse",
    name: "ClickHouse",
    category: "infra-cloud",
    style: "Yellow-accented, technical documentation style",
    tags: ["yellow", "technical", "documentation", "database", "infra"],
    colors: {
      primary: "#f4c642",
      accent: "#f0b429",
      background: "#ffffff",
      surface: "#f9fafb",
      text: "#1a202c",
      textSecondary: "#718096",
    },
    fonts: { primary: "Inter" },
    description: "Acentos amarillos distintivos. Estilo de documentación técnica. Ideal para bases de datos y herramientas de infra.",
  },
  {
    slug: "composio",
    name: "Composio",
    category: "infra-cloud",
    style: "Modern dark with colorful integration icons",
    tags: ["dark", "modern", "integrations", "infra", "developer"],
    colors: {
      primary: "#6366f1",
      background: "#0d1117",
      surface: "#161b22",
      text: "#c9d1d9",
      textSecondary: "#8b949e",
    },
    fonts: { primary: "Inter" },
    description: "Oscuro moderno con iconos de integración coloridos. Para plataformas de infraestructura y conexiones.",
  },
  {
    slug: "hashicorp",
    name: "HashiCorp",
    category: "infra-cloud",
    style: "Enterprise-clean, black and white",
    tags: ["light", "enterprise", "black-white", "infra", "professional"],
    colors: {
      primary: "#000000",
      background: "#ffffff",
      text: "#000000",
      textSecondary: "#666666",
    },
    fonts: { primary: "Inter" },
    description: "Limpieza enterprise en blanco y negro. Serio, profesional, sin adornos. Infraestructura corporativa.",
  },
  {
    slug: "mongodb",
    name: "MongoDB",
    category: "infra-cloud",
    style: "Green leaf branding, developer documentation focus",
    tags: ["green", "documentation", "developer", "database", "enterprise"],
    colors: {
      primary: "#00ed64",
      accent: "#00684a",
      background: "#ffffff",
      surface: "#f4fbf7",
      text: "#001e2b",
      textSecondary: "#6e8c7c",
    },
    fonts: { primary: "Inter", mono: "Source Code Pro" },
    description: "Marca verde hoja con enfoque en documentación developer. Fresco, profesional, corporativo.",
  },
  {
    slug: "sanity",
    name: "Sanity",
    category: "infra-cloud",
    style: "Red accent, content-first editorial layout",
    tags: ["light", "red", "editorial", "content", "cms"],
    colors: {
      primary: "#f03e2f",
      accent: "#e01e1e",
      background: "#ffffff",
      surface: "#fafafa",
      text: "#1a1a1a",
      textSecondary: "#666666",
    },
    fonts: { primary: "Space Grotesk" },
    description: "Acento rojo distintivo. Layout editorial content-first. Plataforma de contenido y CMS moderna.",
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "infra-cloud",
    style: "Signature purple gradients, weight-300 elegance",
    tags: ["light", "purple", "elegant", "fintech", "premium", "gradients"],
    colors: {
      primary: "#533afd",
      accent: "#4434d4",
      background: "#ffffff",
      text: "#061b31",
      textSecondary: "#64748d",
      border: "#e5edf5",
    },
    fonts: { primary: "Source Sans 3 / Inter", mono: "Source Code Pro" },
    description: "Púrpura signature (#533afd) con gradientes azulados. Tipografía peso 300 como elegancia. Navy profundo (#061b31) para headings. Sombras azuladas multi-capa. El gold standard del diseño fintech.",
  },

  // ============ Design & Productivity ============
  {
    slug: "airtable",
    name: "Airtable",
    category: "design-productivity",
    style: "Colorful, friendly, structured data aesthetic",
    tags: ["colorful", "friendly", "data", "productivity", "collaboration"],
    colors: {
      primary: "#6b57ff",
      accent: "#ee61b8",
      background: "#ffffff",
      surface: "#f8f7fc",
      text: "#1a1a2e",
      textSecondary: "#7a7a9e",
    },
    fonts: { primary: "Inter" },
    description: "Colorido y amigable. Estética de datos estructurados. Para herramientas de productividad y colaboración.",
  },
  {
    slug: "cal",
    name: "Cal.com",
    category: "design-productivity",
    style: "Clean neutral UI, developer-oriented simplicity",
    tags: ["light", "clean", "neutral", "developer", "calendar"],
    colors: {
      primary: "#292929",
      accent: "#111111",
      background: "#ffffff",
      surface: "#fafafa",
      text: "#111111",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "UI neutral limpia con simplicidad orientada a desarrolladores. Sin distracciones, máxima funcionalidad.",
  },
  {
    slug: "clay",
    name: "Clay",
    category: "design-productivity",
    style: "Organic shapes, soft gradients, art-directed layout",
    tags: ["organic", "gradients", "artistic", "creative", "branding"],
    colors: {
      primary: "#a855f7",
      accent: "#ec4899",
      background: "#faf5ff",
      text: "#1a1a2e",
      textSecondary: "#7a7a9e",
    },
    fonts: { primary: "Inter" },
    description: "Formas orgánicas, gradientes suaves. Layout dirigido artísticamente. Para marcas creativas y productos de diseño.",
  },
  {
    slug: "figma",
    name: "Figma",
    category: "design-productivity",
    style: "Vibrant multi-color, playful yet professional",
    tags: ["vibrant", "colorful", "playful", "professional", "design-tool"],
    colors: {
      primary: "#a259ff",
      accent: "#1abcfe",
      background: "#ffffff",
      text: "#2c2c2c",
      textSecondary: "#7a7a7a",
    },
    fonts: { primary: "Inter" },
    description: "Multicolor vibrante. Profesional y lúdico a la vez. Para herramientas de diseño y plataformas creativas.",
  },
  {
    slug: "framer",
    name: "Framer",
    category: "design-productivity",
    style: "Bold black and blue, motion-first, design-forward",
    tags: ["dark", "blue", "bold", "motion", "design"],
    colors: {
      primary: "#0055ff",
      accent: "#0033cc",
      background: "#000000",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "Inter" },
    description: "Negro y azul audaces. Motion-first. Para herramientas de diseño y prototipado con énfasis en animación.",
  },
  {
    slug: "intercom",
    name: "Intercom",
    category: "design-productivity",
    style: "Friendly blue palette, conversational UI patterns",
    tags: ["blue", "friendly", "conversational", "crm", "support"],
    colors: {
      primary: "#1a8cff",
      accent: "#0066d4",
      background: "#ffffff",
      surface: "#f5f9ff",
      text: "#1a1a2e",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Paleta azul amigable. Patrones de UI conversacionales. Para CRM, soporte y productos de comunicación.",
  },
  {
    slug: "miro",
    name: "Miro",
    category: "design-productivity",
    style: "Bright yellow accent, infinite canvas aesthetic",
    tags: ["yellow", "bright", "canvas", "collaboration", "whiteboard"],
    colors: {
      primary: "#ffd02b",
      accent: "#ffcb00",
      background: "#ffffff",
      surface: "#fefce8",
      text: "#1a1a2e",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Acento amarillo brillante. Estética de lienzo infinito. Para pizarras colaborativas y herramientas visuales.",
  },
  {
    slug: "notion",
    name: "Notion",
    category: "design-productivity",
    style: "Warm minimalism, serif headings, soft surfaces",
    tags: ["light", "warm", "minimal", "serif", "productivity", "documentation"],
    colors: {
      primary: "#0075de",
      accent: "#097fe8",
      background: "#ffffff",
      surface: "#f6f5f4",
      text: "rgba(0,0,0,0.95)",
      textSecondary: "#615d59",
      border: "rgba(0,0,0,0.1)",
    },
    fonts: { primary: "Inter / NotionInter", mono: "SF Mono / JetBrains Mono" },
    description: "Minimalismo cálido con superficies suaves. Tipografía serif en headings. (#f6f5f4) como fondo alternativo. Acento azul (#0075de). El estándar de productividad y documentación.",
  },
  {
    slug: "pinterest",
    name: "Pinterest",
    category: "design-productivity",
    style: "Red accent, masonry grid, image-first layout",
    tags: ["red", "masonry", "image-first", "social", "visual"],
    colors: {
      primary: "#e60023",
      background: "#ffffff",
      surface: "#f0f0f0",
      text: "#211922",
      textSecondary: "#575e65",
    },
    fonts: { primary: "system-ui" },
    description: "Acento rojo característico. Grid masonry, layout image-first. Para plataformas visuales y sociales.",
  },
  {
    slug: "webflow",
    name: "Webflow",
    category: "design-productivity",
    style: "Blue-accented, polished marketing site aesthetic",
    tags: ["blue", "polished", "marketing", "no-code", "design"],
    colors: {
      primary: "#146ef5",
      accent: "#0b5cdb",
      background: "#ffffff",
      surface: "#f8faff",
      text: "#1a1a2e",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Acentos azules pulidos. Estética de sitio marketing premium. Para plataformas no-code y diseño web.",
  },

  // ============ Fintech & Crypto ============
  {
    slug: "coinbase",
    name: "Coinbase",
    category: "fintech",
    style: "Clean blue identity, trust-focused, institutional feel",
    tags: ["blue", "trust", "institutional", "crypto", "fintech"],
    colors: {
      primary: "#0052ff",
      accent: "#1663ff",
      background: "#ffffff",
      surface: "#f5f7ff",
      text: "#050f1c",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "DM Sans / Inter" },
    description: "Identidad azul limpia. Enfoque en confianza con sensación institucional. Para fintech y cripto.",
  },
  {
    slug: "kraken",
    name: "Kraken",
    category: "fintech",
    style: "Purple-accented dark UI, data-dense dashboards",
    tags: ["dark", "purple", "data-dense", "crypto", "exchange"],
    colors: {
      primary: "#6345ec",
      accent: "#7750f7",
      background: "#0d0b1a",
      surface: "#15122a",
      text: "#ffffff",
      textSecondary: "#9892b6",
    },
    fonts: { primary: "Inter" },
    description: "UI oscura con acentos púrpura. Dashboards densos en datos. Para exchanges y plataformas financieras.",
  },
  {
    slug: "revolut",
    name: "Revolut",
    category: "fintech",
    style: "Sleek dark interface, gradient cards, fintech precision",
    tags: ["dark", "sleek", "gradients", "fintech", "premium", "mobile-first"],
    colors: {
      primary: "#191c1f",
      accent: "#0d5cff",
      background: "#000000",
      surface: "#0f0f0f",
      text: "#ffffff",
      textSecondary: "#8a8f98",
    },
    fonts: { primary: "Inter" },
    description: "Interfaz oscura elegante con tarjetas gradientes. Precisión fintech. Mobile-first. Estilo premium.",
  },
  {
    slug: "wise",
    name: "Wise",
    category: "fintech",
    style: "Bright green accent, friendly and clear",
    tags: ["green", "friendly", "clear", "fintech", "transparent"],
    colors: {
      primary: "#00b674",
      accent: "#009e62",
      background: "#ffffff",
      surface: "#f2fcf7",
      text: "#18212a",
      textSecondary: "#6b7280",
    },
    fonts: { primary: "Inter" },
    description: "Acento verde brillante y amigable. Clara y transparente. Fintech con personalidad accesible.",
  },

  // ============ Enterprise & Consumer ============
  {
    slug: "airbnb",
    name: "Airbnb",
    category: "enterprise-consumer",
    style: "Warm coral accent, photography-driven, rounded UI",
    tags: ["coral", "warm", "photography", "rounded", "travel", "consumer"],
    colors: {
      primary: "#ff385c",
      accent: "#e31c5f",
      background: "#ffffff",
      text: "#222222",
      textSecondary: "#717171",
    },
    fonts: { primary: "DM Sans / Inter" },
    description: "Acento coral cálido (#ff385c). UI redondeada, impulsada por fotografía. Para consumo masivo y lifestyle.",
  },
  {
    slug: "apple",
    name: "Apple",
    category: "enterprise-consumer",
    style: "Premium white space, SF Pro, cinematic imagery",
    tags: ["light", "premium", "white-space", "cinematic", "consumer", "luxury"],
    colors: {
      primary: "#0071e3",
      background: "#f5f5f7",
      surface: "#ffffff",
      text: "#1d1d1f",
      textSecondary: "rgba(0,0,0,0.56)",
      border: "#d2d2d7",
    },
    fonts: { primary: "SF Pro / system-ui" },
    description: "Espacio blanco premium. Tipografía SF Pro. Imágenes cinematográficas. El estándar de diseño de consumo de lujo.",
  },
  {
    slug: "bmw",
    name: "BMW",
    category: "enterprise-consumer",
    style: "Dark premium surfaces, precise engineering aesthetic",
    tags: ["dark", "premium", "automotive", "engineering", "luxury"],
    colors: {
      primary: "#1c69d4",
      background: "#000000",
      surface: "#0a0a0a",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "BMW Type / Inter" },
    description: "Superficies oscuras premium. Estética de ingeniería de precisión. Para marcas de lujo y automotriz.",
  },
  {
    slug: "ibm",
    name: "IBM",
    category: "enterprise-consumer",
    style: "Carbon design system, structured blue palette",
    tags: ["blue", "enterprise", "carbon", "structured", "professional"],
    colors: {
      primary: "#0f62fe",
      accent: "#0043ce",
      background: "#ffffff",
      surface: "#f4f4f4",
      text: "#161616",
      textSecondary: "#525252",
    },
    fonts: { primary: "IBM Plex Sans", mono: "IBM Plex Mono" },
    description: "Carbon Design System. Paleta azul estructurada. Enterprise. IBM Plex tipografía completa con serif, sans y mono.",
  },
  {
    slug: "nvidia",
    name: "NVIDIA",
    category: "enterprise-consumer",
    style: "Green-black energy, technical power aesthetic",
    tags: ["dark", "green", "energy", "technical", "gaming", "ai", "hardware"],
    colors: {
      primary: "#76b900",
      accent: "#00ff00",
      background: "#000000",
      surface: "#0a0a0a",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "Inter" },
    description: "Energía verde-negra. Estética de poder técnico. Gaming, AI y hardware de alto rendimiento.",
  },
  {
    slug: "spacex",
    name: "SpaceX",
    category: "enterprise-consumer",
    style: "Stark black and white, full-bleed imagery, futuristic",
    tags: ["dark", "black-white", "full-bleed", "futuristic", "aerospace"],
    colors: {
      primary: "#ffffff",
      background: "#000000",
      text: "#ffffff",
      textSecondary: "#888888",
    },
    fonts: { primary: "system-ui" },
    description: "Blanco y negro severo. Imágenes full-bleed. Futurista. Para aeroespacial y tecnología de vanguardia.",
  },
  {
    slug: "spotify",
    name: "Spotify",
    category: "enterprise-consumer",
    style: "Vibrant green on dark, bold type, album-art-driven",
    tags: ["dark", "green", "bold", "music", "consumer", "entertainment"],
    colors: {
      primary: "#1ed760",
      accent: "#1db954",
      background: "#121212",
      surface: "#181818",
      text: "#ffffff",
      textSecondary: "#b3b3b3",
      border: "#4d4d4d",
    },
    fonts: { primary: "DM Sans / Inter" },
    description: "Verde vibrante (#1ed760) sobre fondo oscuro (#121212). Tipografía bold, impulsado por arte de álbum. El estándar de entretenimiento y consumo masivo.",
  },
  {
    slug: "uber",
    name: "Uber",
    category: "enterprise-consumer",
    style: "Bold black and white, tight type, urban energy",
    tags: ["dark", "black-white", "urban", "bold", "transport", "consumer"],
    colors: {
      primary: "#000000",
      background: "#000000",
      text: "#ffffff",
      textSecondary: "#a1a1aa",
    },
    fonts: { primary: "DM Sans / Inter" },
    description: "Negro y blanco audaz. Tipografía ajustada. Energía urbana. Para movilidad y consumo masivo.",
  },
];

/**
 * Reglas de matching automático: dada una descripción de dominio (del MDD),
 * sugiere el mejor Design Reference.
 */
export function matchDesignByDomain(mddContext: string): DesignReference[] {
  const ctx = mddContext.toLowerCase();
  const scores: { ref: DesignReference; score: number }[] = [];

  // Palabras clave por categoría/dominio
  const domainPatterns: [RegExp, string[]][] = [
    // Fintech
    [/(fintech|bank|payment|transaction|finance|invoice|billing|pago|banking)/, ["stripe", "revolut", "wise", "coinbase", "kraken"]],
    // E-commerce / marketplace
    [/(e-commerce|marketplace|shop|store|retail|commerce|venta|tienda)/, ["airbnb", "stripe", "shopify"]],
    // SaaS / CRM / ERP
    [/(crm|erp|saas|b2b|enterprise|dashboard|analytics|report|business)/, ["linear-app", "vercel", "supabase", "notion", "sentry"]],
    // Healthcare / health
    [/(health|medical|hospital|healthcare|clinica|salud|wellness)/, ["cal", "notion", "apple", "intercom"]],
    // AI / ML product
    [/(ai|machine learning|llm|artificial intelligence|gpt|neural)/, ["claude", "cursor", "replicate", "vercel", "linear-app"]],
    // Developer tools
    [/(developer|dev|code|api|sdk|cli|tool|platform|programming)/, ["vercel", "linear-app", "supabase", "cursor", "raycast"]],
    // Creative / design
    [/(design|creative|creative|brand|marketing|agency|studio)/, ["figma", "framer", "notion", "webflow", "clay"]],
    // Real estate / property
    [/(real estate|property|inmobiliaria|casa|rent|lease|alquiler)/, ["stripe", "airbnb", "notion"]],
    // Education / learning
    [/(education|learning|course|school|university|educacion|curso)/, ["notion", "mintlify", "cal"]],
    // Social / community
    [/(social|community|network|forum|chat|messaging|mensajeria)/, ["intercom", "spotify", "pinterest"]],
    // Media / entertainment
    [/(media|entertainment|video|music|streaming|podcast)/, ["spotify", "apple", "elevenlabs", "runwayml"]],
    // IoT / hardware
    [/(iot|hardware|device|sensor|embedded|firmware)/, ["nvidia", "spacex", "bmw", "apple"]],
    // Logistics / transport
    [/(logistics|transport|delivery|shipping|fleet|logistica|envio)/, ["uber", "wise", "stripe"]],
    // Content / publishing
    [/(content|blog|publish|news|article|writing|blog|documentacion)/, ["notion", "mintlify", "sanity", "claude"]],
    // Gaming
    [/(gaming|game|gaming|videojuego|esports)/, ["nvidia", "spotify", "minimax"]],
  ];

  for (const [pattern, slugs] of domainPatterns) {
    if (pattern.test(ctx)) {
      for (const slug of slugs) {
        const ref = DESIGN_REFERENCES.find((r) => r.slug === slug);
        if (ref) {
          const existing = scores.find((s) => s.ref.slug === slug);
          if (existing) {
            existing.score += 1;
          } else {
            scores.push({ ref, score: 1 });
          }
        }
      }
    }
  }

  return scores.sort((a, b) => b.score - a.score).map((s) => s.ref).slice(0, 3);
}

/**
 * Obtiene un DesignReference por slug.
 */
export function getDesignBySlug(slug: string): DesignReference | undefined {
  return DESIGN_REFERENCES.find((r) => r.slug === slug);
}

/**
 * Genera el bloque de contexto para inyectar en el prompt del LLM.
 */
export function formatDesignReferencePrompt(ref: DesignReference): string {
  return `\n\n## [Design Reference: ${ref.name}]\nEste es un sistema de diseño de referencia. NO lo copies textual — úsalo como inspiración y adapta los valores al dominio del proyecto especificado en el MDD.\n\n### Paleta de colores de referencia\n${Object.entries(ref.colors)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")}\n\n### Tipografía\n- Primaria: ${ref.fonts?.primary ?? "No especificada"}${ref.fonts?.mono ? `\n- Mono: ${ref.fonts.mono}` : ""}\n\n### Personalidad\n${ref.style}\n\n### Directrices\n1. La paleta de colores es referencial — adáptala al dominio y personalidad del producto.\n2. La tipografía puede usarse como guía pero prioriza fuentes del stack del proyecto.\n3. Mantén la personalidad general (${ref.style}) pero hazla propia del producto.\n4. Conserva los principios de accesibilidad WCAG AA (contraste ≥4.5:1).`;
}

/**
 * Lista completa de todas las design references con metadata básica (para el selector UI).
 */
export function getDesignReferenceList() {
  return DESIGN_REFERENCES.map(({ slug, name, category, style, tags }) => ({
    slug,
    name,
    category,
    style,
    tags,
  }));
}