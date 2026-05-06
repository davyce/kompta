import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, CreditCard, Download, Minus, Percent, Plus,
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
    onSuccess: () => {
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["posSales"] });
    },
  });

  /* Auto-effacement du toast succès après 5 s */
  useEffect(() => {
    if (!sale.isSuccess) return;
    const t = setTimeout(() => sale.reset(), 5000);
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
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax      = tvaEnabled ? Math.round(subtotal * (tvaRate / 100)) : 0;
  const total    = subtotal + tax;

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

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">

      {/* ── GAUCHE — Catalogue ─────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

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
      <div className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

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

          {/* Succès */}
          {sale.isSuccess && sale.data && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              <span>Reçu {sale.data.receipt_number} · {money(sale.data.total_amount)} encaissé</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
