import { useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, CheckCircle2, AlertTriangle, X, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { money } from "../utils/format";

// Stripe.js types minimaux
interface StripeCardElement { mount(el: HTMLElement): void; destroy(): void; on(e: string, h: (ev: { error?: { message: string } }) => void): void; }
interface StripePaymentRequestButtonElement { mount(el: HTMLElement): void; destroy(): void; on(e: string, h: (ev: unknown) => void): void; }
interface StripeElements {
  create(type: "card", options?: object): StripeCardElement;
  create(type: "paymentRequestButton", options: { paymentRequest: StripePaymentRequest; style?: object }): StripePaymentRequestButtonElement;
}
interface StripePaymentMethodEvent {
  complete: (status: "success" | "fail") => void;
  paymentMethod: { id: string };
}
interface StripePaymentRequest {
  canMakePayment(): Promise<{ applePay?: boolean } | null>;
  on(event: "paymentmethod", handler: (ev: StripePaymentMethodEvent) => void): void;
  on(event: "cancel", handler: () => void): void;
}
interface StripeInstance {
  elements(): StripeElements;
  confirmCardPayment(secret: string, data: object): Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>;
  confirmCardPayment(secret: string, data: object, options: { handleActions: boolean }): Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>;
  paymentRequest(options: { country: string; currency: string; total: { label: string; amount: number }; requestPayerName?: boolean; requestPayerEmail?: boolean }): StripePaymentRequest;
}
declare global { interface Window { Stripe?: (key: string) => unknown } }

let _stripePromise: Promise<void> | null = null;
function loadStripeJs(): Promise<void> {
  if (_stripePromise) return _stripePromise;
  _stripePromise = new Promise((resolve, reject) => {
    if (document.querySelector("script[src*='stripe.com/v3']")) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("stripe_js_load_failed"));
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
  // "charge" : encaissement réel ; "verify" : paiement-test de validation de la carte
  mode?: "charge" | "verify";
  onSuccess: (transactionId: number) => void;
  onClose: () => void;
}

export function StripeCardPaymentModal({ amountCents, currency = "XAF", description, saleId, invoiceId, mode = "charge", onSuccess, onClose }: StripeCardPaymentModalProps) {
  const { t: tr } = useTranslation();
  const cardMountRef   = useRef<HTMLDivElement>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const stripeRef      = useRef<StripeInstance | null>(null);
  const prButtonMountRef = useRef<HTMLDivElement>(null);
  const prButtonElementRef = useRef<StripePaymentRequestButtonElement | null>(null);
  const paymentRequestRef = useRef<StripePaymentRequest | null>(null);
  const [phase, setPhase]             = useState<Phase>("loading");
  const [error, setError]             = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [txnId, setTxnId]             = useState<number | null>(null);
  const [cardError, setCardError]     = useState<string | null>(null);
  const [stripeMode, setStripeMode]   = useState<"test" | "live" | "unknown">("unknown");
  const [canApplePay, setCanApplePay] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStripeJs();
        const intent = mode === "verify"
          ? await api.startCardTest()
          : await api.createStripeIntent({ amount_cents: amountCents, currency, sale_id: saleId, invoice_id: invoiceId, description });
        if (cancelled) return;
        setClientSecret(intent.client_secret);
        setTxnId(intent.transaction_id);
        setStripeMode(intent.publishable_key?.startsWith("pk_test") ? "test" : intent.publishable_key ? "live" : "unknown");
        if (!window.Stripe) throw new Error(tr("components.stripe.errors.unavailable"));
        const stripe = window.Stripe!(intent.publishable_key) as StripeInstance;
        stripeRef.current = stripe;

        // Apple Pay (via le Payment Request Button de Stripe.js) : uniquement
        // pour un encaissement réel (pas le paiement-test de validation carte),
        // et seulement si le navigateur/l'appareil déclare Apple Pay disponible
        // (Safari + Wallet). Le bouton natif s'affiche lui-même, ou rien du tout.
        if (mode === "charge") {
          const pr = stripe.paymentRequest({
            country: "CM",
            currency: (currency || "XAF").toLowerCase(),
            total: { label: "KOMPTA", amount: Math.round(amountCents / 100) },
          });
          paymentRequestRef.current = pr;
          const result = await pr.canMakePayment();
          if (!cancelled && result?.applePay) setCanApplePay(true);
        }

        // Le montage de l'élément carte se fait dans un useEffect dédié (ci-dessous),
        // une fois que React a réellement peint le conteneur (fiable sur mobile).
        setPhase("form");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error && e.message === "stripe_js_load_failed" ? tr("components.stripe.errors.loadFailed") : e instanceof Error ? e.message : tr("components.stripe.errors.cardUnavailable"));
        setPhase("failed");
      }
    })();
    return () => { cancelled = true; cardElementRef.current?.destroy(); prButtonElementRef.current?.destroy(); };
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

  // Montage du bouton Apple Pay (Payment Request Button) : même logique de
  // timing que la carte, uniquement si `canMakePayment()` a confirmé Apple Pay.
  useEffect(() => {
    if (phase !== "form" || !canApplePay || !stripeRef.current || !paymentRequestRef.current || !prButtonMountRef.current || prButtonElementRef.current) return;
    const elements = stripeRef.current.elements();
    const prButton = elements.create("paymentRequestButton", {
      paymentRequest: paymentRequestRef.current,
      style: { paymentRequestButton: { type: "default", theme: "dark", height: "44px" } },
    });
    prButton.mount(prButtonMountRef.current);
    prButtonElementRef.current = prButton;
    paymentRequestRef.current.on("paymentmethod", (ev) => { void handleApplePayMethod(ev as StripePaymentMethodEvent); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, canApplePay]);

  async function finalizeSuccess(transactionId: number) {
    try {
      if (mode === "verify") {
        const res = await api.confirmCardTest(transactionId);
        if (!res.verified) throw new Error(res.status || "verification_failed");
      } else {
        await waitForServerConfirmation(transactionId);
      }
      setPhase("succeeded");
      setTimeout(() => onSuccess(transactionId), 900);
    } catch (e) {
      setPhase("form");
      setError(e instanceof Error ? e.message : tr("components.stripe.errors.serverConfirmation"));
    }
  }

  async function handleApplePayMethod(ev: StripePaymentMethodEvent) {
    if (!stripeRef.current || !clientSecret || !txnId) { ev.complete("fail"); return; }
    setPhase("processing"); setError(null);
    const result = await stripeRef.current.confirmCardPayment(
      clientSecret,
      { payment_method: ev.paymentMethod.id },
      { handleActions: false },
    );
    if (result.error) {
      ev.complete("fail");
      setPhase("form");
      setError(result.error.message ?? tr("components.payments.refused"));
      return;
    }
    ev.complete("success");
    if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "requires_capture") {
      await finalizeSuccess(txnId);
    } else {
      setPhase("form");
      setError(tr("components.stripe.errors.unexpectedStatus"));
    }
  }

  async function handlePay() {
    if (!stripeRef.current || !clientSecret || !cardElementRef.current) return;
    setPhase("processing"); setError(null);
    const result = await stripeRef.current.confirmCardPayment(clientSecret, { payment_method: { card: cardElementRef.current as unknown as object } });
    if (result.error) { setPhase("form"); setError(result.error.message ?? tr("components.payments.refused")); }
    else if (result.paymentIntent?.status === "succeeded") {
      if (!txnId) { setPhase("form"); setError(tr("components.stripe.errors.transactionMissing")); return; }
      await finalizeSuccess(txnId);
    }
    else { setPhase("form"); setError(tr("components.stripe.errors.unexpectedStatus")); }
  }

  async function waitForServerConfirmation(transactionId: number) {
    let lastError = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const status = await api.paymentStatus(transactionId);
        if (status.status === "succeeded") return;
        if (status.status === "failed" || status.status === "cancelled") {
          lastError = status.failure_reason || tr("components.stripe.errors.refusedByStripe");
          break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : tr("components.stripe.errors.serverUnavailable");
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    throw new Error(lastError || tr("components.stripe.errors.waitingServer"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-blue-500" />
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("components.stripe.title")}</h3>
            <Lock size={11} className="text-[#aaaabc]" aria-label={tr("components.stripe.secureConnection")} />
          </div>
          <button onClick={onClose} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-extrabold text-[#17211f] dark:text-white">{money(Math.round(amountCents / 100))}</p>
            <p className="text-xs text-[#717182]">{description || tr("components.payments.payment")}</p>
          </div>
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-xs text-[#717182]">{tr("components.stripe.connecting")}</p>
            </div>
          )}

          {/* Mode Stripe en ligne */}
          {(phase === "form" || phase === "processing") && (
            <>
              {canApplePay && (
                <div className="space-y-2">
                  <div ref={prButtonMountRef} className="min-h-[44px]" />
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[#aaaabc]">
                    <div className="h-px flex-1 bg-black/[0.08] dark:bg-white/[0.08]" />
                    {tr("common.or", { defaultValue: "ou" })}
                    <div className="h-px flex-1 bg-black/[0.08] dark:bg-white/[0.08]" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-2">{tr("components.stripe.cardInfo")}</label>
                <div ref={cardMountRef} className="rounded-xl border border-black/[0.10] dark:border-white/[0.10] bg-white dark:bg-[#252931] px-4 py-3.5 min-h-[46px] transition focus-within:border-blue-400" />
                {cardError && <p className="mt-1.5 text-xs text-rose-500">{cardError}</p>}
                {error && <p className="mt-1.5 text-xs text-rose-500">{error}</p>}
              </div>
              {stripeMode === "test" && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300">
                  <span className="font-bold">{tr("components.stripe.testMode")}</span> {tr("components.stripe.testCard")} <span className="font-mono">4242 4242 4242 4242</span> · {tr("components.stripe.futureDate")} · {tr("components.stripe.cvc")}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-[#aaaabc]"><Lock size={10} /> {tr("components.stripe.encrypted")}</div>
              <button onClick={handlePay} disabled={phase === "processing" || !!cardError}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-sm font-bold text-white transition disabled:opacity-50">
                {phase === "processing" ? <><Loader2 size={15} className="animate-spin" /> {tr("components.stripe.bankConfirmation")}</> : <><CreditCard size={15} /> {tr("components.stripe.payAmount", { amount: money(Math.round(amountCents / 100)) })}</>}
              </button>
            </>
          )}

          {phase === "succeeded" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={44} className="text-emerald-500" />
              <p className="font-bold text-emerald-700 dark:text-emerald-400">{tr("components.payments.confirmed")}</p>
              <p className="text-xs text-[#717182]">{tr("components.stripe.saleWillBeRecorded")}</p>
            </div>
          )}
          {phase === "failed" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertTriangle size={32} className="text-rose-500" />
              <p className="text-sm font-semibold text-rose-600">{error ?? tr("components.stripe.errors.connectionImpossible")}</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                {tr("components.stripe.configurePrefix")} <span className="font-mono">STRIPE_SECRET_KEY</span>, <span className="font-mono">STRIPE_PUBLISHABLE_KEY</span> {tr("components.stripe.configureAnd")} <span className="font-mono">STRIPE_WEBHOOK_SECRET</span> {tr("components.stripe.configureSuffix")}
              </div>
              <button onClick={onClose} className="rounded-xl bg-[#17211f] px-4 py-2 text-sm font-bold text-white hover:bg-black">{tr("common.close")}</button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5 pb-4 text-[10px] text-[#aaaabc]">
          <Lock size={9} /> <span>{tr("components.stripe.poweredBy")}</span>
          <span className="font-extrabold text-[#635BFF]">stripe</span>
        </div>
      </div>
    </div>
  );
}
