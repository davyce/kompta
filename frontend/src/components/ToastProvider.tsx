import { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  detail?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

let _counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t: tr } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info", duration = 4000, detail?: string) => {
    const id = ++_counter;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, detail, duration }]);
    if (duration > 0) setTimeout(() => remove(id), duration);
  }, [remove]);

  const ctx: ToastContextValue = {
    toast,
    success: (m, d) => toast(m, "success", 4000, d),
    error: (m, d)   => toast(m, "error", 6000, d),
    info: (m, d)    => toast(m, "info", 4000, d),
    warning: (m, d) => toast(m, "warning", 5000, d),
  };

  const ICONS = {
    success: <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />,
    error:   <AlertCircle  size={16} className="text-red-500 shrink-0" />,
    info:    <Info         size={16} className="text-blue-500 shrink-0" />,
    warning: <AlertTriangle size={16} className="text-amber-500 shrink-0" />,
  };
  const BG = {
    success: "bg-white border-emerald-200 dark:bg-[#1e2229] dark:border-emerald-500/30",
    error:   "bg-white border-red-200 dark:bg-[#1e2229] dark:border-red-500/30",
    info:    "bg-white border-blue-200 dark:bg-[#1e2229] dark:border-blue-500/30",
    warning: "bg-white border-amber-200 dark:bg-[#1e2229] dark:border-amber-500/30",
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast portal */}
      <div className="pointer-events-none fixed right-5 z-[9999] flex flex-col gap-2 w-[calc(100vw-2.5rem)] max-w-80 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg transition-all ${BG[t.type]}`}
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#17211f] dark:text-white leading-snug">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 text-xs text-[#717182] dark:text-white/60 leading-snug">{t.detail}</p>
              )}
            </div>
            <button
              onClick={() => remove(t.id)}
              aria-label={tr("common.close")}
              className="shrink-0 grid h-5 w-5 place-items-center rounded text-[#717182] hover:text-[#17211f] dark:hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
