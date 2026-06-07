import { useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, CheckCircle2, AlertTriangle, X, Lock } from "lucide-react";
import { api } from "../services/api";
import { money } from "../utils/format";

// Stripe.js types minimaux
interface StripeCardElement { mount(el: HTMLElement): void; destroy(): void; on(e: string, h: (ev: { error?: { message: string } }) => void): void; }
interface StripeElements { create(type: "card", options?: object): StripeCardElement; }
interface StripeInstance {
  elements(): StripeElements;
  confirmCardPayment(secret: string, data: object): Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>;
}
declare global { interface Window { Stripe?: (key: string) => StripeInstance } }

let _stripePromise: Promise<void> | null = null;
function loadStripeJs(): Promise<void> {
  if (_stripePromise) return _stripePromise;
  _stripePromise = new Promise((resolve, reject) => {
    if (document.querySelector("script[src*='stripe.com/v3']")) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger Stripe.js"));
    document.head.appendChild(s);
  });
  return _stripePromise;
}

type Phase = "loading" | "form" | "processing" | "succeeded" | "failed";

interface StripeCardPaymentModalProps {
  amountCents: number;
  currency?: string;
  description?: string;
  saleId?: number;
  invoiceId?: number;
  onSuccess: (transactionId: number) => void;
  onClose: () => void;
}

export function StripeCardPaymentModal({ amountCents, currency = "XAF", description, saleId, invoiceId, onSuccess, onClose }: StripeCardPaymentModalProps) {
  const cardMountRef   = useRef<HTMLDivElement>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const stripeRef      = useRef<StripeInstance | null>(null);
  const [phase, setPhase]             = useState<Phase>("loading");
  const [error, setError]             = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [txnId, setTxnId]             = useState<number | null>(null);
  const [cardError, setCardError]     = useState<string | null>(null);
  const [stripeMode, setStripeMode]   = useState<"test" | "live" | "unknown">("unknown");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStripeJs();
        const intent = await api.createStripeIntent({ amount_cents: amountCents, currency, sale_id: saleId, invoice_id: invoiceId, description });
        if (cancelled) return;
        setClientSecret(intent.client_secret);
        setTxnId(intent.transaction_id);
        setStripeMode(intent.publishable_key?.startsWith("pk_test") ? "test" : intent.publishable_key ? "live" : "unknown");
        if (!window.Stripe) throw new Error("Stripe.js n'est pas disponible.");
        const stripe = window.Stripe!(intent.publishable_key);
        stripeRef.current = stripe;
        // Le montage de l'élément carte se fait dans un useEffect dédié (ci-dessous),
        // une fois que React a réellement peint le conteneur (fiable sur mobile).
        setPhase("form");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Paiement carte indisponible.");
        setPhase("failed");
      }
    })();
    return () => { cancelled = true; cardElementRef.current?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Montage du champ carte Stripe : APRÈS que le conteneur est rendu (phase "form").
  // Évite l'iframe vide sur mobile (le rAF montait parfois avant le paint du DOM).
  useEffect(() => {
    if (phase !== "form" || !stripeRef.current || !cardMountRef.current || cardElementRef.current) return;
    const elements = stripeRef.current.elements();
    const card = elements.create("card", {
      hidePostalCode: true,
      style: {
        base: { fontSize: "16px", color: "#17211f", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", "::placeholder": { color: "#9ca3af" } },
        invalid: { color: "#ef4444" },
      },
    });
    card.mount(cardMountRef.current);
    card.on("change", (ev: { error?: { message: string } }) => setCardError(ev.error?.message ?? null));
    cardElementRef.current = card;
  }, [phase]);

  async function handlePay() {
    if (!stripeRef.current || !clientSecret || !cardElementRef.current) return;
    setPhase("processing"); setError(null);
    const result = await stripeRef.current.confirmCardPayment(clientSecret, { payment_method: { card: cardElementRef.current as unknown as object } });
    if (result.error) { setPhase("form"); setError(result.error.message ?? "Paiement refusé."); }
    else if (result.paymentIntent?.status === "succeeded") {
      if (!txnId) { setPhase("form"); setError("Transaction KOMPTA introuvable."); return; }
      try {
        await waitForServerConfirmation(txnId);
        setPhase("succeeded");
        setTimeout(() => onSuccess(txnId), 900);
      } catch (e) {
        setPhase("form");
        setError(e instanceof Error ? e.message : "Confirmation serveur impossible.");
      }
    }
    else { setPhase("form"); setError("Statut inattendu, réessayez."); }
  }

  async function waitForServerConfirmation(transactionId: number) {
    let lastError = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const status = await api.paymentStatus(transactionId);
        if (status.status === "succeeded") return;
        if (status.status === "failed" || status.status === "cancelled") {
          lastError = status.failure_reason || "Paiement refusé par Stripe.";
          break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Confirmation serveur indisponible.";
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    throw new Error(lastError || "Paiement confirmé côté carte, mais pas encore confirmé côté serveur KOMPTA.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-blue-500" />
            <h3 className="font-bold text-[#17211f] dark:text-white">Paiement par carte</h3>
            <Lock size={11} className="text-[#aaaabc]" aria-label="Connexion sécurisée Stripe" />
          </div>
          <button onClick={onClose} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-extrabold text-[#17211f] dark:text-white">{money(Math.round(amountCents / 100))}</p>
            <p className="text-xs text-[#717182]">{description || "Paiement"}</p>
          </div>
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-xs text-[#717182]">Connexion au paiement carte sécurisé…</p>
            </div>
          )}

          {/* Mode Stripe en ligne */}
          {(phase === "form" || phase === "processing") && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-2">Informations de la carte</label>
                <div ref={cardMountRef} className="rounded-xl border border-black/[0.10] dark:border-white/[0.10] bg-white dark:bg-[#252931] px-4 py-3.5 min-h-[46px] transition focus-within:border-blue-400" />
                {cardError && <p className="mt-1.5 text-xs text-rose-500">{cardError}</p>}
                {error && <p className="mt-1.5 text-xs text-rose-500">{error}</p>}
              </div>
              {stripeMode === "test" && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300">
                  <span className="font-bold">Mode test ·</span> Carte test : <span className="font-mono">4242 4242 4242 4242</span> · date future · CVC 3 chiffres
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-[#aaaabc]"><Lock size={10} /> Données carte chiffrées par Stripe — jamais visibles par KOMPTA</div>
              <button onClick={handlePay} disabled={phase === "processing" || !!cardError}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-sm font-bold text-white transition disabled:opacity-50">
                {phase === "processing" ? <><Loader2 size={15} className="animate-spin" /> Confirmation bancaire…</> : <><CreditCard size={15} /> Payer {money(Math.round(amountCents / 100))}</>}
              </button>
            </>
          )}

          {phase === "succeeded" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={44} className="text-emerald-500" />
              <p className="font-bold text-emerald-700 dark:text-emerald-400">Paiement confirmé !</p>
              <p className="text-xs text-[#717182]">La vente va être enregistrée…</p>
            </div>
          )}
          {phase === "failed" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertTriangle size={32} className="text-rose-500" />
              <p className="text-sm font-semibold text-rose-600">{error ?? "Connexion Stripe impossible."}</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Configurez <span className="font-mono">STRIPE_SECRET_KEY</span>, <span className="font-mono">STRIPE_PUBLISHABLE_KEY</span> et <span className="font-mono">STRIPE_WEBHOOK_SECRET</span> côté backend. Le Tap to Pay sans contact nécessite une app mobile Stripe Terminal ou un lecteur Terminal; il ne peut pas être simulé par le navigateur web.
              </div>
              <button onClick={onClose} className="rounded-xl bg-[#17211f] px-4 py-2 text-sm font-bold text-white hover:bg-black">Fermer</button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5 pb-4 text-[10px] text-[#aaaabc]">
          <Lock size={9} /> <span>Propulsé par</span>
          <span className="font-extrabold text-[#635BFF]">stripe</span>
        </div>
      </div>
    </div>
  );
}
