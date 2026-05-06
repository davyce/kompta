import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  TrendingUp,
  Users,
  UserCheck,
  X,
  ChevronRight,
  FileText,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";

import { api, type ClientDto, type ClientStatsDto } from "../services/api";
import { compactMoney, money, initials, shortDate } from "../utils/format";
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

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  prospect: "Prospect",
};

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
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.inactive}`}
    >
      {STATUS_LABELS[status] ?? status}
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
            {initial ? "Modifier le client" : "Nouveau client"}
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
              Nom *
            </label>
            <input
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              placeholder="Nom du client ou de l'entreprise"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Email + Téléphone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
                placeholder="client@exemple.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                Téléphone
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
              Adresse
            </label>
            <input
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              placeholder="Rue, quartier…"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          {/* Ville + Pays */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">
                Ville
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
                Pays
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
              Statut
            </label>
            <select
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as ClientFormData["status"])
              }
            >
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
              <option value="prospect">Prospect</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">
              Notes internes
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white resize-none"
              placeholder="Informations complémentaires, préférences, historique…"
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
            Annuler
          </button>
          <button
            disabled={!form.name.trim() || loading}
            onClick={() => onSave(form)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
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
  useCurrency();

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
    return invoices.data.filter((inv) =>
      inv.customer_name
        .toLowerCase()
        .includes(client.name.toLowerCase())
    );
  }, [invoices.data, client.name]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Overlay */}
      <button
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-label="Fermer"
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

          {/* Stats */}
          {stats.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-3 dark:border-white/[0.06] dark:bg-[#14181f]">
                <p className="text-xs text-[#717182]">Factures</p>
                <p className="mt-1 text-xl font-bold text-[#17211f] dark:text-white">
                  {stats.data.invoice_count}
                </p>
              </div>
              <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-3 dark:border-white/[0.06] dark:bg-[#14181f]">
                <p className="text-xs text-[#717182]">CA total</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">
                  {compactMoney(stats.data.total_revenue)}
                </p>
              </div>
              {stats.data.unpaid_count > 0 && (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {stats.data.unpaid_count} facture
                    {stats.data.unpaid_count > 1 ? "s" : ""} impayée
                    {stats.data.unpaid_count > 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {stats.data.last_invoice_date && (
                <div className="col-span-2 text-xs text-[#717182]">
                  Dernière facture :{" "}
                  {shortDate(stats.data.last_invoice_date)}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {client.notes && (
            <div className="rounded-xl border border-black/[0.06] bg-[#f7f8fa] p-4 dark:border-white/[0.06] dark:bg-[#14181f]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] mb-2">
                Notes
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
              Historique des factures ({clientInvoices.length})
            </p>
            {clientInvoices.length === 0 ? (
              <p className="text-sm text-[#aaa] text-center py-4">
                Aucune facture liée
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
                        {shortDate(inv.due_date ?? null)}
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
                        {inv.status === "paid"
                          ? "Payée"
                          : inv.status === "overdue"
                          ? "En retard"
                          : inv.status === "sent"
                          ? "Envoyée"
                          : "Brouillon"}
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
  useCurrency();
  const queryClient = useQueryClient();

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
      const linked = invoices.filter((inv) =>
        inv.customer_name.toLowerCase().includes(client.name.toLowerCase())
      );
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
              const linked = invoices.filter((inv) =>
                inv.customer_name
                  .toLowerCase()
                  .includes(c.name.toLowerCase())
              );
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
      .filter(
        (inv) =>
          inv.customer_name
            .toLowerCase()
            .includes(client.name.toLowerCase()) &&
          (inv.status === "paid" || inv.status === "sent")
      )
      .reduce((s, inv) => s + inv.total_amount, 0);
  }

  function clientInvoiceCount(client: ClientDto): number {
    return invoices.filter((inv) =>
      inv.customer_name.toLowerCase().includes(client.name.toLowerCase())
    ).length;
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

  function confirmDelete(client: ClientDto) {
    if (
      window.confirm(
        `Supprimer le client "${client.name}" ? Cette action est irréversible.`
      )
    ) {
      deleteMutation.mutate(client.id);
    }
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
            Clients & CRM
          </h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            Gérez vos clients et suivez votre relation commerciale
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
        >
          <Plus size={16} />
          Nouveau client
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total clients"
          value={String(kpis.total)}
          icon={Users}
          tone="emerald"
        />
        <KpiCard
          label="Clients actifs"
          value={String(kpis.active)}
          hint={kpis.total > 0 ? `${Math.round((kpis.active / kpis.total) * 100)}% du total` : undefined}
          icon={UserCheck}
          tone="blue"
        />
        <KpiCard
          label="CA total clients"
          value={compactMoney(kpis.totalRevenue)}
          icon={TrendingUp}
          tone="amber"
        />
        <KpiCard
          label="Taux fidélisation"
          value={`${kpis.retention}%`}
          hint="Clients avec 2+ factures"
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
            placeholder="Rechercher un client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white p-1 dark:border-white/[0.08] dark:bg-[#1e2229]">
          {(
            [
              ["all", "Tous"],
              ["active", "Actifs"],
              ["inactive", "Inactifs"],
              ["prospect", "Prospects"],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                statusFilter === key
                  ? "bg-emerald-600 text-white"
                  : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              }`}
            >
              {label}
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
              ? "Aucun client ne correspond à vos filtres"
              : "Aucun client enregistré"}
          </p>
          {!search && statusFilter === "all" && (
            <button
              onClick={openCreate}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Ajouter un premier client
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
                      CA
                    </p>
                    <p className="text-sm font-bold text-emerald-600">
                      {rev > 0 ? compactMoney(rev) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-semibold text-[#aaa]">
                      Factures
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
