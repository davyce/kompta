import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CreditCard, Minus, Percent, Plus, QrCode, RefreshCcw, Scan,
  Search, ShoppingCart, Smartphone, Trash2, Wallet, WifiOff, Download, Zap,
} from "lucide-react";

import { api } from "../services/api";
import { enqueue, listPending, dequeue } from "../lib/offlineQueue";
import type { PaymentAccount, Product } from "../types/domain";
import { inferProductIcon, productIconSuggestions } from "../utils/productIcons";

function ProductIcon({ name, category, size = 28 }: { name: string; category: string; size?: number }) {
  const entry = inferProductIcon({ name, category });
  return (
    <span className={entry.color}>
      <entry.Icon size={size} />
    </span>
  );
}

type CartItem = { product_id: number; name: string; price: number; quantity: number; category: string };

const PAYMENT_METHODS = [
  { key: "qr", label: "QR Zola", icon: QrCode },
  { key: "mobile_money", label: "Mobile money", icon: Smartphone },
  { key: "wave", label: "Wave", icon: Zap },
  { key: "orange_money", label: "Orange Money", icon: Smartphone },
  { key: "mtn", label: "MTN MoMo", icon: Smartphone },
  { key: "airtel", label: "Airtel Money", icon: Smartphone },
  { key: "bank", label: "Banque", icon: CreditCard },
  { key: "paypal", label: "PayPal", icon: CreditCard },
  { key: "card", label: "Carte", icon: CreditCard },
  { key: "cash", label: "Espèces", icon: Wallet },
];

function providerLabel(provider: string) {
  return PAYMENT_METHODS.find((m) => m.key === provider || (m.key === "qr" && provider === "zola"))?.label ?? provider;
}

function accountMethodKey(account: PaymentAccount) {
  return account.provider === "zola" ? "qr" : account.provider;
}

export function PosPage() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("qr");
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [offlineConfirm, setOfflineConfirm] = useState<string | null>(null);
  const [cartId] = useState(() => Math.floor(Math.random() * 9000) + 1000);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [tvaRate, setTvaRate] = useState(18);
  const [tvaEnabled, setTvaEnabled] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  async function handleExportCsv() {
    setExportLoading(true);
    try {
      const resp = await api.posExportCsv({
        date_from: exportDateFrom || undefined,
        date_to: exportDateTo || undefined,
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ventes_pos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Erreur export CSV"); }
    finally { setExportLoading(false); }
  }

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    listPending().then((rows) => setPendingCount(rows.length));
  }, []);

  const posAccounts = useMemo(
    () => (paymentAccounts.data ?? []).filter((account) => account.enabled && account.use_for_pos),
    [paymentAccounts.data]
  );

  useEffect(() => {
    if (paymentAccountId !== null) return;
    const defaultAccount = posAccounts.find((account) => account.is_default_pos) ?? posAccounts[0];
    if (defaultAccount) {
      setPaymentAccountId(defaultAccount.id);
      setPaymentMethod(accountMethodKey(defaultAccount));
    }
  }, [paymentAccountId, posAccounts]);

  const syncPending = useCallback(async () => {
    setSyncing(true);
    try {
      const rows = await listPending();
      let synced = 0;
      for (const row of rows) {
        try {
          await api.createSale(row.payload);
          await dequeue(row.id!);
          synced++;
        } catch { /* keep in queue */ }
      }
      setPendingCount(await listPending().then((r) => r.length));
      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["posSales"] });
      }
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (isOnline && pendingCount > 0) syncPending();
  }, [isOnline, pendingCount, syncPending]);

  const sale = useMutation({
    mutationFn: api.createSale,
    onSuccess: () => {
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["posSales"] });
    },
  });

  const categories = useMemo(
    () => ["Tous", ...Array.from(new Set((products.data ?? []).map((p) => p.category)))],
    [products.data]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      const matchSearch = !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q);
      const matchCat = category === "Tous" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products.data, search, category]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = tvaEnabled ? Math.round(subtotal * (tvaRate / 100)) : 0;
  const total = subtotal + tax;

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
    const payload = { payment_method: paymentMethod, payment_account_id: paymentAccountId, items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) };
    if (!isOnline) {
      await enqueue(payload);
      const rows = await listPending();
      setPendingCount(rows.length);
      const tot = cart.reduce((s, i) => s + i.price * i.quantity * (1 + (tvaEnabled ? tvaRate / 100 : 0)), 0);
      setOfflineConfirm(`Vente de ${Math.round(tot).toLocaleString("fr-FR")} XAF mise en file hors-ligne.`);
      setCart([]);
      setTimeout(() => setOfflineConfirm(null), 7000);
    } else {
      sale.mutate(payload);
    }
  }

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">

      {/* LEFT — Catalogue */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
        {/* Export CSV — dedicated top bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-[#f8f8fc] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Download size={13} className="shrink-0 text-[#717182]" />
          <span className="text-xs font-semibold text-[#717182]">Export ventes</span>
          <input
            type="date"
            value={exportDateFrom}
            onChange={(e) => setExportDateFrom(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <span className="text-xs text-[#717182]">→</span>
          <input
            type="date"
            value={exportDateTo}
            onChange={(e) => setExportDateTo(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <button
            onClick={handleExportCsv}
            disabled={exportLoading}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            <Download size={12} />
            {exportLoading ? "Export…" : "Télécharger CSV"}
          </button>
        </div>

        {/* Search bar */}
        <div className="border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Search size={15} className="text-[#717182]" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit, un code-barres…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
              />
            </div>
            <button
              onClick={() => { searchRef.current?.focus(); searchRef.current?.select(); }}
              title="Scanner / recherche par code-barres"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Scan size={17} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#717182]">Filtres rapides</span>
            {productIconSuggestions(search, 14).map((entry) => (
              <button
                key={entry.key}
                onClick={() => setSearch(entry.label)}
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

        {/* Offline / sync banners */}
        {!isOnline && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <WifiOff size={14} className="shrink-0" />
            <span className="font-semibold">Mode hors-ligne</span> — les ventes sont sauvegardées et synchronisées à la reconnexion.
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <RefreshCcw size={14} className={syncing ? "animate-spin" : ""} />
            <span className="flex-1">{syncing ? "Synchronisation…" : `${pendingCount} vente(s) hors-ligne`}</span>
            {!syncing && <button onClick={syncPending} className="rounded bg-emerald-600 px-2 py-0.5 text-white">Sync</button>}
          </div>
        )}
        {offlineConfirm && (
          <div className="mx-3 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            ✓ {offlineConfirm}
          </div>
        )}

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto border-b border-black/[0.06] px-3 py-2.5 dark:border-white/[0.06]">
          {categories.map((cat, i) => (
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

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock_quantity <= 0}
                className="rounded-xl border border-black/[0.06] bg-white p-3 text-left transition hover:border-emerald-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.06] dark:bg-[#1e2229] dark:hover:border-emerald-500"
              >
                <div className={`mb-2 flex aspect-square items-center justify-center rounded-lg ${inferProductIcon(p).bg} dark:bg-white/[0.06]`}>
                  <ProductIcon name={p.name} category={p.category} size={32} />
                </div>
                <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{p.name}</p>
                <p className="text-xs text-[#717182]">{p.category}</p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {p.price.toLocaleString("fr-FR")} XAF
                  </p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    p.stock_quantity <= 0
                      ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                      : p.stock_quantity <= (p.reorder_level ?? 5)
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  }`}>
                    {p.stock_quantity <= 0 ? "Épuisé" : `${p.stock_quantity}`}
                  </span>
                </div>
              </button>
            ))}
            {!filteredProducts.length && (
              <p className="col-span-full py-10 text-center text-sm text-[#717182]">Aucun produit trouvé.</p>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — Cart */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
        {/* Cart header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="font-semibold text-[#17211f] dark:text-white">Panier #{cartId}</h3>
            <p className="text-xs text-[#717182]">Caisse Plateau · {cart.length} article{cart.length !== 1 ? "s" : ""}</p>
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
              Annuler
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ShoppingCart size={36} className="text-emerald-200" />
              <p className="text-sm text-[#717182]">Cliquez sur un produit pour l'ajouter</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 px-5 py-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${inferProductIcon({ name: item.name, category: item.category }).bg} dark:bg-white/10`}>
                  <ProductIcon name={item.name} category={item.category} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{item.name}</p>
                  <p className="text-xs text-[#717182]">{item.price.toLocaleString("fr-FR")} XAF</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.product_id, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] hover:bg-[#f5f5fa] dark:border-white/10">
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] hover:bg-[#f5f5fa] dark:border-white/10">
                    <Plus size={12} />
                  </button>
                </div>
                <button onClick={() => updateQty(item.product_id, 0)} className="text-[#717182] hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals + payment */}
        <div className="border-t border-black/[0.06] bg-[#f8f8fc] p-4 space-y-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-[#717182]">
              <span>Sous-total</span>
              <span>{subtotal.toLocaleString("fr-FR")} XAF</span>
            </div>
            {/* TVA row with inline controls */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTvaEnabled((v) => !v)}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${tvaEnabled ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-600"}`}
                  title={tvaEnabled ? "Désactiver TVA" : "Activer TVA"}
                >
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${tvaEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <Percent size={12} className="text-[#717182]" />
                <span className="text-[#717182]">TVA</span>
                {tvaEnabled && (
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={tvaRate}
                      onChange={(e) => setTvaRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-10 rounded border border-black/[0.08] bg-white px-1 py-0.5 text-center text-xs font-semibold text-ink outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <span className="text-xs text-[#717182]">%</span>
                  </div>
                )}
              </div>
              <span className={tvaEnabled ? "text-[#717182]" : "text-stone-300 line-through"}>
                {tax.toLocaleString("fr-FR")} XAF
              </span>
            </div>
            <div className="flex justify-between border-t border-black/[0.06] pt-2 text-base font-semibold text-[#17211f] dark:border-white/[0.06] dark:text-white">
              <span>Total</span>
              <span className="text-emerald-700 dark:text-emerald-400">{total.toLocaleString("fr-FR")} XAF</span>
            </div>
          </div>

          {/* Payment methods */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ...posAccounts.map((account) => ({
                key: `account-${account.id}`,
                method: accountMethodKey(account),
                accountId: account.id,
                label: account.label,
                icon: PAYMENT_METHODS.find((m) => m.key === accountMethodKey(account))?.icon ?? Wallet,
                hint: `${providerLabel(account.provider)} · ${account.masked_identifier || account.currency}`,
              })),
              ...PAYMENT_METHODS.filter((method) => ["wave", "orange_money", "mtn", "airtel", "card", "cash"].includes(method.key)).map((method) => ({
                key: method.key,
                method: method.key,
                accountId: null,
                label: method.label,
                icon: method.icon,
                hint: "Sans compte configuré",
              })),
            ].map((m) => {
              const Icon = m.icon;
              const selected = paymentMethod === m.method && paymentAccountId === m.accountId;
              return (
                <button
                  key={m.key}
                  onClick={() => { setPaymentMethod(m.method); setPaymentAccountId(m.accountId); }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition ${
                    selected
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "border-black/[0.08] bg-white text-[#717182] hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
                  }`}
                  title={m.hint}
                >
                  <Icon size={18} />
                  <span className="line-clamp-2 leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
          {posAccounts.length === 0 && (
            <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Aucun compte Zola/mobile money/PayPal configuré. Ajoutez-les dans Paramètres → Paiements.
            </p>
          )}

          <button
            onClick={handleCheckout}
            disabled={!cart.length || sale.isPending || syncing}
            className={`w-full rounded-lg py-3 text-sm font-semibold text-white transition disabled:opacity-50 ${
              !isOnline ? "bg-amber-600 hover:bg-amber-700" : "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-green-700"
            }`}
          >
            {sale.isPending ? "Traitement…" : !isOnline
              ? `Sauvegarder hors-ligne${total ? " · " + total.toLocaleString("fr-FR") + " XAF" : ""}`
              : `Encaisser${total ? " " + total.toLocaleString("fr-FR") + " XAF" : ""}`}
          </button>

          {sale.error && <p className="text-xs text-rose-600">{sale.error.message}</p>}
          {sale.data && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              ✓ Reçu {sale.data.receipt_number} · {sale.data.total_amount.toLocaleString("fr-FR")} XAF encaissé
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
