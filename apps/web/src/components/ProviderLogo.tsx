import type { ComponentType } from "react";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import CloudflareColor from "@lobehub/icons/es/Cloudflare/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import GroqMono from "@lobehub/icons/es/Groq/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouterMono from "@lobehub/icons/es/OpenRouter/components/Mono";
import type { ProviderId } from "@/types/user-providers";
import { cn } from "@/lib/utils";

type ProviderLogoSize = "sm" | "md" | "lg";

type LobeIcon = ComponentType<{ size?: number; className?: string }>;

const TILE_SIZE: Record<ProviderLogoSize, string> = {
  sm: "h-9 w-9 rounded-lg",
  md: "h-11 w-11 rounded-xl",
  lg: "h-14 w-14 rounded-2xl",
};

const ICON_PX: Record<ProviderLogoSize, number> = {
  sm: 20,
  md: 24,
  lg: 28,
};

/** Brand marks from @lobehub/icons (lobehub.com/icons); Color where available, else Mono. */
const PROVIDER_ICON = {
  openrouter: OpenRouterMono,
  openai: OpenAIMono,
  anthropic: AnthropicMono,
  gemini: GeminiColor,
  cloudflare: CloudflareColor,
  groq: GroqMono,
} as Record<ProviderId, LobeIcon>;

interface ProviderLogoProps {
  provider: ProviderId | string;
  size?: ProviderLogoSize;
  className?: string;
}

function isProviderId(value: string): value is ProviderId {
  return (
    value === "openrouter" ||
    value === "openai" ||
    value === "anthropic" ||
    value === "gemini" ||
    value === "cloudflare" ||
    value === "groq"
  );
}

function ProviderMark({ provider, size }: { provider: ProviderId; size: ProviderLogoSize }) {
  const Icon = PROVIDER_ICON[provider];
  return <Icon size={ICON_PX[size]} />;
}

/** Brand logo tile for AI provider catalog entries and instance cards. */
export function ProviderLogo({ provider, size = "md", className }: ProviderLogoProps) {
  const id = isProviderId(provider) ? provider : "openrouter";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        "border border-[color-mix(in_oklch,var(--border)_80%,transparent)]",
        "bg-[color-mix(in_oklch,var(--card)_92%,var(--background))]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        TILE_SIZE[size],
        className,
      )}
      aria-hidden
    >
      <ProviderMark provider={id} size={size} />
    </span>
  );
}

export function getProviderLabel(provider: ProviderId | string): string {
  const labels: Record<ProviderId, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Google Gemini",
    cloudflare: "Cloudflare Workers AI",
    groq: "Groq",
  };
  return isProviderId(provider) ? labels[provider] : provider;
}
