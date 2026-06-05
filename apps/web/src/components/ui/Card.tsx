import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const Card = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "bordered" | "elevated" | "ghost";
    hoverable?: boolean;
  }
>(
  (
    {
      variant = "default",
      hoverable = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles: Record<string, string> = {
      default: "bg-[var(--card)] border border-[var(--card-border)]",
      bordered: "bg-transparent border-2 border-[var(--border)]",
      elevated:
        "bg-[var(--card)] border border-[var(--card-border)] shadow-lg",
      ghost: "bg-transparent border-none",
    };

    const hoverStyles = hoverable
      ? "hover:border-[var(--primary)]/50 hover:shadow-[var(--shadow-gold)] cursor-pointer"
      : "";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius)] transition-all duration-base overflow-hidden",
          variantStyles[variant],
          hoverStyles,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

const CardHeader = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "px-4 py-3 border-b border-[var(--border)]",
      className
    )}
  >
    {children}
  </div>
);

const CardContent = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("px-4 py-3", className)}>{children}</div>
);

const CardFooter = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "px-4 py-3 border-t border-[var(--border)]",
      className
    )}
  >
    {children}
  </div>
);

const CardTitle = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <h3
    className={cn(
      "text-lg font-semibold text-[var(--foreground)]",
      className
    )}
  >
    {children}
  </h3>
);

const CardDescription = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <p
    className={cn(
      "text-sm text-[var(--foreground-muted)]",
      className
    )}
  >
    {children}
  </p>
);

export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
};
