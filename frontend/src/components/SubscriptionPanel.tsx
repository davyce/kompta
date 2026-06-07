import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Loader2, QrCode, Smartphone, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type SubscriptionPlanDto } from "../services/api";
import { useCurrency } from "../contexts/CurrencyContext";
import type { CurrencyCode } from "../utils/format";

/** Affiche un prix (en centimes, dans la devise du plan) converti dans la devise
 * de l'utilisateur. Ex. 1 000 000 XAF → « 1 524 € » si l'utilisateur est en EUR. */
function usePriceFormatter() {
  const { convert, formatInCurrency } = useCurrency();
  return (cents: number, planCurrency: string) =>
    formatInCurrency(convert(cents / 100, (planCurrency || "XAF") as CurrencyCode, "XAF"));
}

/* Stripe.js minimal (réutilisé du modal carte) */
interface StripeCardElement { mount(el: HTMLElement): void; destroy(): void; on(e: string, h: (ev: { error?: { message: string } }) => void): void; }
interface StripeElements { create(type: "card", options?: object): StripeCardElement; }
interface StripeInstance { elements(): StripeElements; confirmCardPayment(s: string, d: object): Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>; }
declare global { interface Window { Stripe?: (key: string) => StripeInstance } }
let _p: Promise<void> | null = null;
function loadStripe(): Promise<void> {
  if (_p) return _p;
  _p = new Promise((res, rej) => {
    if (document.querySelector("script[src*='stripe.com/v3']")) return res();
    const s = document.createElement("script"); s.src = "https://js.stripe.com/v3/";
    s.onload = () => res(); s.onerror = () => rej(new Error("Stripe.js indisponible")); document.head.appendChild(s);
  });
  return _p;
}

export function SubscriptionPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const money = usePriceFormatter();
  const me = useQuery({ queryKey: ["mySubscription"], queryFn: api.mySubscription });
  const plans = useQuery({ queryKey: ["subscriptionPlans"], queryFn: api.subscriptionPlans });
  const [checkout, setCheckout] = useState<SubscriptionPlanDto | null>(null);

  const status = me.data?.status ?? "none";
  const statusLabel: Record<string, { t: string; c: string }> = {
    active: { t: "Actif", c: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" },
    trialing: { t: "Essai", c: "text-sky-600 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300" },
    past_due: { t: "Échu — à renouveler", c: "text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" },
    suspended: { t: "Suspendu", c: "text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300" },
    none: { t: "Aucun abonnement", c: "text-stone-500 bg-stone-100 dark:bg-white/10 dark:text-white/50" },
    cancelled: { t: "Annulé", c: "text-stone-500 bg-stone-100 dark:bg-white/10 dark:text-white/50" },
  };
  const sl = statusLabel[status] ?? statusLabel.none;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/10 dark:bg-[#1e2229]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#717182]">Mon abonnement</p>
              <p className="mt-1 text-lg font-black text-[#17211f] dark:text-white">{me.data?.plan?.name ?? "—"}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${sl.c}`}>{sl.t}</span>
          </div>
          {me.data?.current_period_end && (
            <p className="mt-2 text-xs text-[#717182]">
              {status === "past_due" ? "Expiré le " : "Valable jusqu'au "}
              {new Date(me.data.current_period_end).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {plans.data?.map((p) => {
          const current = me.data?.plan_code === p.code && status !== "none";
          return (
            <div key={p.id} className={`flex flex-col rounded-2xl border p-4 ${current ? "border-emerald-500 ring-1 ring-emerald-500" : "border-black/[0.08] dark:border-white/10"} bg-white dark:bg-[#1e2229]`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-[#17211f] dark:text-white">{p.name}</h3>
                {current && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">ACTUEL</span>}
              </div>
              <p className="mt-1 text-xs text-[#717182]">{p.description}</p>
              <p className="mt-3 text-2xl font-extrabold text-[#17211f] dark:text-white">
                {p.price_cents === 0 ? "Gratuit" : money(p.price_cents, p.currency)}
                {p.price_cents > 0 && <span className="text-sm font-medium text-[#717182]">/{p.period === "year" ? "an" : "mois"}</span>}
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[#3f4a55] dark:text-white/70"><Check size={13} className="mt-0.5 shrink-0 text-emerald-500" /> {f}</li>
                ))}
              </ul>
              <button
                onClick={() => setCheckout(p)}
                disabled={current && status === "active"}
                className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                {current && status === "active" ? "Abonnement actif" : p.price_cents === 0 ? "Activer" : current ? "Renouveler" : "Choisir ce plan"}
              </button>
            </div>
          );
        })}
      </div>

      {checkout && (
        <CheckoutModal
          plan={checkout}
          onClose={() => setCheckout(null)}
          onDone={() => { setCheckout(null); qc.invalidateQueries({ queryKey: ["mySubscription"] }); qc.invalidateQueries({ queryKey: ["overview"] }); }}
        />
      )}
    </div>
  );
}

type Method = "card" | "momo" | "zola";
type Phase = "choose" | "card_form" | "processing" | "zola" | "success" | "failed";

function CheckoutModal({ plan, onClose, onDone }: { plan: SubscriptionPlanDto; onClose: () => void; onDone: () => void }) {
  const money = usePriceFormatter();
  const { currency } = useCurrency();
  const billedNote = currency !== (plan.currency || "XAF")
    ? ` (facturé en ${plan.currency})` : "";
  const [method, setMethod] = useState<Method>("card");
  const [promo, setPromo] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("choose");
  const [error, setError] = useState<string | null>(null);
  const [finalCents, setFinalCents] = useState(plan.price_cents);
  const [promoOk, setPromoOk] = useState<boolean | null>(null);
  const [zolaInfo, setZolaInfo] = useState<{ reference: string; instructions: string } | null>(null);

  const cardMount = useRef<HTMLDivElement>(null);
  const cardEl = useRef<StripeCardElement | null>(null);
  const stripeRef = useRef<StripeInstance | null>(null);
  const txnRef = useRef<number | null>(null);

  async function applyPromo() {
    if (!promo.trim()) { setPromoOk(null); setFinalCents(plan.price_cents); return; }
    try {
      const r = await api.validatePromo(promo.trim(), plan.code);
      setPromoOk(r.valid); setFinalCents(r.valid ? r.final_cents : plan.price_cents);
    } catch { setPromoOk(false); }
  }

  async function start() {
    setError(null);
    try {
      const res = await api.subscriptionCheckout({ plan_code: plan.code, method, promo_code: promo.trim() || undefined, payer_phone: method === "momo" ? phone.trim() : undefined });
      if (res.free || res.status === "active") { setPhase("success"); setTimeout(onDone, 1200); return; }
      txnRef.current = res.transaction_id ?? null;

      if (method === "card") {
        await loadStripe();
        if (!window.Stripe || !res.publishable_key || !res.client_secret) throw new Error("Configuration carte indisponible.");
        const stripe = window.Stripe(res.publishable_key);
        stripeRef.current = stripe;
        setPhase("card_form");
        requestAnimationFrame(() => {
          if (!cardMount.current) return;
          const el = stripe.elements().create("card", { hidePostalCode: true });
          el.mount(cardMount.current);
          el.on("change", (ev) => setError(ev.error?.message ?? null));
          cardEl.current = el;
          (cardEl.current as unknown as { _secret: string })._secret = res.client_secret!;
        });
      } else if (method === "momo") {
        setPhase("processing");
        await pollConfirm();
      } else {
        setZolaInfo({ reference: res.reference ?? "", instructions: res.instructions ?? "" });
        setPhase("zola");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur de paiement."); setPhase("failed"); }
  }

  async function payCard() {
    if (!stripeRef.current || !cardEl.current) return;
    const secret = (cardEl.current as unknown as { _secret: string })._secret;
    setPhase("processing"); setError(null);
    const r = await stripeRef.current.confirmCardPayment(secret, { payment_method: { card: cardEl.current as unknown as object } });
    if (r.error) { setPhase("card_form"); setError(r.error.message ?? "Paiement refusé."); return; }
    if (r.paymentIntent?.status === "succeeded") await pollConfirm();
    else { setPhase("card_form"); setError("Statut inattendu, réessayez."); }
  }

  async function pollConfirm() {
    if (!txnRef.current) return;
    for (let i = 0; i < 12; i++) {
      try {
        const s = await api.confirmSubscription(txnRef.current);
        if (s.status === "active") { setPhase("success"); setTimeout(onDone, 1200); return; }
        if (s.status === "failed" || s.status === "cancelled") { setPhase("failed"); setError("Paiement échoué."); return; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setPhase("failed");
    setError("Paiement non confirmé à temps. Si le montant a été débité, contactez le support.");
  }

  useEffect(() => () => cardEl.current?.destroy(), []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/10">
          <h3 className="font-bold text-[#17211f] dark:text-white">{plan.name} — {money(finalCents, plan.currency)}<span className="text-xs font-normal text-[#717182]">{billedNote}</span></h3>
          <button onClick={onClose} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {phase === "choose" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#717182]">Code promo</label>
                <div className="flex gap-2">
                  <input value={promo} onChange={(e) => setPromo(e.target.value)} onBlur={applyPromo} placeholder="Optionnel"
                    className="flex-1 rounded-lg border border-black/[0.10] bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#252931] dark:text-white" />
                  <button onClick={applyPromo} className="rounded-lg bg-[#17211f] px-3 text-xs font-bold text-white dark:bg-white/10">OK</button>
                </div>
                {promoOk === true && <p className="mt-1 text-xs font-semibold text-emerald-600">Promo appliquée → {money(finalCents, plan.currency)}</p>}
                {promoOk === false && <p className="mt-1 text-xs text-rose-500">Code invalide.</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([["card", "Carte", CreditCard], ["momo", "MoMo", Smartphone], ["zola", "Zola", QrCode]] as const).map(([m, lab, Icon]) => (
                  <button key={m} onClick={() => setMethod(m)} className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-semibold transition ${method === m ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-black/[0.08] text-[#717182] dark:border-white/10"}`}>
                    <Icon size={18} /> {lab}
                  </button>
                ))}
              </div>
              {method === "momo" && (
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro Mobile Money (+242…)"
                  className="w-full rounded-lg border border-black/[0.10] bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#252931] dark:text-white" />
              )}
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <button onClick={start} disabled={method === "momo" && !phone.trim()}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                {finalCents === 0 ? "Activer gratuitement" : `Payer ${money(finalCents, plan.currency)}`}
              </button>
            </>
          )}

          {phase === "card_form" && (
            <>
              <div ref={cardMount} className="rounded-xl border border-black/[0.10] bg-white px-4 py-3.5 dark:border-white/10 dark:bg-[#252931]" />
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <button onClick={payCard} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Payer {money(finalCents, plan.currency)}</button>
            </>
          )}

          {phase === "processing" && (
            <div className="flex flex-col items-center gap-2 py-8"><Loader2 size={28} className="animate-spin text-emerald-500" /><p className="text-xs text-[#717182]">Confirmation du paiement…</p></div>
          )}

          {phase === "zola" && zolaInfo && (
            <div className="space-y-3 text-center">
              <QrCode size={48} className="mx-auto text-[#17211f] dark:text-white" />
              <p className="text-sm text-[#3f4a55] dark:text-white/70">{zolaInfo.instructions}</p>
              <p className="rounded-lg bg-stone-100 px-3 py-2 font-mono text-xs dark:bg-white/10 dark:text-white">Réf : {zolaInfo.reference.slice(0, 18)}</p>
              <p className="text-[11px] text-[#717182]">Après paiement Zola, l'administrateur KOMPTA validera votre abonnement.</p>
              <button onClick={onClose} className="w-full rounded-xl bg-[#17211f] py-2.5 text-sm font-bold text-white dark:bg-white/10">Fermer</button>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/20"><Sparkles size={28} className="text-emerald-600" /></div>
              <p className="font-bold text-emerald-700 dark:text-emerald-400">Abonnement activé !</p>
            </div>
          )}

          {phase === "failed" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-rose-600">{error ?? "Paiement échoué."}</p>
              <button onClick={() => { setPhase("choose"); setError(null); }} className="w-full rounded-xl bg-[#17211f] py-2.5 text-sm font-bold text-white dark:bg-white/10">Réessayer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
