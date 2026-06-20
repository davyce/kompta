import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, Smartphone, Landmark, CreditCard, CheckCircle2, AlertTriangle, Loader2, ShieldCheck,
} from "lucide-react";
import { api } from "../services/api";
import type { CollectionMethod } from "../types/domain";
import { StripeCardPaymentModal } from "./StripeCardPaymentModal";

type ProviderKey = CollectionMethod["provider"];

const PROVIDERS: Array<{
  key: ProviderKey;
  label: string;
  hint: string;
  icon: typeof Banknote;
  needs: "none" | "merchant" | "bank" | "card";
}> = [
  { key: "cash",         label: "Espèces",        hint: "Paiement en liquide au comptoir. Aucun frais.",                         icon: Banknote,   needs: "none" },
  { key: "momo_mtn",     label: "MTN MoMo",       hint: "Votre code/numéro marchand MTN Mobile Money. L'argent va direct chez vous.", icon: Smartphone, needs: "merchant" },
  { key: "momo_airtel",  label: "Airtel Money",   hint: "Votre code/numéro marchand Airtel Money.",                              icon: Smartphone, needs: "merchant" },
  { key: "momo_moov",    label: "Moov Money",     hint: "Votre code/numéro marchand Moov Money.",                                icon: Smartphone, needs: "merchant" },
  { key: "bank_transfer",label: "Virement bancaire", hint: "Coordonnées bancaires affichées au client pour un virement.",        icon: Landmark,   needs: "bank" },
  { key: "card_stripe",  label: "Carte (Visa/Mastercard)", hint: "Encaissement en ligne par carte. Validé par un paiement-test.", icon: CreditCard, needs: "card" },
];

function emptyDraft(provider: ProviderKey): CollectionMethod {
  return {
    id: 0, provider, label: "", enabled: false, merchant_number: "", account_name: "",
    bank_name: "", bank_account: "", instructions: "", verified: false, verified_at: null, last_test_status: "",
  };
}

export function CollectionMethodsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["collection-methods"], queryFn: () => api.listCollectionMethods() });
  const [cardTestOpen, setCardTestOpen] = useState(false);

  const byProvider = useMemo(() => {
    const map = new Map<ProviderKey, CollectionMethod>();
    (q.data?.methods ?? []).forEach((m) => map.set(m.provider, m));
    return map;
  }, [q.data]);

  const upsert = useMutation({
    mutationFn: (m: Partial<CollectionMethod> & { provider: string }) => api.upsertCollectionMethod(m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collection-methods"] }),
  });

  const canCollect = q.data?.can_collect ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#17211f] dark:text-white">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h3 className="font-black">Encaissement</h3>
          </div>
          <p className="mt-1 max-w-xl text-sm text-[#717182]">
            Déclarez comment vos clients vous paient. L'argent va <strong>directement</strong> sur votre compte —
            KOMPTA ne transite jamais les fonds. Tant qu'aucune méthode n'est activée et vérifiée, l'encaissement est bloqué.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black shadow-sm ${canCollect ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"}`}>
          {canCollect ? "Encaissement actif" : "Aucune méthode active"}
        </span>
      </div>

      {!canCollect && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Configurez au moins une méthode ci-dessous pour pouvoir encaisser vos ventes et factures.
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[#717182]"><Loader2 size={16} className="animate-spin" /> Chargement…</div>
      ) : (
        <div className="grid gap-3">
          {PROVIDERS.map((p) => {
            const current = byProvider.get(p.key) ?? emptyDraft(p.key);
            return (
              <ProviderCard
                key={p.key}
                def={p}
                method={current}
                saving={upsert.isPending}
                onSave={(patch) => upsert.mutate({ provider: p.key, ...patch })}
                onTestCard={() => setCardTestOpen(true)}
              />
            );
          })}
        </div>
      )}

      {cardTestOpen && (
        <StripeCardPaymentModal
          amountCents={50_000}
          mode="verify"
          description="Validation de votre carte (≈500 FCFA)"
          onSuccess={() => { setCardTestOpen(false); qc.invalidateQueries({ queryKey: ["collection-methods"] }); }}
          onClose={() => setCardTestOpen(false)}
        />
      )}
    </div>
  );
}

function ProviderCard({
  def, method, saving, onSave, onTestCard,
}: {
  def: typeof PROVIDERS[number];
  method: CollectionMethod;
  saving: boolean;
  onSave: (patch: Partial<CollectionMethod>) => void;
  onTestCard: () => void;
}) {
  const Icon = def.icon;
  const [merchant, setMerchant] = useState(method.merchant_number);
  const [account, setAccount] = useState(method.account_name);
  const [bankName, setBankName] = useState(method.bank_name);
  const [bankAccount, setBankAccount] = useState(method.bank_account);
  const [instructions, setInstructions] = useState(method.instructions);

  const isCard = def.needs === "card";
  const verified = method.verified;

  function save(enabled: boolean) {
    onSave({
      enabled,
      merchant_number: merchant,
      account_name: account,
      bank_name: bankName,
      bank_account: bankAccount,
      instructions,
    });
  }

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2229]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Icon size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-black text-[#17211f] dark:text-white">{def.label}</p>
              {verified && method.enabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  <CheckCircle2 size={11} /> Vérifié
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#717182]">{def.hint}</p>
          </div>
        </div>
      </div>

      {/* Champs selon le type */}
      {def.needs === "merchant" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Code / n° marchand"
            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Nom du compte (ex: KOMPTA SARL)"
            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
        </div>
      )}
      {def.needs === "bank" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Nom de la banque"
            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
          <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="RIB / IBAN"
            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
        </div>
      )}
      {(def.needs === "merchant" || def.needs === "bank") && (
        <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Consignes affichées au client (facultatif)"
          className="mt-2 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isCard ? (
          <>
            {verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                <CheckCircle2 size={15} /> Carte validée
              </span>
            ) : (
              <button onClick={onTestCard}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <CreditCard size={15} /> Valider par paiement-test (≈500 FCFA)
              </button>
            )}
            <p className="text-xs text-[#717182]">La carte sert surtout à l'abonnement et à la clientèle internationale.</p>
          </>
        ) : method.enabled ? (
          <>
            <button onClick={() => save(false)} disabled={saving}
              className="rounded-lg border border-black/[0.1] px-3.5 py-2 text-sm font-bold text-[#717182] hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/[0.1] dark:hover:bg-white/[0.05]">
              Désactiver
            </button>
            <button onClick={() => save(true)} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Enregistrer
            </button>
          </>
        ) : (
          <button onClick={() => save(true)} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Activer
          </button>
        )}
      </div>
    </div>
  );
}
