import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-xl border border-red-100 bg-red-50 p-8 text-center dark:border-red-500/20 dark:bg-red-500/10">
          <AlertTriangle size={36} className="text-red-500" />
          <div>
            <p className="text-base font-bold text-red-700 dark:text-red-400">Une erreur inattendue s'est produite</p>
            <p className="mt-1 max-w-sm text-sm text-red-600 dark:text-red-300">{this.state.error.message}</p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <RefreshCcw size={14} /> Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wrap a route in an ErrorBoundary with a consistent page-level fallback */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
