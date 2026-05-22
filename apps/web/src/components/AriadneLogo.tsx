import ariadneLogoSrc from "@/assets/ariadne-logo.png";
import { cn } from "@/lib/utils";

export type AriadneLogoSize = "xs" | "sm" | "md" | "lg";

const HEIGHT: Record<AriadneLogoSize, string> = {
  xs: "h-4",
  sm: "h-5",
  md: "h-7",
  lg: "h-9",
};

interface AriadneLogoProps {
  size?: AriadneLogoSize;
  className?: string;
}

/** Ariadne wordmark (official brand asset). */
export function AriadneLogo({ size = "md", className }: AriadneLogoProps) {
  return (
    <img
      src={ariadneLogoSrc}
      alt="Ariadne"
      className={cn("w-auto max-w-full object-contain object-left", HEIGHT[size], className)}
      decoding="async"
    />
  );
}
