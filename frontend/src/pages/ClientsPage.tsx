import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  Tag,
  TrendingUp,
  Users,
  UserCheck,
  X,
  ChevronRight,
  FileText,
  AlertCircle,
  Pencil,
  Trash2,
  Gift,
  Loader2,
} from "lucide-react";

import { api, type ClientDto, type ClientDiscountDto, type ClientStatsDto } from "../services/api";
import { useConfirm } from "../components/ConfirmProvider";
import i18n from "../i18n";
import { compactMoney, money, initials } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import type { Invoice } from "../types/domain";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "inactive" | "prospect";

type ClientFormData = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  notes: string;
  status: "active" | "inactive" | "prospect";
};

const EMPTY_FORM: ClientFormData = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "Congo",
  notes: "",
  status: "active",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  inactive:
    "bg-stone-100 text-stone-600 dark:bg-stone-500/20 dark:text-stone-400",
  prospect:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
};

const INITIALS_BG = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
];

function avatarBg(id: number): string {
  return INITIALS_BG[id % INITIALS_BG.length];
}

// Priorité au lien explicite client_id (fiable) ; repli sur une correspondance
// exacte de nom (pas une sous-chaîne) pour les factures créées avant ce lien —
// évite qu'un renommage de client ou un nom proche mélange les factures de
// deux clients différents.
function matchesClient(inv: Invoice, client: ClientDto): boolean {
  if (inv.client_id != null) return inv.client_id === client.id;
  return inv.customer_name.trim().toLowerCase() === client.name.trim().toLowerCase();
}

function clientStatusLabel(status: string, tr: TFunction) {
  if (status === "active") return tr("clientsPage.status.active");
  if (status === "inactive") return tr("clientsPage.status.inactive");
  if (status === "prospect") return tr("clientsPage.status.prospect");
  return status;
}

function discountTypeLabel(type: string, tr: TFunction) {
  if (type === "percent") return tr("clientsPage.loyalty.discountTypes.percent");
  if (type === "fixed") return tr("clientsPage.loyalty.discountTypes.fixed");
  if (type === "points_threshold") return tr("clientsPage.loyalty.discountTypes.pointsThreshold");
  return type;
}

function appliesToLabel(scope: string, tr: TFunction) {
  if (scope === "all") return tr("clientsPage.loyalty.appliesTo.all");
  if (scope === "invoice") return tr("clientsPage.loyalty.appliesTo.invoice");
  if (scope === "pos") return tr("clientsPage.loyalty.appliesTo.pos");
  return scope;
}

function loyaltyTierLabel(tier: string, tr: TFunction) {
  if (tier === "standard") return tr("clientsPage.loyalty.tiers.standard");
  if (tier === "silver") return tr("clientsPage.loyalty.tiers.silver");
  if (tier === "gold") return tr("clientsPage.loyalty.tiers.gold");
  if (tier === "vip") return tr("clientsPage.loyalty.tiers.vip");
  return tier;
}

function invoiceStatusLabel(status: string, tr: TFunction) {
  if (status === "paid") return tr("clientsPage.invoices.status.paid");
  if (status === "overdue") return tr("clientsPage.invoices.status.overdue");
  if (status === "sent") return tr("clientsPage.invoices.status.sent");
  return tr("clientsPage.invoices.status.draft");
}

function clientDate(value: string | null, tr: TFunction) {
  if (!value) return tr("clientsPage.date.notDefined");
  return new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "emerald" | "blue" | "amber" | "stone";
}) {
  const colors: Record<string, string> = {
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    stone:
      "bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-[#17211f] dark:text-white">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-[#717182]">{hint}</p>}
        </div>
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}
        >
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t: tr } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.inactive}`}
    >
      {clientStatusLabel(status, tr)}
    </span>
  );
}

// ─── Client Form Modal ────────────────────────────────────────────────────────

function ClientModal({
  initial,
  onClose,
  onSave,
  loading,
}: {
  initial?: ClientFormData;
  onClose: () => void;
  onSave: (data: ClientFormData) => void;
  loading: boolean;
}) {
  const { t: tr } = useTranslation();
  const [form, setForm] = useState<ClientFormData>(initial ?? EMPTY_FORM);

  function set(key: keyof ClientFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#1e2229]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-[#17211f] dark:text-white">
            {initial ? tr("clientsPage.modal.editTitle") : tr("clientsPage.modal.newTitle")}
          </h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">
              {tr("clientsPage.modal.name")}
            </label>
            <input
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              placeholder={tr("clientsPage.modal.namePlaceholder")}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Email + Téléphone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                {tr("clientsPage.modal.email")}
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
                placeholder={tr("clientsPage.modal.emailPlaceholder")}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                {tr("clientsPage.modal.phone")}
              </label>
              <input
                className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
                placeholder="+242 06 000 0000"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>

          {/* Adresse */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">
              {tr("clientsPage.modal.address")}
            </label>
            <input
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              placeholder={tr("clientsPage.modal.addressPlaceholder")}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          {/* Ville + Pays */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                {tr("clientsPage.modal.city")}
              </label>
              <input
                className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
                placeholder="Brazzaville"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                {tr("clientsPage.modal.country")}
              </label>
              <input
                className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
                placeholder="Congo"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">
              {tr("clientsPage.modal.status")}
            </label>
            <select
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as ClientFormData["status"])
              }
            >
              <option value="active">{tr("clientsPage.status.active")}</option>
              <option value="inactive">{tr("clientsPage.status.inactive")}</option>
              <option value="prospect">{tr("clientsPage.status.prospect")}</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">
              {tr("clientsPage.modal.internalNotes")}
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white resize-none"
              placeholder={tr("clientsPage.modal.notesPlaceholder")}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <button
            onClick={onClose}
            className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm text-[#717182] hover:bg-black/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
          >
            {tr("common.cancel")}
          </button>
          <button
            disabled={!form.name.trim() || loading}
            onClick={() => onSave(form)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? tr("clientsPage.modal.saving") : tr("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIERS: Record<string, { label: string; color: string; bg: string; pts: string }> = {
  standard: { label: "Standard",  color: "text-stone-600",   bg: "bg-stone-100 dark:bg-stone-500/20",   pts: "0 pts" },
  silver:   { label: "Silver",    color: "text-sky-600",     bg: "bg-sky-100 dark:bg-sky-500/20",       pts: "500+ pts" },
  gold:     { label: "Gold",      color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-500/20",   pts: "2000+ pts" },
  vip:      { label: "VIP",       color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-500/20", pts: "5000+ pts" },
};

const DISCOUNT_TYPES = ["percent", "fixed", "points_threshold"] as const;
const APPLIES_TO = ["all", "invoice", "pos"] as const;

function LoyaltyDiscountPanel({ client }: { client: ClientDto }) {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({
    label: "", discount_type: "percent", discount_value: 10,
    min_order_amount: 0, applies_to: "all", active: true,
  });
  const [pointsDelta, setPointsDelta] = useState("");

  const discounts = useQuery<ClientDiscountDto[]>({
    queryKey: ["clientDiscounts", client.id],
    queryFn: () => api.clientDiscounts(client.id),
  });

  const tier = TIERS[client.loyalty_tier ?? "standard"] ?? TIERS.standard;

  const addDiscount = useMutation({
    mutationFn: () => api.createClientDiscount(client.id, {
      ...discountForm,
      discount_value: Number(discountForm.discount_value),
      min_order_amount: Number(discountForm.min_order_amount),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientDiscounts", client.id] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowAddDiscount(false);
      setDiscountForm({ label: "", discount_type: "percent", discount_value: 10, min_order_amount: 0, applies_to: "all", active: true });
    },
  });

  const delDiscount = useMutation({
    mutationFn: (dId: number) => api.deleteClientDiscount(client.id, dId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientDiscounts", client.id] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const updateLoyalty = useMutation({
    mutationFn: (payload: { points_delta?: number; loyalty_tier?: string; global_discount_percent?: number }) =>
      api.updateClientLoyalty(client.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const addPoints = () => {
    const n = parseInt(pointsDelta, 10);
    if (!isNaN(n) && n !== 0) {
      updateLoyalty.mutate({ points_delta: n });
      setPointsDelta("");
    }
  };

  return (
    <div className="space-y-3">
      {/* Fidélité header */}
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f7f8fa] dark:bg-[#14181f] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] flex items-center gap-1.5">
            <Star size={12} /> {tr("clientsPage.loyalty.title")}
          </p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tier.bg} ${tier.color}`}>
            {loyaltyTierLabel(client.loyalty_tier ?? "standard", tr)}
          </span>
        </div>

        {/* Points + remise globale */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white dark:bg-[#1e2229] border border-black/[0.06] dark:border-white/[0.06] p-2.5 text-center">
            <p className="text-xs text-[#717182]">{tr("clientsPage.loyalty.points")}</p>
            <p className="text-xl font-black text-amber-600">{client.loyalty_points ?? 0}</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-[#1e2229] border border-black/[0.06] dark:border-white/[0.06] p-2.5 text-center">
            <p className="text-xs text-[#717182]">{tr("clientsPage.loyalty.globalDiscount")}</p>
            <p className="text-xl font-black text-emerald-600">{client.global_discount_percent ?? 0}%</p>
          </div>
        </div>

        {/* Barème tiers */}
        <div className="flex gap-1.5">
          {Object.entries(TIERS).map(([k, t]) => (
            <button
              key={k}
              onClick={() => updateLoyalty.mutate({ loyalty_tier: k })}
              className={`flex-1 rounded-lg py-1 text-[10px] font-bold border transition ${
                client.loyalty_tier === k
                  ? `${t.bg} ${t.color} border-current`
                  : "border-black/[0.06] dark:border-white/[0.06] text-[#717182] hover:bg-black/[0.03]"
              }`}
            >
              {loyaltyTierLabel(k, tr)}
            </button>
          ))}
        </div>

        {/* Ajouter/retirer points */}
        <div className="flex gap-2">
          <input
            type="number"
            value={pointsDelta}
            onChange={(e) => setPointsDelta(e.target.value)}
            placeholder={tr("clientsPage.loyalty.pointsPlaceholder")}
            className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/5 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={addPoints}
            disabled={updateLoyalty.isPending || !pointsDelta.trim()}
            className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {updateLoyalty.isPending ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
            {tr("clientsPage.loyalty.apply")}
          </button>
        </div>

        {/* Remise globale rapide */}
        <div className="flex gap-2 flex-wrap">
          {[0, 5, 10, 15, 20, 25].map((pct) => (
            <button
              key={pct}
              onClick={() => updateLoyalty.mutate({ global_discount_percent: pct })}
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold border transition ${
                client.global_discount_percent === pct
                  ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                  : "border-black/[0.08] dark:border-white/[0.08] text-[#717182] hover:bg-black/[0.03]"
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Remises spécifiques */}
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f7f8fa] dark:bg-[#14181f] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] flex items-center gap-1.5">
            <Tag size={12} /> {tr("clientsPage.loyalty.specificDiscounts", { count: discounts.data?.length ?? 0 })}
          </p>
          <button
            onClick={() => setShowAddDiscount(!showAddDiscount)}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition"
          >
            <Plus size={11} /> {tr("common.add")}
          </button>
        </div>

        {/* Formulaire ajout */}
        {showAddDiscount && (
          <div className="space-y-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
            <input
              value={discountForm.label}
              onChange={(e) => setDiscountForm((p) => ({ ...p, label: e.target.value }))}
              placeholder={tr("clientsPage.loyalty.discountLabelPlaceholder")}
              className="w-full rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={discountForm.discount_type}
                onChange={(e) => setDiscountForm((p) => ({ ...p, discount_type: e.target.value }))}
                className="rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-2 py-1.5 text-xs"
              >
                {DISCOUNT_TYPES.map((k) => <option key={k} value={k}>{discountTypeLabel(k, tr)}</option>)}
              </select>
              <input
                type="number"
                value={discountForm.discount_value}
                onChange={(e) => setDiscountForm((p) => ({ ...p, discount_value: +e.target.value }))}
                placeholder={tr("clientsPage.loyalty.value")}
                className="rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={discountForm.applies_to}
                onChange={(e) => setDiscountForm((p) => ({ ...p, applies_to: e.target.value }))}
                className="rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-2 py-1.5 text-xs"
              >
                {APPLIES_TO.map((k) => <option key={k} value={k}>{appliesToLabel(k, tr)}</option>)}
              </select>
              <input
                type="number"
                value={discountForm.min_order_amount}
                onChange={(e) => setDiscountForm((p) => ({ ...p, min_order_amount: +e.target.value }))}
                placeholder={tr("clientsPage.loyalty.minAmountPlaceholder")}
                className="rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addDiscount.mutate()}
                disabled={addDiscount.isPending}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {addDiscount.isPending ? <Loader2 size={11} className="animate-spin" /> : <Gift size={11} />}
                {tr("clientsPage.loyalty.createDiscount")}
              </button>
              <button onClick={() => setShowAddDiscount(false)} className="px-3 py-1.5 text-xs text-[#717182]">{tr("common.cancel")}</button>
            </div>
          </div>
        )}

        {/* Liste des remises */}
        {discounts.isLoading && <p className="text-xs text-[#717182] text-center py-2">{tr("common.loading")}</p>}
        {discounts.data?.length === 0 && !showAddDiscount && (
          <p className="text-xs text-[#aaa] text-center py-3">{tr("clientsPage.loyalty.noDiscount")}</p>
        )}
        <div className="space-y-1.5">
          {discounts.data?.map((d) => (
            <div key={d.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${d.active ? "border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[#1e2229]" : "border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] opacity-60"}`}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#17211f] dark:text-white truncate">
                  {d.label || discountTypeLabel(d.discount_type, tr)}
                </p>
                <p className="text-[10px] text-[#717182]">
                  {d.discount_type === "percent" ? `−${d.discount_value}%` : `−${d.discount_value}`}
                  {d.min_order_amount > 0 ? ` · ${tr("clientsPage.loyalty.minShort", { amount: d.min_order_amount })}` : ""}
                  {" · "}{appliesToLabel(d.applies_to, tr)}
                </p>
              </div>
              <button
                onClick={() => delDiscount.mutate(d.id)}
                className="shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ClientDetailPanel({
  client,
  onClose,
  onEdit,
}: {
  client: ClientDto;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t: tr } = useTranslation();
  useCurrency();

  const [portalResult, setPortalResult] = useState<{ temporary_password: string } | null>(null);
  const activatePortal = useMutation({
    mutationFn: () => api.setClientPortalPassword(client.id),
    onSuccess: (res) => setPortalResult({ temporary_password: res.temporary_password }),
  });

  const stats = useQuery<ClientStatsDto>({
    queryKey: ["client-stats", client.id],
    queryFn: () => api.clientStats(client.id),
  });

  const invoices = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: api.invoices,
  });

  const clientInvoices = useMemo(() => {
    if (!invoices.data) return [];
    return invoices.data.filter((inv) => matchesClient(inv, client));
  }, [invoices.data, client]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Overlay */}
      <button
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-label={tr("common.close")}
      />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl dark:bg-[#1e2229]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.06]">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-bold text-white ${avatarBg(client.id)}`}
            >
              {initials(client.name)}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#17211f] dark:text-white">
                {client.name}
              </h3>
              <StatusBadge status={client.status} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06]"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contact info */}
          <div className="space-y-2">
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-[#717182]">
                <Mail size={14} className="shrink-0 text-[#aaa]" />
                <span>{client.email}</span>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm text-[#717182]">
                <Phone size={14} className="shrink-0 text-[#aaa]" />
                <span>{client.phone}</span>
              </div>
            )}
            {(client.city || client.country) && (
              <div className="flex items-center gap-2 text-sm text-[#717182]">
                <MapPin size={14} className="shrink-0 text-[#aaa]" />
                <span>
                  {[client.city, client.country].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {client.address && (
              <div className="flex items-center gap-2 text-sm text-[#717182]">
                <Building2 size={14} className="shrink-0 text-[#aaa]" />
                <span>{client.address}</span>
              </div>
            )}
          </div>

          {/* Portail client */}
          <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-3 dark:border-white/[0.06] dark:bg-[#14181f]">
            {portalResult ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-emerald-600">{tr("portal.portalAccessGenerated")}</p>
                <p className="rounded-lg bg-white px-2.5 py-1.5 font-mono text-sm font-bold text-[#17211f] dark:bg-black/20 dark:text-white">
                  {portalResult.temporary_password}
                </p>
                <p className="text-xs text-[#717182]">{tr("portal.portalAccessNote")}</p>
              </div>
            ) : (
              <button
                onClick={() => activatePortal.mutate()}
                disabled={!client.email || activatePortal.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#17211f] px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 dark:bg-white dark:text-[#17211f]"
              >
                {activatePortal.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {client.email ? tr("portal.activatePortalAccess") : tr("portal.portalNoEmail")}
              </button>
            )}
          </div>

          {/* Stats */}
          {stats.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-3 dark:border-white/[0.06] dark:bg-[#14181f]">
                <p className="text-xs text-[#717182]">{tr("clientsPage.detail.invoices")}</p>
                <p className="mt-1 text-xl font-bold text-[#17211f] dark:text-white">
                  {stats.data.invoice_count}
                </p>
              </div>
              <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-3 dark:border-white/[0.06] dark:bg-[#14181f]">
                <p className="text-xs text-[#717182]">{tr("clientsPage.detail.totalRevenue")}</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">
                  {compactMoney(stats.data.total_revenue)}
                </p>
              </div>
              {stats.data.unpaid_count > 0 && (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {tr("clientsPage.detail.unpaidInvoices", { count: stats.data.unpaid_count })}
                  </p>
                </div>
              )}
              {stats.data.last_invoice_date && (
                <div className="col-span-2 text-xs text-[#717182]">
                  {tr("clientsPage.detail.lastInvoice", { date: clientDate(stats.data.last_invoice_date, tr) })}
                </div>
              )}
            </div>
          )}

          {/* ── Fidélité & Remises ────────────────────────────── */}
          <LoyaltyDiscountPanel client={client} />

          {/* Notes */}
          {client.notes && (
            <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-4 dark:border-white/[0.06] dark:bg-[#14181f]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] mb-2">
                {tr("clientsPage.detail.notes")}
              </p>
              <p className="text-sm text-[#17211f] dark:text-white/80 whitespace-pre-line">
                {client.notes}
              </p>
            </div>
          )}

          {/* Historique des factures */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] mb-3 flex items-center gap-2">
              <FileText size={12} />
              {tr("clientsPage.detail.invoiceHistory", { count: clientInvoices.length })}
            </p>
            {clientInvoices.length === 0 ? (
              <p className="text-sm text-[#aaa] text-center py-4">
                {tr("clientsPage.detail.noLinkedInvoice")}
              </p>
            ) : (
              <div className="space-y-2">
                {clientInvoices.slice(0, 10).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2.5 dark:border-white/[0.06] dark:bg-[#14181f]"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#17211f] dark:text-white">
                        {inv.number}
                      </p>
                      <p className="text-xs text-[#aaa]">
                        {clientDate(inv.due_date ?? null, tr)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-[#17211f] dark:text-white">
                        {compactMoney(inv.total_amount)}
                      </p>
                      <span
                        className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
                          inv.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : inv.status === "overdue"
                            ? "bg-red-100 text-red-600"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {invoiceStatusLabel(inv.status, tr)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ClientsPage() {
  const { t: tr } = useTranslation();
  useCurrency();
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedClient, setSelectedClient] = useState<ClientDto | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientDto | null>(null);

  // ── Data ──────────────────────────────────────────────────────────
  const clientsQuery = useQuery<ClientDto[]>({
    queryKey: ["clients"],
    queryFn: () => api.clients(),
  });
  const clients = clientsQuery.data ?? [];
  const companyQuery = useQuery({ queryKey: ["company"], queryFn: api.company });
  const loyaltySettings = useMutation({
    mutationFn: (payload: { loyalty_enabled?: boolean; loyalty_points_per_1000?: number }) =>
      api.updateCompany(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }),
  });

  // ── Derived KPIs ──────────────────────────────────────────────────
  const invoicesQuery = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: api.invoices,
  });
  const invoices = invoicesQuery.data ?? [];

  const kpis = useMemo(() => {
    const total = clients.length;
    const active = clients.filter((c) => c.status === "active").length;
    let totalRevenue = 0;
    for (const client of clients) {
      const linked = invoices.filter((inv) => matchesClient(inv, client));
      totalRevenue += linked.reduce(
        (s, inv) =>
          inv.status === "paid" || inv.status === "sent"
            ? s + inv.total_amount
            : s,
        0
      );
    }
    const retention =
      total > 0
        ? Math.round(
            (clients.filter((c) => {
              const linked = invoices.filter((inv) => matchesClient(inv, c));
              return linked.length > 1;
            }).length /
              total) *
              100
          )
        : 0;
    return { total, active, totalRevenue, retention };
  }, [clients, invoices]);

  // ── Filtered list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesStatus =
        statusFilter === "all" || c.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [clients, statusFilter, search]);

  // ── Client CA for card display ────────────────────────────────────
  function clientRevenue(client: ClientDto): number {
    return invoices
      .filter((inv) => matchesClient(inv, client) && (inv.status === "paid" || inv.status === "sent"))
      .reduce((s, inv) => s + inv.total_amount, 0);
  }

  function clientInvoiceCount(client: ClientDto): number {
    return invoices.filter((inv) => matchesClient(inv, client)).length;
  }

  // ── Mutations ─────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: ClientFormData) =>
      api.createClient({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        notes: data.notes || null,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ClientFormData }) =>
      api.updateClient(id, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        notes: data.notes || null,
        status: data.status,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setEditTarget(null);
      setShowModal(false);
      // update selected client if open
      if (selectedClient?.id === updated.id) {
        setSelectedClient(updated);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (selectedClient) setSelectedClient(null);
    },
  });

  function openCreate() {
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(client: ClientDto) {
    setEditTarget(client);
    setShowModal(true);
    setSelectedClient(null);
  }

  function handleSave(data: ClientFormData) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  async function confirmDelete(client: ClientDto) {
    const ok = await confirm({
      title: tr("clientsPage.confirmDelete.title"),
      message: tr("clientsPage.confirmDelete.message", { name: client.name }),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deleteMutation.mutate(client.id);
  }

  const isMutating =
    createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#17211f] dark:text-white flex items-center gap-2">
            <UserCheck size={22} className="text-emerald-600" />
            {tr("clientsPage.header.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {tr("clientsPage.header.subtitle")}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
        >
          <Plus size={16} />
          {tr("clientsPage.header.newClient")}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <Star size={19} />
          </div>
          <div>
            <p className="text-sm font-black text-[#17211f] dark:text-white">Points de fidélité automatiques</p>
            <p className="text-xs text-[#717182]">Après chaque vente liée à un client, KOMPTA crédite ses points automatiquement.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-[#17211f] dark:text-white">
          <input
            key={companyQuery.data?.loyalty_points_per_1000 ?? 1}
            type="number"
            min={0}
            max={100}
            defaultValue={companyQuery.data?.loyalty_points_per_1000 ?? 1}
            disabled={!companyQuery.data?.loyalty_enabled || loyaltySettings.isPending}
            onBlur={(event) => loyaltySettings.mutate({ loyalty_points_per_1000: Math.max(0, Number(event.target.value) || 0) })}
            className="w-16 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-right dark:border-amber-500/30 dark:bg-white/5"
          />
          pt / 1 000
        </label>
        <button
          type="button"
          disabled={loyaltySettings.isPending || companyQuery.isLoading}
          onClick={() => loyaltySettings.mutate({ loyalty_enabled: !companyQuery.data?.loyalty_enabled })}
          className={`rounded-full px-4 py-2 text-xs font-black transition ${
            companyQuery.data?.loyalty_enabled
              ? "bg-emerald-600 text-white"
              : "bg-white text-[#717182] ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10"
          }`}
        >
          {companyQuery.data?.loyalty_enabled ? "Activé" : "Désactivé"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={tr("clientsPage.kpi.totalClients")}
          value={String(kpis.total)}
          icon={Users}
          tone="emerald"
        />
        <KpiCard
          label={tr("clientsPage.kpi.activeClients")}
          value={String(kpis.active)}
          hint={kpis.total > 0 ? tr("clientsPage.kpi.ofTotal", { percent: Math.round((kpis.active / kpis.total) * 100) }) : undefined}
          icon={UserCheck}
          tone="blue"
        />
        <KpiCard
          label={tr("clientsPage.kpi.totalRevenue")}
          value={compactMoney(kpis.totalRevenue)}
          icon={TrendingUp}
          tone="amber"
        />
        <KpiCard
          label={tr("clientsPage.kpi.retentionRate")}
          value={`${kpis.retention}%`}
          hint={tr("clientsPage.kpi.retentionHint")}
          icon={ChevronRight}
          tone="stone"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]"
          />
          <input
            className="w-full rounded-lg border border-black/[0.08] bg-white py-2 pl-9 pr-3 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
            placeholder={tr("clientsPage.search.placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white p-1 dark:border-white/[0.08] dark:bg-[#1e2229]">
          {(
            [
              ["all", "clientsPage.filters.all"],
              ["active", "clientsPage.filters.active"],
              ["inactive", "clientsPage.filters.inactive"],
              ["prospect", "clientsPage.filters.prospect"],
            ] as [StatusFilter, string][]
          ).map(([key, tk]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                statusFilter === key
                  ? "bg-emerald-600 text-white"
                  : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              }`}
            >
              {tr(tk)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of client cards */}
      {clientsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#1e2229]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-black/[0.06] bg-white py-16 text-center dark:border-white/[0.06] dark:bg-[#1e2229]">
          <UserCheck size={32} className="mx-auto mb-3 text-[#aaa]" />
          <p className="text-sm font-medium text-[#717182]">
            {search || statusFilter !== "all"
              ? tr("clientsPage.empty.noMatch")
              : tr("clientsPage.empty.noClient")}
          </p>
          {!search && statusFilter === "all" && (
            <button
              onClick={openCreate}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {tr("clientsPage.empty.addFirst")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => {
            const rev = clientRevenue(client);
            const invCount = clientInvoiceCount(client);
            return (
              <div
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className="group cursor-pointer rounded-xl border border-black/[0.06] bg-white p-5 transition hover:border-emerald-500/40 hover:shadow-md dark:border-white/[0.06] dark:bg-[#1e2229] dark:hover:border-emerald-500/30"
              >
                {/* Card header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white ${avatarBg(client.id)}`}
                    >
                      {initials(client.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">
                        {client.name}
                      </p>
                      <StatusBadge status={client.status} />
                    </div>
                  </div>
                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(client);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(client);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Contact */}
                <div className="mt-4 space-y-1.5">
                  {client.email && (
                    <div className="flex items-center gap-2 text-xs text-[#717182]">
                      <Mail size={12} className="shrink-0 text-[#ccc]" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-xs text-[#717182]">
                      <Phone size={12} className="shrink-0 text-[#ccc]" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {(client.city || client.country) && (
                    <div className="flex items-center gap-2 text-xs text-[#717182]">
                      <MapPin size={12} className="shrink-0 text-[#ccc]" />
                      <span>
                        {[client.city, client.country]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer stats */}
                <div className="mt-4 flex items-center justify-between border-t border-black/[0.04] pt-3 dark:border-white/[0.04]">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-[#aaa]">
                      {tr("clientsPage.card.revenue")}
                    </p>
                    <p className="text-sm font-bold text-emerald-600">
                      {rev > 0 ? compactMoney(rev) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-semibold text-[#aaa]">
                      {tr("clientsPage.card.invoices")}
                    </p>
                    <p className="text-sm font-bold text-[#17211f] dark:text-white">
                      {invCount}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {selectedClient && (
        <ClientDetailPanel
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onEdit={() => openEdit(selectedClient)}
        />
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <ClientModal
          initial={
            editTarget
              ? {
                  name: editTarget.name,
                  email: editTarget.email ?? "",
                  phone: editTarget.phone ?? "",
                  address: editTarget.address ?? "",
                  city: editTarget.city ?? "",
                  country: editTarget.country ?? "Congo",
                  notes: editTarget.notes ?? "",
                  status: (editTarget.status as ClientFormData["status"]) ?? "active",
                }
              : undefined
          }
          onClose={() => {
            setShowModal(false);
            setEditTarget(null);
          }}
          onSave={handleSave}
          loading={isMutating}
        />
      )}
    </div>
  );
}
