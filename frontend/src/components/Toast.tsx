import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { AppToast } from "../hooks/useWebSocketNotifications";

const TONE_STYLES: Record<AppToast["tone"], string> = {
  info: "bg-white border-black/[0.06] text-ink",
  success: "bg-emerald-50 border-emerald-300 text-emerald-900",
  warning: "bg-amber-50 border-amber-300 text-amber-900",
  error: "bg-red-50 border-red-300 text-red-900",
};

const TONE_ICONS: Record<AppToast["tone"], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AppToast[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((t) => {
        const Icon = TONE_ICONS[t.tone];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all ${TONE_STYLES[t.tone]}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.message}</p>
              {t.detail && <p className="mt-0.5 text-xs opacity-75">{t.detail}</p>}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full opacity-50 hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
