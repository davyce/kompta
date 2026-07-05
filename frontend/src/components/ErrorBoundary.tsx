import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCcw, RotateCw } from "lucide-react";
import i18n from "../i18n";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; info: ErrorInfo | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.setState({ info });

    // Sentry est initialisé de façon optionnelle (voir monitoring.ts) — no-op si absent.
    void import("@sentry/react")
      .then((Sentry) => {
        if (typeof Sentry.captureException === "function") {
          Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
        }
      })
      .catch(() => {
        // Sentry indisponible : on ne bloque jamais l'affichage du fallback.
      });
  }

  reset = () => this.setState({ error: null, info: null });

  reload = () => window.location.reload();

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-xl border border-red-100 bg-red-50 p-8 text-center dark:border-red-500/20 dark:bg-red-500/10">
          <AlertTriangle size={36} className="text-red-500" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-400 dark:text-red-500/70">KOMPTA</p>
            <p className="mt-1 text-base font-bold text-red-700 dark:text-red-400">{i18n.t("components.errorBoundary.title")}</p>
            <p className="mt-1 max-w-sm text-sm text-red-600 dark:text-red-300">{i18n.t("components.errorBoundary.message")}</p>
            {import.meta.env.DEV && (
              <pre className="mt-3 max-w-lg overflow-auto whitespace-pre-wrap rounded-lg bg-red-100 p-3 text-left text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {this.state.error.message}
                {this.state.info?.componentStack ?? ""}
              </pre>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <RefreshCcw size={14} /> {i18n.t("components.payments.retry")}
            </button>
            <button
              onClick={this.reload}
              className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <RotateCw size={14} /> {i18n.t("components.errorBoundary.reload")}
            </button>
          </div>
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
