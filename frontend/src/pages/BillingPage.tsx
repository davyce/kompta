import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Bell, CheckCircle2, CreditCard, Download, FileSpreadsheet, FilePlus2, Plus, Search, Trash2, TrendingUp, Clock, AlertCircle, ReceiptText, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { money, shortDate, compactMoney, currencyLabel } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { exportTableToExcel } from "../utils/export";

type InvoiceLine = { description: string; quantity: number; unit_price: number };
type StatusFilter = "all" | "sent" | "paid" | "draft" | "overdue";

const STATUS_LABELS: Record<string, string> = {
  paid: "Payée", sent: "Envoyée", draft: "Brouillon", overdue: "En retard",
};
const STATUS_TONES: Record<string, "green" | "blue" | "amber" | "red"> = {
  paid: "green", sent: "blue", draft: "amber", overdue: "red",
};

function KpiCard({ label, value, hint, icon: Icon, tone = "emerald" }: {
  label: string; value: string; hint?: string; icon: React.ElementType;
  tone?: "emerald" | "amber" | "red" | "sky";
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber:   "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    red:     "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    sky:     "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-[#17211f] dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-[#717182]">{hint}</p>}
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export function BillingPage() {
  const queryClient = useQueryClient();
  useCurrency();
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  type BillSortField = "date" | "amount" | "customer" | "status";
  const [sortField, setSortField] = useState<BillSortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleBillSort(f: BillSortField) {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("asc"); }
  }
  function BillSortIcon({ field }: { field: BillSortField }) {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-0.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp size={11} className="ml-0.5 text-emerald-500" /> : <ArrowDown size={11} className="ml-0.5 text-emerald-500" />;
  }
  const [paymentChoice, setPaymentChoice] = useState<Record<number, string>>({});
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [customerName, setCustomerName] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  /* ── mutations ── */
  const create = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      setCustomerName("");
      setInvoiceNotes("");
      setDueDate("");
      setLines([{ description: "", quantity: 1, unit_price: 0 }]);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const markPaid = useMutation({
    mutationFn: ({ id, choice }: { id: number; choice: string }) => {
      const [kind, value] = choice.split(":");
      if (kind === "account") {
        const account = (paymentAccounts.data ?? []).find((item) => item.id === Number(value));
        return api.payInvoice(id, { payment_method: account?.provider ?? "zola", payment_account_id: Number(value) });
      }
      return api.payInvoice(id, { payment_method: value || "cash", payment_account_id: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const [relanceToast, setRelanceToast] = useState<string | null>(null);
  const relance = useMutation({
    mutationFn: (id: number) =>
      api.relanceInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setRelanceToast("Relance envoyée ✓");
      setTimeout(() => setRelanceToast(null), 4000);
    },
  });

  const [exportingId, setExportingId] = useState<number | null>(null);
  async function exportInvoice(id: number, number: string) {
    setExportingId(id);
    try {
      const blob = await api.exportInvoice(id, "pdf");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facture-${number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally { setExportingId(null); }
  }

  /* ── computed ── */
  const kpis = useMemo(() => {
    const all = invoices.data ?? [];
    const paid = all.filter((i) => i.status === "paid");
    const pending = all.filter((i) => i.status === "sent");
    const today = new Date().toISOString().slice(0, 10);
    const overdue = all.filter((i) => i.status === "sent" && i.due_date && i.due_date < today);
    return {
      totalPaid: paid.reduce((s, i) => s + (i.total_amount || 0), 0),
      totalPending: pending.reduce((s, i) => s + (i.total_amount || 0), 0),
      overdueCount: overdue.length,
      totalInvoices: all.length,
    };
  }, [invoices.data]);

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const q = search.trim().toLowerCase();
    const base = (invoices.data ?? []).filter((inv) => {
      const isOverdue = inv.status === "sent" && inv.due_date && inv.due_date < today;
      const matchStatus =
        statusFilter === "all" ? true :
        statusFilter === "overdue" ? isOverdue :
        inv.status === statusFilter;
      const matchSearch = !q || `${inv.number} ${inv.customer_name}`.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date")     cmp = (a.due_date ?? "").localeCompare(b.due_date ?? "");
      if (sortField === "amount")   cmp = (a.total_amount ?? 0) - (b.total_amount ?? 0);
      if (sortField === "customer") cmp = a.customer_name.localeCompare(b.customer_name, "fr");
      if (sortField === "status")   cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoices.data, statusFilter, search, sortField, sortDir]);

  const totalLines = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  function addLine() { setLines((l) => [...l, { description: "", quantity: 1, unit_price: 0 }]); }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i)); }
  function updateLine(i: number, field: keyof InvoiceLine, value: string | number) {
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line));
  }

  function exportBillingExcel() {
    const headers = ["N° Facture", "Client", "Date", "Montant", "Statut", "Relances"];
    const rows = filtered.map((inv) => [
      inv.number,
      inv.customer_name,
      inv.due_date ?? "",
      inv.total_amount ?? 0,
      inv.status,
      inv.relance_count ?? 0,
    ]);
    exportTableToExcel(headers, rows, `factures-kompta-${new Date().toISOString().slice(0, 10)}`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (lines.every((l) => !l.description.trim())) return;
    create.mutate({
      customer_name: customerName.trim() || "Client anonyme",
      status: saveAsDraft ? "draft" : "sent",
      lines,
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(invoiceNotes.trim() ? { notes: invoiceNotes } : {}),
    });
  }

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Toutes" },
    { key: "sent", label: "Envoyées" },
    { key: "paid", label: "Payées" },
    { key: "overdue", label: "En retard" },
    { key: "draft", label: "Brouillons" },
  ];

  return (
    <div className="space-y-5">
      {relanceToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-lg dark:border-amber-500/30 dark:bg-amber-900/40 dark:text-amber-200">
          <Bell size={15} /> {relanceToast}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-emerald-600">Facturation et gestion commerciale</p>
        <h1 className="text-3xl font-black text-ink dark:text-white">Clients, factures et encaissements</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Encaissé" value={compactMoney(kpis.totalPaid)} hint="factures payées" icon={CheckCircle2} tone="emerald" />
        <KpiCard label="En attente" value={compactMoney(kpis.totalPending)} hint="à encaisser" icon={Clock} tone="sky" />
        <KpiCard label="En retard" value={String(kpis.overdueCount)} hint={kpis.overdueCount > 0 ? "relance recommandée" : "aucun retard"} icon={AlertCircle} tone={kpis.overdueCount > 0 ? "red" : "emerald"} />
        <KpiCard label="Total factures" value={String(kpis.totalInvoices)} hint="émises ce cycle" icon={ReceiptText} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Liste factures */}
        <Panel title="Factures" action={
          <div className="flex items-center gap-2">
            <button
              onClick={exportBillingExcel}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <FileSpreadsheet size={13} /> Exporter Excel
            </button>
            <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
              <TrendingUp size={15} /> {filtered.length} résultats
            </span>
          </div>
        }>
          {/* Filtres */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-3 py-2 flex-1 min-w-40">
              <Search size={15} className="text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nº facture, client…"
                className="bg-transparent text-sm outline-none min-w-0 flex-1"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    statusFilter === f.key
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-50 text-[#17211f] hover:bg-black/[0.04]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Sort controls */}
            <div className="flex gap-1 ml-auto">
              {([["date","Date"],["amount","Montant"],["customer","Client"],["status","Statut"]] as [BillSortField, string][]).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => toggleBillSort(f)}
                  className={`flex items-center rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    sortField === f ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "text-[#717182] hover:bg-black/[0.04]"
                  }`}
                >
                  {label}<BillSortIcon field={f} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((invoice) => {
              const today = new Date().toISOString().slice(0, 10);
              const isOverdue = invoice.status === "sent" && invoice.due_date && invoice.due_date < today;
              const displayStatus = isOverdue ? "overdue" : invoice.status;
              const defaultChoice = paymentChoice[invoice.id] ?? "method:cash";
              return (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3 dark:border-white/[0.05]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={STATUS_LABELS[displayStatus] ?? displayStatus}
                        tone={STATUS_TONES[displayStatus] ?? "blue"}
                      />
                      <p className="font-semibold text-ink dark:text-white">{invoice.number} · {invoice.customer_name}</p>
                      {(invoice.relance_count ?? 0) > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                          Relancée {invoice.relance_count} fois
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[#717182]">
                      {invoice.status === "paid"
                        ? `Payée le ${invoice.paid_at ? shortDate(invoice.paid_at) : ""}${invoice.payment_account_label ? ` · ${invoice.payment_account_label}` : ""}`
                        : `Échéance ${invoice.due_date ? shortDate(invoice.due_date) : "—"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ink dark:text-white">{money(invoice.total_amount)}</p>
                    <button
                      onClick={() => exportInvoice(invoice.id, invoice.number)}
                      disabled={exportingId === invoice.id}
                      className="flex items-center gap-1 rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-bold text-[#17211f] hover:bg-stone-50 disabled:text-stone-400 dark:bg-white/5 dark:text-white"
                    >
                      <Download size={13} />
                      {exportingId === invoice.id ? "…" : "PDF"}
                    </button>
                    {invoice.status !== "paid" && (
                      <button
                        onClick={() => relance.mutate(invoice.id)}
                        disabled={relance.isPending}
                        className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        <Bell size={13} /> Relancer
                      </button>
                    )}
                    {invoice.status !== "paid" && invoice.status !== "draft" && (
                      <div className="flex items-center gap-1">
                        <label className="flex items-center gap-1 rounded-lg border border-black/[0.06] bg-white px-2 py-1 text-xs font-bold text-[#17211f] dark:bg-white/5 dark:text-white">
                          <CreditCard size={13} />
                          <select
                            value={defaultChoice}
                            onChange={(e) => setPaymentChoice((c) => ({ ...c, [invoice.id]: e.target.value }))}
                            className="bg-transparent outline-none"
                          >
                            <option value="method:cash">Espèces</option>
                            <option value="method:card">Carte</option>
                            {(paymentAccounts.data ?? []).filter((a) => a.enabled && a.use_for_pos).map((a) => (
                              <option key={a.id} value={`account:${a.id}`}>{a.label}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() => markPaid.mutate({ id: invoice.id, choice: defaultChoice })}
                          disabled={markPaid.isPending}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300"
                        >
                          <CheckCircle2 size={13} /> Encaisser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!filtered.length && (
              <p className="py-8 text-center text-sm text-[#717182]">
                {search || statusFilter !== "all" ? "Aucune facture correspondante." : "Aucune facture pour le moment."}
              </p>
            )}
          </div>
        </Panel>

        {/* Nouvelle facture multi-lignes */}
        <Panel title="Nouvelle facture">
          <form onSubmit={submit} className="space-y-3">
            <TextInput
              label="Client (optionnel)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom du client ou entreprise — laisser vide si inconnu"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#717182]">Date d'échéance</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="flex-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#717182]">Mode</span>
                  <div className="mt-1 flex rounded-lg border border-black/[0.06] overflow-hidden text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => setSaveAsDraft(false)}
                      className={`flex-1 py-2 text-center transition ${!saveAsDraft ? "bg-emerald-600 text-white" : "bg-white text-[#717182] hover:bg-stone-50 dark:bg-white/5 dark:text-white/60"}`}
                    >
                      Envoyer
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveAsDraft(true)}
                      className={`flex-1 py-2 text-center transition ${saveAsDraft ? "bg-amber-500 text-white" : "bg-white text-[#717182] hover:bg-stone-50 dark:bg-white/5 dark:text-white/60"}`}
                    >
                      Brouillon
                    </button>
                  </div>
                </div>
              </label>
            </div>

            {/* Lignes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#717182]">Lignes de facturation</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                >
                  <Plus size={12} /> Ajouter
                </button>
              </div>
              {lines.map((line, i) => (
                <div key={i} className="rounded-lg border border-black/[0.06] bg-stone-50 p-3">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    placeholder="Description du service / produit"
                    className="mb-2 w-full rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase text-[#717182]">Qté</p>
                      <input
                        type="number" min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", Number(e.target.value))}
                        className="w-full rounded-lg border border-black/[0.06] bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase text-[#717182]">Prix unit. ({currencyLabel()})</p>
                      <input
                        type="number" min={0}
                        value={line.unit_price}
                        onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))}
                        className="w-full rounded-lg border border-black/[0.06] bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="mt-5 grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] text-rose-500 hover:bg-rose-50 disabled:text-stone-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-right text-xs font-semibold text-emerald-600">
                    = {money(line.quantity * line.unit_price)}
                  </p>
                </div>
              ))}
            </div>

            {/* Notes */}
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#717182]">Notes (optionnel)</span>
              <textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={2}
                placeholder="Conditions de paiement, mentions légales, remerciements…"
                className="mt-1 w-full rounded-lg border border-black/[0.06] bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:bg-white/5 dark:border-white/10 dark:text-white"
              />
            </label>

            {/* Total */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
              <span className="font-bold text-ink dark:text-white">Total HT</span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">{money(totalLines)}</span>
            </div>

            <button
              type="submit"
              disabled={create.isPending || lines.every((l) => !l.description.trim())}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-white disabled:bg-stone-300 ${
                saveAsDraft ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              <FilePlus2 size={18} />
              {create.isPending ? "Création…" : saveAsDraft ? "Enregistrer brouillon" : "Créer et envoyer"}
            </button>
            {create.isSuccess && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                ✓ Facture créée avec succès
              </p>
            )}
            {create.error && (
              <p className="text-sm text-red-600">{create.error.message}</p>
            )}
          </form>
        </Panel>
      </div>
    </div>
  );
}
