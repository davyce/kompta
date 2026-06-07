import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Texte du bouton de confirmation. Défaut "Confirmer". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style destructif (rouge) pour suppression/suspension. */
  danger?: boolean;
  /** Si défini, l'utilisateur doit cocher cette case avant de pouvoir confirmer. */
  requireAcknowledge?: string;
  /** Si défini, l'utilisateur doit saisir un motif (obligatoire). Renvoyé via le résolveur. */
  reasonLabel?: string;
}

type Resolver = (value: { confirmed: boolean; reason?: string }) => void;

interface ConfirmContextValue {
  /** Retourne true si confirmé. Pour récupérer le motif, utiliser confirmWithReason. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Variante qui renvoie aussi le motif saisi. */
  confirmWithReason: (opts: ConfirmOptions) => Promise<{ confirmed: boolean; reason?: string }>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: async () => false,
  confirmWithReason: async () => ({ confirmed: false }),
});

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t: tr } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const resolverRef = useRef<Resolver | null>(null);

  const run = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setAck(false);
    setReason("");
    return new Promise<{ confirmed: boolean; reason?: string }>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.({ confirmed, reason: reason.trim() || undefined });
    resolverRef.current = null;
    setOpts(null);
  }, [reason]);

  const ctx: ConfirmContextValue = {
    confirm: async (o) => (await run(o)).confirmed,
    confirmWithReason: run,
  };

  const canConfirm = opts
    ? (!opts.requireAcknowledge || ack) && (!opts.reasonLabel || reason.trim().length > 0)
    : false;

  return (
    <ConfirmContext.Provider value={ctx}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${opts.danger ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"}`}>
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#17211f] dark:text-white">{opts.title}</h3>
              </div>
              <button onClick={() => settle(false)} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white transition">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {opts.message && (
                <p className="text-sm text-[#717182] leading-relaxed whitespace-pre-line">{opts.message}</p>
              )}

              {opts.reasonLabel && (
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{opts.reasonLabel}</label>
                  <textarea
                    autoFocus
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-indigo-500 resize-none"
                    placeholder={tr("components.confirm.reasonPlaceholder")}
                  />
                </div>
              )}

              {opts.requireAcknowledge && (
                <label className="flex items-start gap-2 text-sm text-[#17211f] dark:text-white cursor-pointer">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                  <span>{opts.requireAcknowledge}</span>
                </label>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.06]">
              <button
                onClick={() => settle(false)}
                className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
              >
                {opts.cancelLabel ?? tr("common.cancel")}
              </button>
              <button
                onClick={() => settle(true)}
                disabled={!canConfirm}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${
                  opts.danger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {opts.confirmLabel ?? tr("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

/** Petit composant utilitaire si besoin d'un spinner pendant l'action après confirmation. */
export function InlineSpinner() {
  return <Loader2 size={14} className="animate-spin" />;
}
