/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        gold: "var(--shadow-gold)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
      },
      /** Evita ease-[cubic-bezier(...)] ambiguos con tailwindcss-animate / Tailwind 3.4+. */
      transitionTimingFunction: {
        "forge-smooth": "cubic-bezier(0.33, 1, 0.68, 1)",
        "forge-snappy": "cubic-bezier(0.22, 1, 0.36, 1)",
        "forge-pop": "cubic-bezier(0.34, 1.2, 0.64, 1)",
        "forge-spring": "cubic-bezier(0.34, 1.25, 0.64, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { transform: "translateY(-10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        /** AI-style loader: soft vertical bounce for staggered dots */
        "ai-dot-wave": {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.25" },
          "50%": { transform: "translateY(-5px)", opacity: "1" },
        },
        /** Sweeping highlight across a panel (v0 / Lovable–style “building”) */
        "ai-shimmer-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-8deg)" },
          "100%": { transform: "translateX(220%) skewX(-8deg)" },
        },
        /** Slow bob for “floating” icons inside document build placeholders */
        "ai-doc-float": {
          "0%, 100%": { transform: "translateY(0) rotate(-2deg)", opacity: "0.32" },
          "50%": { transform: "translateY(-10px) rotate(2deg)", opacity: "0.85" },
        },
        /** Horizontal shine across skeleton bars */
        "ai-skeleton-shine": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "ai-dot-wave": "ai-dot-wave 1.05s ease-in-out infinite",
        "ai-shimmer-sweep": "ai-shimmer-sweep 2.4s ease-in-out infinite",
        "ai-doc-float": "ai-doc-float 3.4s ease-in-out infinite",
        "ai-skeleton-shine": "ai-skeleton-shine 2.1s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
