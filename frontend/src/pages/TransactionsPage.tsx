import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpDown, ArrowUpRight,
  CheckCircle2, Download, FileSpreadsheet, FileText, Filter, Image, Landmark,
  Loader2, Pencil, Plus, RefreshCcw, Search, Trash2, Upload, X,
} from "lucide-react";

import { api } from "../services/api";
import type { BankTransactionDto, BankTransactionCreateDto, BankTransactionUpdateDto } from "../services/api";
import { compactMoney, money, shortDate, getActiveCurrency } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { LimuleIcon } from "../components/LimuleAvatar";
import { exportTableToExcel } from "../utils/export";

// ── Catégories ────────────────────────────────────────────────────────────────
const CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "ventes",                  label: "Ventes",             color: "#059669" },
  { key: "clients_reglements",      label: "Règlements clients", color: "#10b981" },
  { key: "achats_fournisseurs",     label: "Achats fournisseurs", color: "#ef4444" },
  { key: "salaires_charges",        label: "Salaires & charges", color: "#f59e0b" },
  { key: "loyer_charges_fixes",     label: "Loyer & charges fixes", color: "#8b5cf6" },
  { key: "banque_frais",            label: "Frais bancaires",    color: "#6366f1" },
  { key: "impots_taxes",            label: "Impôts & taxes",     color: "#dc2626" },
  { key: "investissements",         label: "Investissements",    color: "#0891b2" },
  { key: "remboursements",          label: "Remboursements",     color: "#7c3aed" },
  { key: "transferts_internes",     label: "Transferts internes", color: "#64748b" },
  { key: "emprunts_remboursements", label: "Emprunts",           color: "#92400e" },
  { key: "tresorerie",              label: "Trésorerie",         color: "#0369a1" },
  { key: "divers_entrees",          label: "Divers entrées",     color: "#16a34a" },
  { key: "divers_sorties",          label: "Divers sorties",     color: "#b91c1c" },
];
const catMeta = (key: string) => CATEGORIES.find((c) => c.key === key) ?? { label: key || "—", color: "#94a3b8" };

const SOURCE_LABELS: Record<string, string> = {
  releve_bancaire: "Relevé bancaire",
  facture_externe: "Facture externe",
  facture: "Facturation",
  pos: "Caisse POS",
  csv: "CSV",
  manual: "Manuel",
  import: "Import",
};

// ── File type icon ─────────────────────────────────────────────────────────────
function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext))
    return <Image size={16} className="text-purple-500" />;
  if (["xlsx", "xls", "ods", "csv"].includes(ext))
    return <FileSpreadsheet size={16} className="text-green-600" />;
  return <FileText size={16} className="text-red-500" />;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; tone: "emerald" | "red" | "blue" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    red:     "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    blue:    "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    slate:   "bg-slate-50 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4 flex gap-3 items-start">
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-[#17211f] dark:text-white leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#717182] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Import Drop Zone ───────────────────────────────────────────────────────────
function ImportDropZone({ onImport }: { onImport: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onImport(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all ${
        dragging
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-black/[0.12] bg-white hover:border-emerald-400 hover:bg-emerald-50/50 dark:bg-[#1e2229] dark:border-white/[0.12] dark:hover:border-emerald-500/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.csv,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.docx,.ods"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
        <Upload size={26} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-[#17211f] dark:text-white">
          Glissez un fichier ou <span className="text-emerald-600">parcourez</span>
        </p>
        <p className="mt-1 text-xs text-[#717182]">
          Relevé bancaire · Facture · CSV · Excel · PDF · Image (OCR) · Word
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {["PDF", "CSV", "XLSX", "PNG/JPG", "DOCX", "TXT"].map((fmt) => (
            <span key={fmt} className="rounded-md bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-[#717182]">{fmt}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ txn, onClose, onSave, saving }: {
  txn: BankTransactionDto;
  onClose: () => void;
  onSave: (payload: BankTransactionUpdateDto) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    date:        txn.date,
    label:       txn.label,
    amount:      String(txn.amount),
    debit:       txn.debit != null ? String(txn.debit) : "",
    credit:      txn.credit != null ? String(txn.credit) : "",
    balance:     txn.balance != null ? String(txn.balance) : "",
    currency:    txn.currency,
    category:    txn.category,
    counterpart: txn.counterpart ?? "",
    reference:   txn.reference ?? "",
    status:      txn.status,
    notes:       txn.notes ?? "",
  });

  function field<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    onSave({
      date:        form.date,
      label:       form.label,
      amount:      parseFloat(form.amount) || 0,
      debit:       form.debit ? parseFloat(form.debit) : null,
      credit:      form.credit ? parseFloat(form.credit) : null,
      balance:     form.balance ? parseFloat(form.balance) : null,
      currency:    form.currency,
      category:    form.category,
      counterpart: form.counterpart || null,
      reference:   form.reference || null,
      status:      form.status,
      notes:       form.notes || null,
    });
  }

  const inputCls = "w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <h3 className="font-bold text-[#17211f] dark:text-white">Modifier la transaction</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Date</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => field("date", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Devise</label>
              <select className={inputCls} value={form.currency} onChange={(e) => field("currency", e.target.value)}>
                <option>XAF</option><option>EUR</option><option>USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">Libellé</label>
            <input className={inputCls} value={form.label} onChange={(e) => field("label", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Débit</label>
              <input type="number" step="0.01" className={inputCls} value={form.debit} onChange={(e) => field("debit", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Crédit</label>
              <input type="number" step="0.01" className={inputCls} value={form.credit} onChange={(e) => field("credit", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Solde</label>
              <input type="number" step="0.01" className={inputCls} value={form.balance} onChange={(e) => field("balance", e.target.value)} placeholder="—" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">Catégorie</label>
            <select className={inputCls} value={form.category} onChange={(e) => field("category", e.target.value)}>
              <option value="">— choisir —</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Tiers / Contrepartie</label>
              <input className={inputCls} value={form.counterpart} onChange={(e) => field("counterpart", e.target.value)} placeholder="Nom du tiers" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#717182] mb-1">Référence</label>
              <input className={inputCls} value={form.reference} onChange={(e) => field("reference", e.target.value)} placeholder="Nº doc" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">Statut</label>
            <select className={inputCls} value={form.status} onChange={(e) => field("status", e.target.value)}>
              <option value="confirmed">Confirmé</option>
              <option value="pending">En attente</option>
              <option value="reconciled">Rapproché</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#717182] mb-1">Notes</label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={form.notes} onChange={(e) => field("notes", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-black/[0.06] dark:border-white/[0.06] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm text-[#717182] hover:bg-black/[0.04]">Annuler</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Create Modal ────────────────────────────────────────────────────────
function NewTransactionModal({ onClose, onSave, saving }: {
  onClose: () => void;
  onSave: (payload: BankTransactionCreateDto) => void;
  saving: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, label: "", debit: "", credit: "", balance: "", currency: getActiveCurrency(), category: "", counterpart: "", reference: "", notes: "" });
  function field<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.label || !form.date) return;
    const d = form.debit ? parseFloat(form.debit) : null;
    const c = form.credit ? parseFloat(form.credit) : null;
    onSave({
      date: form.date, label: form.label,
      amount: (c ?? 0) - (d ?? 0),
      debit: d, credit: c,
      balance: form.balance ? parseFloat(form.balance) : null,
      currency: form.currency, category: form.category,
      counterpart: form.counterpart || null,
      reference: form.reference || null,
      notes: form.notes || null,
      source_type: "manual",
    });
  }
  const inputCls = "w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <h3 className="font-bold text-[#17211f] dark:text-white">Nouvelle transaction</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182]"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Date *</label><input type="date" className={inputCls} value={form.date} onChange={(e) => field("date", e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Devise</label>
              <select className={inputCls} value={form.currency} onChange={(e) => field("currency", e.target.value)}>
                <option>XAF</option><option>EUR</option><option>USD</option>
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-semibold text-[#717182] mb-1">Libellé *</label><input className={inputCls} value={form.label} onChange={(e) => field("label", e.target.value)} placeholder="Description de la transaction" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Débit (sortie)</label><input type="number" step="0.01" className={inputCls} value={form.debit} onChange={(e) => field("debit", e.target.value)} placeholder="0" /></div>
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Crédit (entrée)</label><input type="number" step="0.01" className={inputCls} value={form.credit} onChange={(e) => field("credit", e.target.value)} placeholder="0" /></div>
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Solde</label><input type="number" step="0.01" className={inputCls} value={form.balance} onChange={(e) => field("balance", e.target.value)} placeholder="—" /></div>
          </div>
          <div><label className="block text-xs font-semibold text-[#717182] mb-1">Catégorie</label>
            <select className={inputCls} value={form.category} onChange={(e) => field("category", e.target.value)}>
              <option value="">— choisir —</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Tiers</label><input className={inputCls} value={form.counterpart} onChange={(e) => field("counterpart", e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-[#717182] mb-1">Référence</label><input className={inputCls} value={form.reference} onChange={(e) => field("reference", e.target.value)} /></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-black/[0.06] dark:border-white/[0.06] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm text-[#717182] hover:bg-black/[0.04]">Annuler</button>
          <button onClick={submit} disabled={saving || !form.label || !form.date} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Multi-currency amount formatter ───────────────────────────────────────────
function formatTxAmount(amount: number, txCurrency: string): string {
  const activeCurr = getActiveCurrency();
  if (txCurrency === activeCurr || !txCurrency || txCurrency === "XAF") {
    return compactMoney(amount);
  }
  // Transaction is in a different currency — show native value
  const fmt = txCurrency === "EUR"
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
    : txCurrency === "USD"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : null;
  const native = fmt ? fmt.format(amount) : `${amount} ${txCurrency}`;
  return `${native}`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function TransactionsPage() {
  useCurrency();
  const queryClient = useQueryClient();

  // ── State
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editTxn, setEditTxn] = useState<BankTransactionDto | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [importState, setImportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importMsg, setImportMsg] = useState("");
  const [importCount, setImportCount] = useState(0);
  const [sortField, setSortField] = useState<"date" | "amount" | "label" | "category">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Queries
  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api.transactions(),
  });
  const statsQuery = useQuery({
    queryKey: ["transactionStats"],
    queryFn: api.transactionStats,
  });

  // ── Mutations
  const createMut = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["transactionStats"] }); setShowNew(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: BankTransactionUpdateDto }) => api.updateTransaction(id, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["transactionStats"] }); setEditTxn(null); },
  });
  const deleteMut = useMutation({
    mutationFn: api.deleteTransaction,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["transactionStats"] }); },
  });

  // ── Import handler
  async function handleImport(file: File) {
    setImportState("loading");
    setImportMsg(`Analyse de "${file.name}" en cours via Limule…`);
    setImportCount(0);
    try {
      const res = await api.importTransactions(file);
      setImportCount(res.imported);
      setImportMsg(`✓ ${res.imported} transaction${res.imported !== 1 ? "s" : ""} importée${res.imported !== 1 ? "s" : ""} depuis "${file.name}" (méthode : ${res.parse_method}, ${res.text_length} caractères extraits)`);
      setImportState("success");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactionStats"] });
    } catch (err) {
      setImportState("error");
      setImportMsg((err as Error).message ?? "Erreur lors de l'import");
    }
  }

  // ── Sort helpers
  function toggleSort(f: typeof sortField) {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("asc"); }
  }
  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-0.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp size={11} className="ml-0.5 text-emerald-500" /> : <ArrowDown size={11} className="ml-0.5 text-emerald-500" />;
  }

  // ── Filtered + sorted data
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = (txQuery.data ?? []).filter((t) => {
      const matchSearch = !q || `${t.label} ${t.counterpart ?? ""} ${t.reference ?? ""}`.toLowerCase().includes(q);
      const matchCat = !categoryFilter || t.category === categoryFilter;
      const matchSrc = !sourceFilter || t.source_type === sourceFilter;
      const matchFrom = !dateFrom || t.date >= dateFrom;
      const matchTo   = !dateTo   || t.date <= dateTo;
      return matchSearch && matchCat && matchSrc && matchFrom && matchTo;
    });
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date")     cmp = a.date.localeCompare(b.date);
      if (sortField === "amount")   cmp = a.amount - b.amount;
      if (sortField === "label")    cmp = a.label.localeCompare(b.label, "fr");
      if (sortField === "category") cmp = a.category.localeCompare(b.category, "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [txQuery.data, search, categoryFilter, sourceFilter, dateFrom, dateTo, sortField, sortDir]);

  // ── KPIs
  const stats = statsQuery.data;
  const filteredCredits = filtered.reduce((s, t) => s + (t.credit ?? Math.max(t.amount, 0)), 0);
  const filteredDebits  = filtered.reduce((s, t) => s + (t.debit  ?? Math.max(-t.amount, 0)), 0);

  // ── Export Excel
  function handleExportExcel() {
    const headers = ["Date", "Libellé", "Montant", "Débit", "Crédit", "Devise", "Catégorie", "Source", "Statut", "Notes"];
    const rows = filtered.map((t): (string | number)[] => [
      t.date,
      t.label,
      t.amount,
      t.debit ?? "",
      t.credit ?? "",
      t.currency,
      t.category,
      SOURCE_LABELS[t.source_type] ?? t.source_type,
      t.status,
      t.notes ?? "",
    ]);
    exportTableToExcel(headers, rows, `transactions-${new Date().toISOString().slice(0, 10)}`);
  }

  // ── Export CSV
  async function handleExport() {
    try {
      const res = await api.exportTransactionsCsv();
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (err) {
      setImportState("error");
      setImportMsg(`Erreur export CSV : ${(err as Error).message}`);
    }
  }

  const uniqueSources = [...new Set((txQuery.data ?? []).map((t) => t.source_type))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#17211f] dark:text-white flex items-center gap-2">
            <Landmark size={22} className="text-emerald-600" />
            Transactions financières
          </h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            Importez relevés bancaires, factures et CSV — Limule extrait et catégorise tout automatiquement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 rounded-lg border border-black/[0.08] px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.04] transition">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={handleExportExcel} disabled={(txQuery.data?.length ?? 0) === 0} className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition">
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
            <Plus size={15} /> Nouvelle
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Entrées (filtre)" value={compactMoney(filteredCredits)} sub={`${filtered.filter(t => (t.credit ?? t.amount) > 0).length} opérations`} icon={ArrowUpRight} tone="emerald" />
        <KpiCard label="Sorties (filtre)" value={compactMoney(filteredDebits)} sub={`${filtered.filter(t => (t.debit ?? -t.amount) > 0).length} opérations`} icon={ArrowDownRight} tone="red" />
        <KpiCard label="Solde net (filtre)" value={compactMoney(filteredCredits - filteredDebits)} sub="entrées − sorties" icon={Landmark} tone={filteredCredits >= filteredDebits ? "emerald" : "red"} />
        <KpiCard label="Total transactions" value={String(stats?.count ?? 0)} sub={`${filtered.length} affichée${filtered.length !== 1 ? "s" : ""}`} icon={Filter} tone="blue" />
      </div>

      {/* Import zone */}
      <div className="space-y-3">
        <ImportDropZone onImport={handleImport} />
        {importState === "loading" && (
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 px-4 py-3">
            <LimuleIcon size={18} className="animate-pulse text-violet-600 dark:text-violet-400" />
            <p className="text-sm font-medium text-violet-700 dark:text-violet-300">{importMsg}</p>
            <Loader2 size={16} className="ml-auto animate-spin text-violet-500" />
          </div>
        )}
        {importState === "success" && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 px-4 py-3">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1">{importMsg}</p>
            <button onClick={() => setImportState("idle")} className="text-emerald-600 hover:text-emerald-800 ml-2"><X size={14} /></button>
          </div>
        )}
        {importState === "error" && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 px-4 py-3">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300 flex-1">{importMsg}</p>
            <button onClick={() => setImportState("idle")} className="text-red-600 hover:text-red-800 ml-2"><X size={14} /></button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]" />
          <input
            className="w-full rounded-lg border border-black/[0.08] bg-white py-2 pl-9 pr-3 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
            placeholder="Rechercher libellé, tiers, référence…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm text-[#717182] focus:border-emerald-500 focus:outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white/70"
          value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select
          className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm text-[#717182] focus:border-emerald-500 focus:outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white/70"
          value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">Toutes sources</option>
          {uniqueSources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-[#717182]">
          <span>Du</span>
          <input type="date" className="rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>au</span>
          <input type="date" className="rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(search || categoryFilter || sourceFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setCategoryFilter(""); setSourceFilter(""); setDateFrom(""); setDateTo(""); }}
            className="flex items-center gap-1 rounded-lg border border-black/[0.08] px-3 py-2 text-xs font-semibold text-[#717182] hover:bg-black/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
          >
            <X size={12} /> Effacer filtres
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <span className="text-sm font-semibold text-[#17211f] dark:text-white">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
          {txQuery.isFetching && <RefreshCcw size={14} className="animate-spin text-[#aaa]" />}
        </div>
        {txQuery.isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-[#717182]">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[#717182]">
            <Landmark size={36} className="mb-3 text-[#ccc]" />
            <p className="text-sm font-semibold text-[#17211f] dark:text-white">Aucune transaction</p>
            <p className="text-xs mt-1">Importez un relevé bancaire ou une facture pour commencer</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-black/[0.04] dark:border-white/[0.04] text-left text-[11px] font-semibold uppercase tracking-wider text-[#717182]">
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("date")}>
                    <span className="flex items-center">Date<SortIcon field="date" /></span>
                  </th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("label")}>
                    <span className="flex items-center">Libellé<SortIcon field="label" /></span>
                  </th>
                  <th className="cursor-pointer px-4 py-3 text-right" onClick={() => toggleSort("amount")}>
                    <span className="flex items-center justify-end">Débit<SortIcon field="amount" /></span>
                  </th>
                  <th className="px-4 py-3 text-right">Crédit</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Solde</th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("category")}>
                    <span className="flex items-center">Catégorie<SortIcon field="category" /></span>
                  </th>
                  <th className="px-4 py-3 hidden md:table-cell">Tiers</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Source</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
                {filtered.map((t) => {
                  const d = t.debit  ?? (t.amount < 0 ? -t.amount : 0);
                  const c = t.credit ?? (t.amount > 0 ? t.amount  : 0);
                  const cat = catMeta(t.category);
                  return (
                    <tr key={t.id} className="group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 text-xs text-[#717182] whitespace-nowrap">{shortDate(t.date)}</td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{t.label}</p>
                          {t.currency && t.currency !== getActiveCurrency() && (
                            <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-white/50">{t.currency}</span>
                          )}
                        </div>
                        {t.reference && <p className="text-[10px] text-[#aaa]">{t.reference}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d > 0 ? <span className="font-semibold text-red-500">−{formatTxAmount(d, t.currency)}</span> : <span className="text-[#aaa]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c > 0 ? <span className="font-semibold text-emerald-600">+{formatTxAmount(c, t.currency)}</span> : <span className="text-[#aaa]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-[#717182]">
                        {t.balance != null ? money(t.balance) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {t.category ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: cat.color + "20", color: cat.color }}
                          >
                            {cat.label}
                          </span>
                        ) : <span className="text-[#aaa] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="truncate text-xs text-[#717182] max-w-[120px] block">{t.counterpart || "—"}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {t.source_file ? (
                          <span className="flex items-center gap-1 text-xs text-[#717182]">
                            <FileTypeIcon filename={t.source_file} />
                            <span className="truncate max-w-[80px]">{SOURCE_LABELS[t.source_type] ?? t.source_type}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-[#aaa]">{SOURCE_LABELS[t.source_type] ?? t.source_type}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => setEditTxn(t)} className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => { if (window.confirm("Supprimer cette transaction ?")) deleteMut.mutate(t.id); }}
                            className="grid h-7 w-7 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {stats && Object.keys(stats.by_category).length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-5">
          <h3 className="text-sm font-bold text-[#17211f] dark:text-white mb-4">Répartition par catégorie</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(stats.by_category)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 12)
              .map(([key, val]) => {
                const cm = catMeta(key);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cm.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-[#717182]">{cm.label}</p>
                      <p className="text-sm font-semibold text-[#17211f] dark:text-white">{compactMoney(val)}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Modals */}
      {editTxn && (
        <EditModal
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSave={(p) => updateMut.mutate({ id: editTxn.id, payload: p })}
          saving={updateMut.isPending}
        />
      )}
      {showNew && (
        <NewTransactionModal
          onClose={() => setShowNew(false)}
          onSave={createMut.mutate}
          saving={createMut.isPending}
        />
      )}
    </div>
  );
}
