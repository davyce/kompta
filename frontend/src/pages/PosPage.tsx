import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, CreditCard, Download, Minus, Percent, Plus, Printer,
  QrCode, RefreshCcw, Scan, Search, ShoppingCart,
  Smartphone, Trash2, Wallet, WifiOff, X, Zap,
} from "lucide-react";
import { productIconSuggestions } from "../utils/productIcons";

import { api } from "../services/api";
import { enqueue, listPending, dequeue } from "../lib/offlineQueue";
import type { PaymentAccount, Product } from "../types/domain";
import { inferProductIcon } from "../utils/productIcons";
import { money } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";

/* ── Product icon component ─────────────────────────────────────────── */
function ProductIcon({ name, category, size = 28 }: { name: string; category: string; size?: number }) {
  const entry = inferProductIcon({ name, category });
  return <span className={entry.color}><entry.Icon size={size} /></span>;
}

/* ── Types & constants ───────────────────────────────────────────────── */
type CartItem = { product_id: number; name: string; price: number; quantity: number; category: string };

const ALL_PAYMENT_METHODS = [
  { key: "qr",           label: "QR Zola",      icon: QrCode },
  { key: "mobile_money", label: "Mobile Money",  icon: Smartphone },
  { key: "wave",         label: "Wave",          icon: Zap },
  { key: "orange_money", label: "Orange Money",  icon: Smartphone },
  { key: "mtn",          label: "MTN MoMo",      icon: Smartphone },
  { key: "airtel",       label: "Airtel Money",  icon: Smartphone },
  { key: "bank",         label: "Banque",        icon: CreditCard },
  { key: "card",         label: "Carte",         icon: CreditCard },
  { key: "cash",         label: "Espèces",       icon: Wallet },
];

function accountMethodKey(a: PaymentAccount) {
  return a.provider === "zola" ? "qr" : a.provider;
}

/* ── Ticket de caisse ────────────────────────────────────────────────────── */
type TicketData = {
  receipt_number: string;
  total_amount: number;
  payment_method: string;
  payment_account_label?: string;
  items: Array<{ product_id: number; name: string; quantity: number; total: number }>;
  cart: CartItem[];
  discount_percent: number;
  subtotal_before_discount: number;
  tax: number;
  date: string;
};

function TicketModal({ ticket, onClose, onNewSale }: { ticket: TicketData; onClose: () => void; onNewSale: () => void }) {
  return (
    <>
      <style>{`@media print { body > *:not(#ticket-print-root) { display: none !important; } #ticket-print-root { display: block !important; } }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div id="ticket-print-root" className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <h3 className="font-bold text-[#17211f] dark:text-white">Ticket de caisse</h3>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.08]">
              <X size={16} />
            </button>
          </div>

          {/* Ticket body */}
          <div className="p-6 font-mono text-sm">
            {/* Logo + titre */}
            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white">K</div>
              <p className="font-bold text-[#17211f] dark:text-white">KOMPTA</p>
              <p className="text-xs text-[#717182]">{ticket.date}</p>
              <p className="text-xs text-[#717182]">Reçu : {ticket.receipt_number}</p>
            </div>

            <div className="border-t border-dashed border-black/[0.15] dark:border-white/[0.15] pt-3">
              {/* Articles */}
              <div className="space-y-1">
                {ticket.items.map((item) => {
                  const unitPrice = item.total / item.quantity;
                  return (
                    <div key={item.product_id} className="flex justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[#17211f] dark:text-white">{item.quantity}× {item.name}</span>
                      <span className="shrink-0 text-right text-[#717182]">{item.quantity > 1 ? `${Math.round(unitPrice).toLocaleString("fr-FR")} ×${item.quantity}` : ""}</span>
                      <span className="shrink-0 font-semibold text-[#17211f] dark:text-white">{item.total.toLocaleString("fr-FR")} F</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-dashed border-black/[0.15] dark:border-white/[0.15] pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#717182]">
                  <span>Sous-total</span>
                  <span>{ticket.subtotal_before_discount.toLocaleString("fr-FR")} F</span>
                </div>
                {ticket.discount_percent > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Remise ({ticket.discount_percent}%)</span>
                    <span>-{Math.round(ticket.subtotal_before_discount * ticket.discount_percent / 100).toLocaleString("fr-FR")} F</span>
                  </div>
                )}
                {ticket.tax > 0 && (
                  <div className="flex justify-between text-[#717182]">
                    <span>TVA</span>
                    <span>{ticket.tax.toLocaleString("fr-FR")} F</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-black/[0.10] dark:border-white/[0.10] pt-2 text-base font-bold text-[#17211f] dark:text-white">
                  <span>TOTAL TTC</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{ticket.total_amount.toLocaleString("fr-FR")} F</span>
                </div>
                <div className="flex justify-between text-[#717182]">
                  <span>Paiement</span>
                  <span className="font-semibold capitalize">{ticket.payment_account_label || ticket.payment_method}</span>
                </div>
              </div>

              <p className="mt-4 text-center text-[10px] text-[#717182]">Merci pour votre achat · KOMPTA</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <button
              onClick={() => window.print()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50 dark:border-white/[0.08] dark:bg-white/5 dark:text-white"
            >
              <Printer size={15} /> Imprimer
            </button>
            <button
              onClick={onNewSale}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ShoppingCart size={15} /> Nouvelle vente
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export function PosPage() {
  const queryClient = useQueryClient();
  // Subscribe to currency changes so the component re-renders when currency switches
  useCurrency();

  const products       = useQuery({ queryKey: ["products"],        queryFn: api.products });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });

  /* ── Recherche + catégorie ── */
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState("Tous");
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Panier ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartId]        = useState(() => Math.floor(Math.random() * 9000) + 1000);

  /* ── Paiement ── */
  const [paymentMethod,    setPaymentMethod]    = useState("cash");
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);

  /* ── TVA ── */
  const [tvaEnabled, setTvaEnabled] = useState(true);
  const [tvaRate,    setTvaRate]     = useState(18);

  /* ── Remise ── */
  const [discountPercent, setDiscountPercent] = useState(0);

  /* ── Ticket modal ── */
  const [ticketData, setTicketData] = useState<TicketData | null>(null);

  /* ── Hors-ligne ── */
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [syncing,        setSyncing]        = useState(false);
  const [offlineToast,   setOfflineToast]   = useState<string | null>(null);

  /* ── Export CSV ── */
  const [exportFrom,    setExportFrom]    = useState("");
  const [exportTo,      setExportTo]      = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  /* ── Réseau ── */
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { listPending().then((r) => setPendingCount(r.length)); }, []);

  /* ── Comptes POS configurés ── */
  const posAccounts = useMemo(
    () => (paymentAccounts.data ?? []).filter((a) => a.enabled && a.use_for_pos),
    [paymentAccounts.data],
  );

  /* Sélection du compte par défaut au chargement */
  useEffect(() => {
    if (paymentAccountId !== null) return;
    const def = posAccounts.find((a) => a.is_default_pos) ?? posAccounts[0];
    if (def) { setPaymentAccountId(def.id); setPaymentMethod(accountMethodKey(def)); }
  }, [posAccounts, paymentAccountId]);

  /* ── Options de paiement affichées ──
     - Si des comptes POS sont configurés : afficher ces comptes + Espèces
     - Sinon : afficher tous les modes génériques */
  const paymentOptions = useMemo(() => {
    if (posAccounts.length > 0) {
      const options: { key: string; method: string; accountId: number | null; label: string; icon: React.ElementType }[] = posAccounts.map((a) => ({
        key:       `account-${a.id}`,
        method:    accountMethodKey(a),
        accountId: a.id as number | null,
        label:     a.label,
        icon:      ALL_PAYMENT_METHODS.find((m) => m.key === accountMethodKey(a))?.icon ?? Wallet,
      }));
      // Ajouter Espèces si pas déjà inclus via un compte
      const hasCash = posAccounts.some((a) => a.provider === "cash");
      if (!hasCash) options.push({ key: "cash", method: "cash", accountId: null, label: "Espèces", icon: Wallet });
      return options;
    }
    return ALL_PAYMENT_METHODS.map((m) => ({ key: m.key, method: m.key, accountId: null, label: m.label, icon: m.icon }));
  }, [posAccounts]);

  /* ── Sync hors-ligne ── */
  const syncPending = useCallback(async () => {
    setSyncing(true);
    try {
      const rows = await listPending();
      let synced = 0;
      for (const row of rows) {
        try { await api.createSale(row.payload); await dequeue(row.id!); synced++; }
        catch { /* garder en file */ }
      }
      setPendingCount(await listPending().then((r) => r.length));
      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["posSales"] });
      }
    } finally { setSyncing(false); }
  }, [queryClient]);

  useEffect(() => { if (isOnline && pendingCount > 0) syncPending(); }, [isOnline, pendingCount, syncPending]);

  /* ── Vente ── */
  const sale = useMutation({
    mutationFn: api.createSale,
    onSuccess: (data) => {
      // Build ticket before clearing cart
      setTicketData({
        receipt_number: data.receipt_number,
        total_amount: data.total_amount,
        payment_method: data.payment_method,
        payment_account_label: data.payment_account_label,
        items: data.items,
        cart: [...cart],
        discount_percent: discountPercent,
        subtotal_before_discount: cart.reduce((s, i) => s + i.price * i.quantity, 0),
        tax: tvaEnabled ? Math.round(cart.reduce((s, i) => s + i.price * i.quantity, 0) * (1 - discountPercent / 100) * (tvaRate / 100)) : 0,
        date: new Date().toLocaleString("fr-FR"),
      });
      setCart([]);
      setDiscountPercent(0);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["posSales"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  /* Auto-effacement du toast succès après 12 s */
  useEffect(() => {
    if (!sale.isSuccess) return;
    const t = setTimeout(() => sale.reset(), 12000);
    return () => clearTimeout(t);
  }, [sale.isSuccess, sale]);

  /* ── Catalogue filtré ── */
  const categories = useMemo(
    () => ["Tous", ...Array.from(new Set((products.data ?? []).map((p) => p.category)))],
    [products.data],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      const matchSearch = !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q);
      const matchCat    = category === "Tous" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products.data, search, category]);

  /* ── Calculs ── */
  const subtotal        = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmount  = Math.round(subtotal * (discountPercent / 100));
  const subtotalAfterDiscount = subtotal - discountAmount;
  const tax             = tvaEnabled ? Math.round(subtotalAfterDiscount * (tvaRate / 100)) : 0;
  const total           = subtotalAfterDiscount + tax;

  /* ── Actions ── */
  function addToCart(p: Product) {
    if (p.stock_quantity <= 0) return;
    setCart((c) => {
      const ex = c.find((i) => i.product_id === p.id);
      if (ex) return c.map((i) => i.product_id === p.id ? { ...i, quantity: Math.min(i.quantity + 1, p.stock_quantity) } : i);
      return [...c, { product_id: p.id, name: p.name, price: p.price, quantity: 1, category: p.category }];
    });
  }

  function updateQty(productId: number, qty: number) {
    setCart((c) => c.map((i) => i.product_id === productId ? { ...i, quantity: qty } : i).filter((i) => i.quantity > 0));
  }

  async function handleCheckout() {
    if (!cart.length) return;
    const payload = {
      payment_method: paymentMethod,
      payment_account_id: paymentAccountId,
      items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      ...(discountPercent > 0 ? { discount_percent: discountPercent } : {}),
    };
    if (!isOnline) {
      await enqueue(payload);
      const rows = await listPending();
      setPendingCount(rows.length);
      setOfflineToast(`Vente de ${money(Math.round(total))} mise en file hors-ligne.`);
      setCart([]);
      setTimeout(() => setOfflineToast(null), 6000);
    } else {
      sale.mutate(payload);
    }
  }

  async function handleExportCsv() {
    setExportLoading(true);
    try {
      const resp = await api.posExportCsv({ date_from: exportFrom || undefined, date_to: exportTo || undefined });
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `ventes_pos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

    } catch { alert("Erreur lors de l'export CSV"); }
    finally { setExportLoading(false); }
  }

  const cartTotal = total;

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <>
    <div className="flex flex-col gap-4 xl:flex-row xl:h-[calc(100vh-56px)]">

      {/* Mobile floating cart button */}
      {cart.length > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40 xl:hidden bottom-[calc(5rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl hover:bg-emerald-700"
          >
            <ShoppingCart size={16} />
            Panier · {cart.length} article{cart.length > 1 ? "s" : ""} · {money(cartTotal)}
          </button>
        </div>
      )}

      {/* ── GAUCHE — Catalogue ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

        {/* Barre export CSV */}
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-[#f8f8fc] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Download size={13} className="shrink-0 text-[#717182]" />
          <span className="text-xs font-semibold text-[#717182]">Export ventes</span>
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <span className="text-xs text-[#717182]">→</span>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <button
            onClick={handleExportCsv}
            disabled={exportLoading}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            <Download size={12} />
            {exportLoading ? "Export…" : "Télécharger CSV"}
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Search size={15} className="shrink-0 text-[#717182]" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit, un code-barres…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[#717182] hover:text-[#17211f]">
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={() => { searchRef.current?.focus(); searchRef.current?.select(); }}
              title="Scanner un code-barres"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <Scan size={17} />
            </button>
          </div>

          {/* Filtres rapides par icône */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#717182]">Filtres rapides</span>
            {productIconSuggestions(search, 14).map((entry) => (
              <button
                key={entry.key}
                onClick={() => setSearch(search === entry.label ? "" : entry.label)}
                title={entry.label}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition ${
                  search === entry.label
                    ? `${entry.bg} ${entry.color} border-transparent`
                    : "border-black/[0.06] bg-white text-[#717182] hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <span className={search === entry.label ? entry.color : "text-[#717182]"}>
                  <entry.Icon size={13} />
                </span>
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bannières hors-ligne */}
        {!isOnline && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <WifiOff size={13} className="shrink-0" />
            <span className="font-semibold">Mode hors-ligne</span> — les ventes sont sauvegardées localement.
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <RefreshCcw size={13} className={syncing ? "animate-spin" : ""} />
            <span className="flex-1">{syncing ? "Synchronisation des ventes hors-ligne…" : `${pendingCount} vente(s) en attente de sync`}</span>
            {!syncing && (
              <button onClick={syncPending} className="rounded-md bg-blue-600 px-2.5 py-0.5 text-white font-semibold hover:bg-blue-700 transition">
                Sync
              </button>
            )}
          </div>
        )}
        {offlineToast && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={13} /> {offlineToast}
          </div>
        )}

        {/* Filtres par catégorie */}
        <div className="flex gap-2 overflow-x-auto border-b border-black/[0.06] px-3 py-2.5 dark:border-white/[0.06]">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                category === cat
                  ? "bg-emerald-600 text-white"
                  : "bg-[#ececf0] text-[#717182] hover:bg-[#e0e0ea] dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grille produits */}
        <div className="flex-1 overflow-y-auto p-3">
          {products.isLoading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-[#717182]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
              <p className="text-sm">Chargement du catalogue…</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((p) => {
                const icon = inferProductIcon(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={p.stock_quantity <= 0}
                    className="rounded-xl border border-black/[0.06] bg-white p-3 text-left transition hover:border-emerald-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.06] dark:bg-[#1e2229] dark:hover:border-emerald-500"
                  >
                    <div className={`mb-2 flex aspect-square items-center justify-center rounded-lg ${icon.bg} dark:bg-white/[0.06]`}>
                      <ProductIcon name={p.name} category={p.category} size={32} />
                    </div>
                    <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{p.name}</p>
                    <p className="text-[11px] text-[#717182]">{p.category}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {money(p.price)}
                      </p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        p.stock_quantity <= 0
                          ? "bg-red-100 text-red-600"
                          : p.stock_quantity <= (p.reorder_level ?? 5)
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-50 text-emerald-600"
                      }`}>
                        {p.stock_quantity <= 0 ? "Épuisé" : `×${p.stock_quantity}`}
                      </span>
                    </div>
                  </button>
                );
              })}
              {!filteredProducts.length && !products.isLoading && (
                <div className="col-span-full flex flex-col items-center gap-2 py-14 text-[#717182]">
                  <Search size={28} className="opacity-30" />
                  <p className="text-sm">Aucun produit trouvé.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DROITE — Caisse ────────────────────────────────────────────── */}
      <div id="pos-cart" className="flex xl:w-[400px] xl:shrink-0 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

        {/* En-tête panier */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-[#17211f] dark:text-white">Panier #{cartId}</p>
              <p className="text-[11px] text-[#717182]">{cart.length} article{cart.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
            >
              <X size={12} /> Vider
            </button>
          )}
        </div>

        {/* Articles du panier */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ShoppingCart size={36} className="text-emerald-200" />
              <p className="text-sm text-[#717182]">Cliquez sur un produit pour l'ajouter</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${inferProductIcon({ name: item.name, category: item.category }).bg} dark:bg-white/10`}>
                  <ProductIcon name={item.name} category={item.category} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{item.name}</p>
                  <p className="text-[11px] text-[#717182]">{money(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] hover:bg-stone-100 dark:border-white/10 transition"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold text-[#17211f] dark:text-white">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] hover:bg-stone-100 dark:border-white/10 transition"
                  >
                    <Plus size={11} />
                  </button>
                </div>
                <button
                  onClick={() => updateQty(item.product_id, 0)}
                  className="ml-1 text-[#717182] hover:text-rose-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totaux + paiement + encaisser */}
        <div className="shrink-0 border-t border-black/[0.06] bg-[#f8f8fc] p-4 space-y-3 dark:border-white/[0.06] dark:bg-white/[0.03]">

          {/* Totaux */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-[#717182]">
              <span>Sous-total</span>
              <span>{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>Remise ({discountPercent}%)</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}

            {/* TVA */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTvaEnabled((v) => !v)}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${tvaEnabled ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-600"}`}
                  title={tvaEnabled ? "Désactiver TVA" : "Activer TVA"}
                >
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${tvaEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <Percent size={11} className="text-[#717182]" />
                <span className="text-[#717182]">TVA</span>
                {tvaEnabled && (
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={tvaRate}
                      onChange={(e) => setTvaRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-10 rounded border border-black/[0.08] bg-white px-1 py-0.5 text-center text-xs font-semibold text-[#17211f] outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <span className="text-xs text-[#717182]">%</span>
                  </div>
                )}
              </div>
              <span className={tvaEnabled ? "text-[#717182]" : "text-stone-300 line-through"}>
                {money(tax)}
              </span>
            </div>

            <div className="flex justify-between border-t border-black/[0.06] pt-2 text-base font-bold text-[#17211f] dark:border-white/[0.06] dark:text-white">
              <span>Total</span>
              <span className="text-emerald-700 dark:text-emerald-400">{money(total)}</span>
            </div>
          </div>

          {/* Remise */}
          <div className="flex items-center gap-2">
            <Percent size={13} className="shrink-0 text-[#717182]" />
            <span className="text-xs font-semibold text-[#717182]">Remise</span>
            <input
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-16 rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-center text-sm font-semibold text-[#17211f] outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <span className="text-xs text-[#717182]">%</span>
            {discountAmount > 0 && (
              <span className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400">
                -{discountAmount.toLocaleString("fr-FR")} F
              </span>
            )}
          </div>

          {/* Modes de paiement */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#717182]">Mode de paiement</p>
            <div className="grid grid-cols-3 gap-1.5">
              {paymentOptions.map((m) => {
                const Icon     = m.icon;
                const selected = paymentMethod === m.method && paymentAccountId === m.accountId;
                return (
                  <button
                    key={m.key}
                    onClick={() => { setPaymentMethod(m.method); setPaymentAccountId(m.accountId); }}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 px-1 text-xs font-medium transition ${
                      selected
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "border-black/[0.08] bg-white text-[#717182] hover:bg-stone-50 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <Icon size={17} />
                    <span className="line-clamp-1 leading-tight text-center">{m.label}</span>
                  </button>
                );
              })}
            </div>
            {posAccounts.length === 0 && (
              <p className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                Aucun compte POS configuré. Ajoutez-en dans <strong>Paramètres → Paiements</strong>.
              </p>
            )}
          </div>

          {/* Bouton Encaisser */}
          <button
            onClick={handleCheckout}
            disabled={!cart.length || sale.isPending || syncing}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-40 ${
              !isOnline
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
            }`}
          >
            {sale.isPending
              ? "Traitement…"
              : !isOnline
              ? `Sauvegarder hors-ligne${total ? " · " + money(total) : ""}`
              : `Encaisser${total ? " · " + money(total) : ""}`}
          </button>

          {/* Erreur */}
          {sale.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <X size={13} className="mt-0.5 shrink-0" />
              {sale.error?.message ?? "Erreur lors de l'encaissement"}
            </div>
          )}

          {/* Reçu de vente */}
          {sale.isSuccess && sale.data && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>Vente enregistrée — {sale.data.receipt_number}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-emerald-800 dark:text-emerald-200">
                <span className="text-[#717182]">Montant</span>
                <span className="font-bold text-right">{money(sale.data.total_amount)}</span>
                <span className="text-[#717182]">Mode</span>
                <span className="font-semibold text-right capitalize">
                  {sale.data.payment_account_label || sale.data.payment_method}
                </span>
                <span className="text-[#717182]">Articles</span>
                <span className="font-semibold text-right">{sale.data.items?.length ?? 0} ligne(s)</span>
              </div>
              {sale.data.items && sale.data.items.length > 0 && (
                <div className="border-t border-emerald-200 dark:border-emerald-500/30 pt-2 space-y-0.5">
                  {sale.data.items.map((item: { product_id: number; name: string; quantity: number; total: number }) => (
                    <div key={item.product_id} className="flex justify-between text-xs text-emerald-700 dark:text-emerald-300">
                      <span>{item.quantity}× {item.name}</span>
                      <span className="font-semibold">{money(item.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 pt-1">
                ✓ Transaction enregistrée · Impact comptabilité et trésorerie mis à jour
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Ticket modal */}
    {ticketData && (
      <TicketModal
        ticket={ticketData}
        onClose={() => setTicketData(null)}
        onNewSale={() => { setTicketData(null); setCart([]); setDiscountPercent(0); }}
      />
    )}
    </>
  );
}
