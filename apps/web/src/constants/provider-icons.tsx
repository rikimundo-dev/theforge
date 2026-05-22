import type { LucideIcon } from "lucide-react";
import { Bot, Cloud, Sparkles, Zap } from "lucide-react";
import type { ProviderId } from "@/types/user-providers";

/** @deprecated Prefer {@link ProviderLogo} for UI. */
const ICONS: Record<ProviderId, LucideIcon> = {
  openrouter: Sparkles,
  openai: Bot,
  anthropic: Bot,
  gemini: Sparkles,
  cloudflare: Cloud,
  groq: Zap,
};

/** @deprecated Prefer {@link ProviderLogo} from `@/components/ProviderLogo`. */
export function getProviderIcon(providerType: ProviderId | string): LucideIcon {
  if (providerType in ICONS) {
    return ICONS[providerType as ProviderId];
  }
  return Bot;
}
