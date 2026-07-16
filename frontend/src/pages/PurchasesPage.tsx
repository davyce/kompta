import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Building2, CheckCircle2, Inbox, Link2, Loader2, Package, Plus, Search, Trash2, Truck, X, XCircle,
} from "lucide-react";

import { api, type PurchaseOrderDto, type SupplierDto } from "../services/api";
import { money } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";

type Tab = "suppliers" | "orders" | "received";

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon", ordered: "Commandé", received: "Reçu", paid: "Payé", cancelled: "Annulé",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-white/60",
  ordered: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  received: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  cancelled: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
const APPROVAL_LABEL: Record<string, string> = {
  pending: "En attente d'approbation", approved: "Approuvé", rejected: "Rejeté",
};

export function PurchasesPage() {
  useCurrency();
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Achats</p>
        <h1 className="text-2xl font-extrabold text-[#17211f] dark:text-white">Fournisseurs & Bons de commande</h1>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
        <button
          onClick={() => setTab("orders")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            tab === "orders" ? "bg-emerald-600 text-white" : "bg-white text-[#717182] hover:bg-black/[0.03] dark:bg-[#1e2229] dark:text-white/60 dark:hover:bg-white/[0.04]"
          }`}
        >
          <Truck size={15} /> Bons de commande
        </button>
        <button
          onClick={() => setTab("suppliers")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            tab === "suppliers" ? "bg-emerald-600 text-white" : "bg-white text-[#717182] hover:bg-black/[0.03] dark:bg-[#1e2229] dark:text-white/60 dark:hover:bg-white/[0.04]"
          }`}
        >
          <Building2 size={15} /> Fournisseurs
        </button>
        <button
          onClick={() => setTab("received")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            tab === "received" ? "bg-emerald-600 text-white" : "bg-white text-[#717182] hover:bg-black/[0.03] dark:bg-[#1e2229] dark:text-white/60 dark:hover:bg-white/[0.04]"
          }`}
        >
          <Inbox size={15} /> Commandes reçues
        </button>
      </div>

      {tab === "suppliers" ? <SuppliersTab /> : tab === "received" ? <ReceivedOrdersTab /> : <OrdersTab />}
    </div>
  );
}

/* ─────────────────────────── FOURNISSEURS ─────────────────────────── */
function SuppliersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm } = useConfirm();
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => api.suppliers() });
  const incomingQ = useQuery({ queryKey: ["supplierConnections", "incoming"], queryFn: () => api.incomingSupplierConnections("pending") });
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [connecting, setConnecting] = useState<SupplierDto | null>(null);
  const [showConnectCompany, setShowConnectCompany] = useState(false);

  const del = useMutation({
    mutationFn: (id: number) => api.deleteSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
    onError: () => toast.error("Impossible de supprimer ce fournisseur."),
  });

  const acceptConn = useMutation({
    mutationFn: (id: number) => api.acceptSupplierConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierConnections"] }),
    onError: () => toast.error("Impossible d'accepter cette connexion."),
  });
  const declineConn = useMutation({
    mutationFn: (id: number) => api.declineSupplierConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierConnections"] }),
    onError: () => toast.error("Impossible de refuser cette connexion."),
  });

  async function handleDelete(supplier: SupplierDto) {
    const ok = await confirm({
      title: "Supprimer ce fournisseur ?", message: supplier.name, confirmLabel: "Supprimer", danger: true,
    });
    if (ok) del.mutate(supplier.id);
  }

  const incoming = incomingQ.data ?? [];

  return (
    <div className="space-y-3">
      {incoming.length > 0 && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 p-4 space-y-2">
          <p className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">
            Demande(s) de connexion fournisseur reçue(s)
          </p>
          {incoming.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#1e2229] px-3 py-2">
              <p className="text-sm text-[#17211f] dark:text-white">
                <span className="font-bold">{c.requester_company_name}</span> souhaite vous ajouter comme fournisseur connecté
              </p>
              <div className="flex gap-1.5">
                <button onClick={() => acceptConn.mutate(c.id)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                  <CheckCircle2 size={12} /> Accepter
                </button>
                <button onClick={() => declineConn.mutate(c.id)} className="flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20">
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={() => setShowConnectCompany(true)}
          className="flex items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-3.5 py-2 text-sm font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20"
        >
          <Search size={15} /> Connecter une entreprise
        </button>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Plus size={15} /> Nouveau fournisseur
        </button>
      </div>

      {suppliersQ.isLoading && <p className="text-sm text-[#717182]">Chargement…</p>}
      {!suppliersQ.isLoading && (suppliersQ.data ?? []).length === 0 && (
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] py-14 text-center">
          <Building2 size={28} className="mx-auto text-[#d1d5db]" />
          <p className="mt-2 text-sm text-[#717182]">Aucun fournisseur pour l'instant.</p>
        </div>
      )}
      <div className="space-y-2">
        {(suppliersQ.data ?? []).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-[#17211f] dark:text-white">{s.name}</p>
                {s.linked_company_id && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <Link2 size={10} /> Connecté
                  </span>
                )}
              </div>
              <p className="text-xs text-[#717182]">
                {[s.email, s.phone, s.city].filter(Boolean).join(" · ") || "—"}
                {s.tax_id ? ` · NIU ${s.tax_id}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!s.linked_company_id && (
                <button onClick={() => setConnecting(s)} className="flex items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20">
                  <Link2 size={12} /> Connecter
                </button>
              )}
              <button onClick={() => setEditing(s)} className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                Modifier
              </button>
              <button onClick={() => handleDelete(s)} aria-label="Supprimer le fournisseur" className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1.5 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {(showNew || editing) && (
        <SupplierFormModal supplier={editing} onClose={() => { setShowNew(false); setEditing(null); }} />
      )}
      {connecting && (
        <ConnectSupplierModal supplier={connecting} onClose={() => setConnecting(null)} />
      )}
      {showConnectCompany && (
        <ConnectCompanyModal onClose={() => setShowConnectCompany(false)} />
      )}
    </div>
  );
}

function ConnectCompanyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const searchQ = useQuery({
    queryKey: ["companySearch", query],
    queryFn: () => api.searchCompanies(query),
    enabled: query.trim().length >= 2,
  });

  const connect = useMutation({
    mutationFn: (targetCompanyId: number) => api.connectCompanyDirect(targetCompanyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplierConnections"] });
      toast.success("Demande de connexion envoyée.");
      onClose();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Échec de l'envoi de la demande."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#17211f] dark:text-white">Connecter une entreprise</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} className="text-[#717182]" /></button>
        </div>
        <p className="text-xs text-[#717182]">
          Recherchez l'entreprise KOMPTA fournisseur par son nom ou son email. Une fiche
          fournisseur est créée automatiquement et la demande de connexion lui est envoyée —
          une fois qu'elle accepte, vos bons de commande apparaissent directement dans son espace Achats.
        </p>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717182]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou email de l'entreprise…"
            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#0f1418] pl-8 pr-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-indigo-400"
          />
        </div>
        {searchQ.isFetching && <p className="text-xs text-[#717182]">Recherche…</p>}
        {!searchQ.isFetching && query.trim().length >= 2 && (searchQ.data ?? []).length === 0 && (
          <p className="text-xs text-[#717182]">Aucune entreprise trouvée.</p>
        )}
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {(searchQ.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => connect.mutate(c.id)}
              disabled={connect.isPending}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] px-3 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{c.name}</p>
                <p className="truncate text-xs text-[#717182]">{[c.industry, c.city].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {connect.isPending ? <Loader2 size={14} className="shrink-0 animate-spin text-indigo-600" /> : <Link2 size={14} className="shrink-0 text-indigo-600" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectSupplierModal({ supplier, onClose }: { supplier: SupplierDto; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const searchQ = useQuery({
    queryKey: ["companySearch", query],
    queryFn: () => api.searchCompanies(query),
    enabled: query.trim().length >= 2,
  });

  const connect = useMutation({
    mutationFn: (targetCompanyId: number) => api.connectSupplier(supplier.id, targetCompanyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Demande de connexion envoyée.");
      onClose();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Échec de l'envoi de la demande."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#17211f] dark:text-white">Connecter « {supplier.name} »</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} className="text-[#717182]" /></button>
        </div>
        <p className="text-xs text-[#717182]">
          Recherchez l'entreprise KOMPTA correspondante. Une fois qu'elle accepte, vos bons de
          commande vers ce fournisseur apparaîtront directement dans son espace Achats.
        </p>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717182]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou email de l'entreprise…"
            className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] pl-9 pr-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500"
          />
        </div>
        {searchQ.isFetching && <p className="text-xs text-[#717182]">Recherche…</p>}
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {(searchQ.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-[#17211f] dark:text-white">{c.name}</p>
                <p className="text-xs text-[#717182]">{[c.industry, c.city].filter(Boolean).join(" · ")}</p>
              </div>
              <button
                onClick={() => connect.mutate(c.id)}
                disabled={connect.isPending}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Inviter
              </button>
            </div>
          ))}
          {query.trim().length >= 2 && !searchQ.isFetching && (searchQ.data ?? []).length === 0 && (
            <p className="text-xs text-[#717182] py-2">Aucune entreprise trouvée.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplierFormModal({ supplier, onClose }: { supplier: SupplierDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: supplier?.name ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "",
    address: supplier?.address ?? "", city: supplier?.city ?? "", country: supplier?.country ?? "Congo",
    notes: supplier?.notes ?? "", status: supplier?.status ?? "active",
    tax_id: supplier?.tax_id ?? "", payment_terms_days: supplier?.payment_terms_days ?? 30,
  });

  const save = useMutation({
    mutationFn: () => (supplier ? api.updateSupplier(supplier.id, form) : api.createSupplier(form)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); onClose(); },
  });

  const inputClass = "mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1e2229] p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#17211f] dark:text-white">{supplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} className="text-[#717182]" /></button>
        </div>
        <label className="block text-xs font-bold uppercase text-[#717182]">Nom *
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold uppercase text-[#717182]">Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-xs font-bold uppercase text-[#717182]">Téléphone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold uppercase text-[#717182]">Ville
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-xs font-bold uppercase text-[#717182]">NIU / NIF
            <input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs font-bold uppercase text-[#717182]">Adresse
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">Délai de paiement (jours)
          <input type="number" min={0} value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) || 0 })} className={inputClass} />
        </label>
        <button
          onClick={() => save.mutate()}
          disabled={!form.name.trim() || save.isPending}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {save.isPending ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── BONS DE COMMANDE ─────────────────────────── */
function OrdersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const ordersQ = useQuery({ queryKey: ["purchaseOrders"], queryFn: () => api.purchaseOrders() });
  const [showNew, setShowNew] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  const orderMut = useMutation({ mutationFn: (id: number) => api.orderPurchaseOrder(id), onSuccess: invalidate });
  const receiveMut = useMutation({
    mutationFn: (id: number) => api.receivePurchaseOrder(id),
    onSuccess: invalidate,
    onError: () => toast.error("Échec de la réception (écriture comptable)."),
  });
  const payMut = useMutation({
    mutationFn: (id: number) => api.payPurchaseOrder(id, "bank"),
    onSuccess: invalidate,
    onError: () => toast.error("Échec du règlement (écriture comptable)."),
  });
  const approveMut = useMutation({ mutationFn: (id: number) => api.approvePurchaseOrder(id), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.deletePurchaseOrder(id), onSuccess: invalidate });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Plus size={15} /> Nouveau bon de commande
        </button>
      </div>

      {ordersQ.isLoading && <p className="text-sm text-[#717182]">Chargement…</p>}
      {!ordersQ.isLoading && (ordersQ.data ?? []).length === 0 && (
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] py-14 text-center">
          <Truck size={28} className="mx-auto text-[#d1d5db]" />
          <p className="mt-2 text-sm text-[#717182]">Aucun bon de commande pour l'instant.</p>
        </div>
      )}
      <div className="space-y-2">
        {(ordersQ.data ?? []).map((po) => (
          <div key={po.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[po.status] ?? STATUS_TONE.draft}`}>
                    {STATUS_LABEL[po.status] ?? po.status}
                  </span>
                  {po.approval_status !== "not_required" && (
                    <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                      {APPROVAL_LABEL[po.approval_status] ?? po.approval_status}
                    </span>
                  )}
                  <p className="font-bold text-[#17211f] dark:text-white">{po.number} · {po.supplier_name}</p>
                </div>
                <p className="mt-0.5 text-xs text-[#717182]">
                  {po.lines.length} ligne(s) · {money(po.total_amount)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {po.status === "draft" && po.approval_status === "pending" && (
                  <button onClick={() => approveMut.mutate(po.id)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                    <CheckCircle2 size={12} /> Approuver
                  </button>
                )}
                {po.status === "draft" && po.approval_status !== "pending" && po.approval_status !== "rejected" && (
                  <button onClick={() => orderMut.mutate(po.id)} className="flex items-center gap-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-2.5 py-1.5 text-xs font-bold text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    Commander
                  </button>
                )}
                {(po.status === "draft" || po.status === "ordered") && po.approval_status !== "pending" && po.approval_status !== "rejected" && (
                  <button onClick={() => receiveMut.mutate(po.id)} disabled={receiveMut.isPending} className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">
                    <Package size={12} /> Réceptionner
                  </button>
                )}
                {po.status === "received" && (
                  <button onClick={() => payMut.mutate(po.id)} disabled={payMut.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    Régler
                  </button>
                )}
                {po.status === "draft" && (
                  <button onClick={() => deleteMut.mutate(po.id)} aria-label="Annuler le bon de commande" className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1.5 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20">
                    <XCircle size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewPurchaseOrderModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewPurchaseOrderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => api.suppliers() });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: api.products });
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lines, setLines] = useState<{ product_id: number | null; description: string; quantity: number; unit_cost: number; tax_rate: number }[]>([
    { product_id: null, description: "", quantity: 1, unit_cost: 0, tax_rate: 0 },
  ]);

  const create = useMutation({
    mutationFn: () => {
      if (!supplierId) throw new Error("Fournisseur requis");
      return api.createPurchaseOrder({ supplier_id: supplierId, lines });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchaseOrders"] }); onClose(); },
  });

  function updateLine(index: number, patch: Partial<(typeof lines)[0]>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((ls) => [...ls, { product_id: null, description: "", quantity: 1, unit_cost: 0, tax_rate: 0 }]); }
  function removeLine(index: number) { setLines((ls) => ls.filter((_, i) => i !== index)); }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost * (1 + l.tax_rate / 100), 0);
  const validLines = lines.some((l) => l.description.trim() && l.quantity > 0);

  const inputClass = "rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-2.5 py-1.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1e2229] p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#17211f] dark:text-white">Nouveau bon de commande</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} className="text-[#717182]" /></button>
        </div>

        <label className="block text-xs font-bold uppercase text-[#717182]">Fournisseur *
          <select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value) || "")} className={`${inputClass} mt-1 w-full`}>
            <option value="">Sélectionner…</option>
            {(suppliersQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-[#717182]">Lignes</p>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
              <select
                value={line.product_id ?? ""}
                onChange={(e) => {
                  const pid = Number(e.target.value) || null;
                  const product = (productsQ.data ?? []).find((p) => p.id === pid);
                  updateLine(i, { product_id: pid, description: product ? product.name : line.description });
                }}
                aria-label="Produit"
                className={`${inputClass} col-span-3`}
              >
                <option value="">(hors-stock)</option>
                {(productsQ.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                className={`${inputClass} col-span-4`}
              />
              <input
                type="number" min={1} placeholder="Qté" value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 1 })}
                className={`${inputClass} col-span-2`}
              />
              <input
                type="number" min={0} placeholder="Coût unitaire" value={line.unit_cost}
                onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) || 0 })}
                className={`${inputClass} col-span-2`}
              />
              <button onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Supprimer la ligne" className="col-span-1 text-rose-500 disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button onClick={addLine} className="text-xs font-bold text-emerald-600 hover:underline">+ Ajouter une ligne</button>
        </div>

        <p className="text-right text-sm font-black text-[#17211f] dark:text-white">Total : {money(total)}</p>

        {create.isError && <p className="text-xs font-bold text-rose-600">{(create.error as Error)?.message || "Erreur."}</p>}
        <button
          onClick={() => create.mutate()}
          disabled={!supplierId || !validLines || create.isPending}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {create.isPending ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Créer le bon de commande"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── COMMANDES REÇUES (réseau fournisseurs) ─────────────────────────── */
const SUPPLIER_DECISION_LABEL: Record<string, string> = {
  pending: "À traiter", accepted: "Acceptée", declined: "Refusée",
};
const SUPPLIER_DECISION_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  accepted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  declined: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function ReceivedOrdersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm } = useConfirm();
  const ordersQ = useQuery({ queryKey: ["receivedPurchaseOrders"], queryFn: () => api.receivedPurchaseOrders() });

  const acceptMut = useMutation({
    mutationFn: (id: number) => api.supplierAcceptPurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receivedPurchaseOrders"] }),
    onError: () => toast.error("Impossible d'accepter ce bon de commande."),
  });
  const declineMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.supplierDeclinePurchaseOrder(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receivedPurchaseOrders"] }),
    onError: () => toast.error("Impossible de refuser ce bon de commande."),
  });

  async function handleDecline(po: PurchaseOrderDto) {
    const ok = await confirm({
      title: "Refuser ce bon de commande ?", message: `${po.number} · ${po.buyer_company_name}`, confirmLabel: "Refuser", danger: true,
    });
    if (ok) declineMut.mutate({ id: po.id, reason: "" });
  }

  const orders = ordersQ.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#717182]">
        Bons de commande envoyés par des entreprises qui vous ont connecté comme fournisseur.
      </p>
      {ordersQ.isLoading && <p className="text-sm text-[#717182]">Chargement…</p>}
      {!ordersQ.isLoading && orders.length === 0 && (
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] py-14 text-center">
          <Inbox size={28} className="mx-auto text-[#d1d5db]" />
          <p className="mt-2 text-sm text-[#717182]">Aucune commande reçue pour l'instant.</p>
          <p className="mt-1 text-xs text-[#717182]">
            Un client peut vous inviter comme fournisseur connecté depuis son onglet Fournisseurs.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {orders.map((po) => (
          <div key={po.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SUPPLIER_DECISION_TONE[po.supplier_decision] ?? SUPPLIER_DECISION_TONE.pending}`}>
                    {SUPPLIER_DECISION_LABEL[po.supplier_decision] ?? po.supplier_decision}
                  </span>
                  <p className="font-bold text-[#17211f] dark:text-white">{po.number} · {po.buyer_company_name}</p>
                </div>
                <p className="mt-0.5 text-xs text-[#717182]">
                  {po.lines.length} ligne(s) · {money(po.total_amount)}
                </p>
                {po.supplier_decision === "declined" && po.supplier_decision_reason && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">Motif : {po.supplier_decision_reason}</p>
                )}
              </div>
              {po.supplier_decision === "pending" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => acceptMut.mutate(po.id)} disabled={acceptMut.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    <CheckCircle2 size={12} /> Accepter
                  </button>
                  <button onClick={() => handleDecline(po)} className="flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20">
                    <XCircle size={12} /> Refuser
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
