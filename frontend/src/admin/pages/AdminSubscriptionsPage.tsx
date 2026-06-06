import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, CreditCard, Gift, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/ConfirmProvider";
import { api, type PromotionDto, type SubscriptionPlanDto } from "../../services/api";

type Tab = "plans" | "promos" | "companies";

const money = (cents: number, cur = "XAF") =>
  `${(cents / 100).toLocaleString("fr-FR")} ${cur}`;

export function AdminSubscriptionsPage() {
  const [tab, setTab] = useState<Tab>("plans");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Abonnements</h1>
        <p className="text-sm text-white/50">Plans, promotions et statut des entreprises — gestion en direct.</p>
      </div>
      <div className="flex gap-2">
        {([["plans", "Plans", CreditCard], ["promos", "Promotions", Tag], ["companies", "Entreprises", Gift]] as const).map(
          ([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === k ? "bg-emerald-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ),
        )}
      </div>
      {tab === "plans" && <PlansSection />}
      {tab === "promos" && <PromosSection />}
      {tab === "companies" && <CompaniesSection />}
    </div>
  );
}

/* ─────────────────────────── PLANS ─────────────────────────── */
function PlansSection() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const plans = useQuery({ queryKey: ["adminPlans"], queryFn: api.adminPlans });
  const [creating, setCreating] = useState(false);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<SubscriptionPlanDto> }) => api.adminUpdatePlan(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminPlans"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.adminDeletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminPlans"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700">
          <Plus size={15} /> Nouveau plan
        </button>
      </div>
      {plans.isLoading && <p className="text-white/50">Chargement…</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.data?.map((p) => (
          <PlanCard key={p.id} plan={p} onSave={(patch) => update.mutate({ id: p.id, patch })} onDelete={async () => {
            if (await confirm({ title: `Supprimer le plan ${p.name} ?`, message: "S'il est utilisé, il sera désactivé.", danger: true, confirmLabel: "Supprimer" })) del.mutate(p.id);
          }} />
        ))}
      </div>
      {creating && <PlanModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function PlanCard({ plan, onSave, onDelete }: { plan: SubscriptionPlanDto; onSave: (p: Partial<SubscriptionPlanDto>) => void; onDelete: () => void }) {
  const [price, setPrice] = useState(Math.round(plan.price_cents / 100));
  const [name, setName] = useState(plan.name);
  const dirty = price !== Math.round(plan.price_cents / 100) || name !== plan.name;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent text-lg font-black text-white outline-none" />
        <button onClick={() => onSave({ is_active: !plan.is_active })} title={plan.is_active ? "Actif" : "Inactif"}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>
          {plan.is_active ? "ACTIF" : "INACTIF"}
        </button>
      </div>
      <p className="mt-1 text-xs text-white/50">{plan.description}</p>
      <div className="mt-3 flex items-center gap-2">
        <input type="number" value={price} min={0} step={500} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
          className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm font-mono text-white outline-none focus:border-emerald-500" />
        <span className="text-sm text-white/50">{plan.currency} / {plan.period === "year" ? "an" : "mois"}</span>
      </div>
      <ul className="mt-3 space-y-1">
        {plan.features.slice(0, 5).map((f, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-white/60"><Check size={12} className="text-emerald-400" /> {f}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button disabled={!dirty} onClick={() => onSave({ price_cents: price * 100, name })}
          className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Enregistrer</button>
        <button onClick={onDelete} className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-rose-300 hover:bg-rose-500/30"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function PlanModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", name: "", description: "", price: 0, period: "month", features: "" });
  const create = useMutation({
    mutationFn: () => api.adminCreatePlan({
      code: f.code.trim().toLowerCase(), name: f.name, description: f.description,
      price_cents: f.price * 100, period: f.period as "month" | "year",
      features: f.features.split("\n").map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminPlans"] }); onClose(); },
  });
  return (
    <Modal title="Nouveau plan" onClose={onClose}>
      <Field label="Code (unique)"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className={inp} placeholder="enterprise" /></Field>
      <Field label="Nom"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></Field>
      <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inp} /></Field>
      <div className="flex gap-2">
        <Field label="Prix (XAF)"><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) || 0 })} className={inp} /></Field>
        <Field label="Période"><select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} className={inp}><option value="month">Mensuel</option><option value="year">Annuel</option></select></Field>
      </div>
      <Field label="Fonctionnalités (une par ligne)"><textarea value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} rows={4} className={inp} /></Field>
      {create.error && <p className="text-xs text-rose-400">{create.error.message}</p>}
      <button disabled={!f.code || !f.name || create.isPending} onClick={() => create.mutate()} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Créer le plan</button>
    </Modal>
  );
}

/* ─────────────────────────── PROMOS ─────────────────────────── */
function PromosSection() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const promos = useQuery({ queryKey: ["adminPromos"], queryFn: api.adminPromotions });
  const [creating, setCreating] = useState(false);
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => api.adminUpdatePromo(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminPromos"] }),
  });
  const del = useMutation({ mutationFn: (id: number) => api.adminDeletePromo(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["adminPromos"] }) });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Plus size={15} /> Nouvelle promo</button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-white/40">
            <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Réduction</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Utilisé</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {promos.data?.map((p) => (
              <tr key={p.id} className="text-white/80">
                <td className="px-4 py-2 font-mono font-bold">{p.code}</td>
                <td className="px-4 py-2">-{p.percent_off}%</td>
                <td className="px-4 py-2 text-white/50">{p.plan_code || "Tous"}</td>
                <td className="px-4 py-2 text-white/50">{p.times_redeemed}{p.max_redemptions ? `/${p.max_redemptions}` : ""}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggle.mutate({ id: p.id, is_active: !p.is_active })} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>{p.is_active ? "ACTIVE" : "INACTIVE"}</button>
                </td>
                <td className="px-4 py-2 text-right"><button onClick={async () => { if (await confirm({ title: `Supprimer ${p.code} ?`, danger: true, confirmLabel: "Supprimer" })) del.mutate(p.id); }} className="text-rose-400 hover:text-rose-300"><Trash2 size={14} /></button></td>
              </tr>
            ))}
            {!promos.data?.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-white/40">Aucune promotion.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <PromoModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function PromoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", description: "", percent_off: 10, plan_code: "", max_redemptions: 0 });
  const create = useMutation({
    mutationFn: () => api.adminCreatePromo({ code: f.code.trim().toUpperCase(), description: f.description, percent_off: f.percent_off, plan_code: f.plan_code, max_redemptions: f.max_redemptions }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminPromos"] }); onClose(); },
  });
  return (
    <Modal title="Nouvelle promotion" onClose={onClose}>
      <Field label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className={inp} placeholder="BIENVENUE20" /></Field>
      <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inp} /></Field>
      <div className="flex gap-2">
        <Field label="Réduction %"><input type="number" min={0} max={100} value={f.percent_off} onChange={(e) => setF({ ...f, percent_off: Number(e.target.value) || 0 })} className={inp} /></Field>
        <Field label="Limite (0=∞)"><input type="number" min={0} value={f.max_redemptions} onChange={(e) => setF({ ...f, max_redemptions: Number(e.target.value) || 0 })} className={inp} /></Field>
      </div>
      <Field label="Plan ciblé (vide = tous)"><input value={f.plan_code} onChange={(e) => setF({ ...f, plan_code: e.target.value })} className={inp} placeholder="pro" /></Field>
      {create.error && <p className="text-xs text-rose-400">{create.error.message}</p>}
      <button disabled={!f.code || create.isPending} onClick={() => create.mutate()} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Créer</button>
    </Modal>
  );
}

/* ─────────────────────────── COMPANIES ─────────────────────────── */
function CompaniesSection() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const rows = useQuery({ queryKey: ["adminCompanySubs"], queryFn: api.adminCompanySubs });
  const inv = () => qc.invalidateQueries({ queryKey: ["adminCompanySubs"] });
  const suspend = useMutation({ mutationFn: (id: number) => api.adminSubSuspend(id), onSuccess: inv });
  const reactivate = useMutation({ mutationFn: (id: number) => api.adminSubReactivate(id), onSuccess: inv });
  const grant = useMutation({ mutationFn: ({ id, plan, days }: { id: number; plan: string; days: number }) => api.adminGrantCompany(id, plan, days), onSuccess: inv });

  const badge = (s: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500/20 text-emerald-300", trialing: "bg-sky-500/20 text-sky-300",
      past_due: "bg-amber-500/20 text-amber-300", suspended: "bg-rose-500/20 text-rose-300",
      none: "bg-white/10 text-white/40", cancelled: "bg-white/10 text-white/40",
    };
    return map[s] || "bg-white/10 text-white/40";
  };

  return (
    <div className="space-y-3">
      <button onClick={inv} className="flex items-center gap-2 text-xs text-white/50 hover:text-white"><RefreshCw size={13} /> Rafraîchir</button>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-white/40">
            <tr><th className="px-4 py-2">Entreprise</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2">Échéance</th><th className="px-4 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.data?.map((r) => (
              <tr key={r.company_id} className="text-white/80">
                <td className="px-4 py-2 font-semibold">{r.company_name}</td>
                <td className="px-4 py-2 text-white/50">{r.plan_code || "—"}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(r.status)}`}>{r.status.toUpperCase()}</span></td>
                <td className="px-4 py-2 text-white/50">{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => grant.mutate({ id: r.company_id, plan: r.plan_code || "pro", days: 30 })} title="Offrir 30 jours" className="rounded-lg bg-violet-500/20 px-2 py-1 text-violet-300 hover:bg-violet-500/30"><Gift size={14} /></button>
                    {r.company_status === "suspended" ? (
                      <button onClick={() => reactivate.mutate(r.company_id)} title="Réactiver" className="rounded-lg bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30"><Check size={14} /></button>
                    ) : (
                      <button onClick={async () => { if (await confirm({ title: `Suspendre ${r.company_name} ?`, message: "L'accès sera bloqué jusqu'au paiement.", danger: true, confirmLabel: "Suspendre" })) suspend.mutate(r.company_id); }} title="Suspendre" className="rounded-lg bg-rose-500/20 px-2 py-1 text-rose-300 hover:bg-rose-500/30"><Ban size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shared UI ─────────────────────────── */
const inp = "mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-white/50">{label}{children}</label>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-black text-white">{title}</h3><button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
