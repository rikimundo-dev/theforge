/**
 * @fileoverview Error Boundary para capturar errores de render y evitar pantallas en blanco.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
    this.setState({ error });
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-[var(--destructive)]/10 p-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Algo salió mal
        </h2>
        <p className="max-w-md text-sm text-[var(--foreground-muted)]">
          {this.state.error.message}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            this.setState({ error: null });
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }
}
