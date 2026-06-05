import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, X, AlertTriangle } from "lucide-react";
import { api } from "../services/api";
import { money } from "../utils/format";

type Phase = "input" | "pending" | "succeeded" | "failed";

interface MoMoPaymentModalProps {
  amountCents: number;
  currency?: string;
  description?: string;
  saleId?: number;
  invoiceId?: number;
  onSuccess: (transactionId: number) => void;
  onClose: () => void;
}

/**
 * Flux de paiement MTN Mobile Money réel :
 * saisie du numéro → requestToPay → polling du statut → succès/échec.
 * Le statut provient du backend (qui interroge MoMo) — aucun simulacre.
 */
export function MoMoPaymentModal({
  amountCents, currency = "XAF", description, saleId, invoiceId, onSuccess, onClose,
}: MoMoPaymentModalProps) {
  const [phone, setPhone]   = useState("");
  const [phase, setPhase]   = useState<Phase>("input");
  const [error, setError]   = useState<string | null>(null);
  const [txnId, setTxnId]   = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startPayment() {
    setError(null);
    if (!phone.trim()) { setError("Saisissez le numéro du client."); return; }
    setPhase("pending");
    try {
      const res = await api.createMomoRequest({
        amount_cents: amountCents, currency, payer_phone: phone.trim(),
        sale_id: saleId, invoice_id: invoiceId, description,
      });
      setTxnId(res.transaction_id);
      poll(res.transaction_id);
    } catch (e) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "Échec de la demande de paiement.");
    }
  }

  function poll(id: number) {
    attemptsRef.current = 0;
    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      try {
        const st = await api.paymentStatus(id);
        if (st.status === "succeeded") {
          stopPoll(); setPhase("succeeded");
          setTimeout(() => onSuccess(id), 900);
        } else if (st.status === "failed" || st.status === "cancelled") {
          stopPoll(); setPhase("failed");
          setError(st.failure_reason || "Paiement refusé par le client ou expiré.");
        }
      } catch { /* réseau momentané — on continue */ }
      // ~90s max (30 × 3s)
      if (attemptsRef.current >= 30) {
        stopPoll(); setPhase("failed");
        setError("Délai dépassé. Le client n'a pas validé le paiement.");
      }
    }, 3000);
  }

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-amber-500" />
            <h3 className="font-bold text-[#17211f] dark:text-white">Paiement Mobile Money</h3>
          </div>
          <button onClick={() => { stopPoll(); onClose(); }} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-extrabold text-[#17211f] dark:text-white">{money(Math.round(amountCents / 100))}</p>
            <p className="text-xs text-[#717182]">Montant à encaisser</p>
          </div>

          {phase === "input" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">Numéro du client (MSISDN)</label>
                <input
                  type="tel" value={phone} autoFocus
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+242 06 000 0000"
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-amber-400"
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button onClick={startPayment} className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-bold text-white transition">
                Envoyer la demande de paiement
              </button>
            </>
          )}

          {phase === "pending" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Loader2 size={32} className="animate-spin text-amber-500" />
              <p className="text-sm font-semibold text-[#17211f] dark:text-white">En attente de validation du client…</p>
              <p className="text-xs text-[#717182]">Le client doit confirmer sur son téléphone (code PIN MoMo).</p>
            </div>
          )}

          {phase === "succeeded" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 size={36} className="text-emerald-500" />
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Paiement confirmé !</p>
            </div>
          )}

          {phase === "failed" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertTriangle size={32} className="text-rose-500" />
              <p className="text-sm font-semibold text-rose-600">{error ?? "Paiement échoué."}</p>
              <button onClick={() => { setPhase("input"); setError(null); }} className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
