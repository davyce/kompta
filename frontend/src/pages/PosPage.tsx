import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Clock3, CreditCard, Download, Minus, Percent, Plus, Printer,
  QrCode, RefreshCcw, Scan, Search, ShoppingCart,
  Smartphone, Trash2, User, Wallet, WifiOff, X, Zap,
} from "lucide-react";
import { QrScannerModal } from "../components/QrScannerModal";
import { MoMoPaymentModal } from "../components/MoMoPaymentModal";
import { StripeCardPaymentModal } from "../components/StripeCardPaymentModal";
import { QRCodeSVG } from "qrcode.react";
import { productIconLabel, productIconSuggestions } from "../utils/productIcons";
import { api } from "../services/api";
import { useToast } from "../components/ToastProvider";
import { enqueue, listPending, dequeue } from "../lib/offlineQueue";
import type { PaymentAccount, Product, SaleRecord } from "../types/domain";
import { inferProductIcon } from "../utils/productIcons";
import { money } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import i18n from "../i18n";

/* Modes de paiement qui passent par MTN Mobile Money (Collection API) */
const MOMO_METHODS = new Set(["mobile_money", "orange_money", "mtn", "airtel", "wave"]);

/* ── Product icon component ─────────────────────────────────────────── */
function ProductIcon({ name, category, size = 28 }: { name: string; category: string; size?: number }) {
  const entry = inferProductIcon({ name, category });
  return <span className={entry.color}><entry.Icon size={size} /></span>;
}

/* ── Types & constants ───────────────────────────────────────────────── */
type CartItem = { product_id: number; name: string; price: number; quantity: number; category: string };

const ALL_PAYMENT_METHODS = [
  { key: "qr",           labelTk: "pos.methods.qr",           icon: QrCode },
  { key: "mobile_money", labelTk: "pos.methods.mobileMoney",  icon: Smartphone },
  { key: "wave",         labelTk: "pos.methods.wave",         icon: Zap },
  { key: "orange_money", labelTk: "pos.methods.orangeMoney",  icon: Smartphone },
  { key: "mtn",          labelTk: "pos.methods.mtn",          icon: Smartphone },
  { key: "airtel",       labelTk: "pos.methods.airtel",       icon: Smartphone },
  { key: "bank",         labelTk: "pos.methods.bank",         icon: CreditCard },
  { key: "card",         labelTk: "pos.methods.card",         icon: CreditCard },
  { key: "cash",         labelTk: "pos.methods.cash",         icon: Wallet },
];

function paymentMethodLabel(method: string, tr: TFunction) {
  const item = ALL_PAYMENT_METHODS.find((m) => m.key === method);
  return item ? tr(item.labelTk) : method;
}

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
  company_name?: string;
  client_name?: string;
};

function TicketModal({ ticket, onClose, onNewSale }: { ticket: TicketData; onClose: () => void; onNewSale: () => void }) {
  const { t: tr } = useTranslation();
  return (
    <>
      {/*
        Impression / PDF : l'ancienne règle `body > *:not(#ticket-print-root)`
        cachait #root (enfant direct de body) qui CONTIENT le ticket → page blanche.
        On utilise `visibility` (héritable, ré-affichable sur les descendants) +
        repositionnement, et on FORCE les couleurs claires car en dark mode le texte
        blanc s'imprimait blanc sur blanc (invisible).
      */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #ticket-print-root, #ticket-print-root * { visibility: visible !important; }
          #ticket-print-root {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Force le rendu monochrome lisible (annule le dark mode à l'impression) */
          #ticket-print-root, #ticket-print-root * {
            color: #111827 !important;
            border-color: #9ca3af !important;
          }
          .ticket-no-print { display: none !important; }
          @page { margin: 8mm; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div id="ticket-print-root" className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]">
          {/* Header (non imprimé) */}
          <div className="ticket-no-print flex items-center justify-between border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("pos.ticketTitle")}</h3>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.08]">
              <X size={16} />
            </button>
          </div>

          {/* Ticket body */}
          <div className="p-6 font-mono text-sm">
            {/* Logo + entreprise */}
            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white">
                {(ticket.company_name?.trim()?.[0] ?? "K").toUpperCase()}
              </div>
              {/* Nom de l'entreprise — élément principal du ticket */}
              <p className="text-base font-black uppercase tracking-wide text-[#17211f] dark:text-white">
                {ticket.company_name?.trim() || "KOMPTA"}
              </p>
              {ticket.client_name?.trim() && (
                <p className="mt-0.5 text-xs font-semibold text-[#17211f] dark:text-white/90">
                  {tr("pos.clientLabel", { name: ticket.client_name.trim() })}
                </p>
              )}
              <p className="mt-1 text-xs text-[#717182]">{ticket.date}</p>
              <p className="text-xs text-[#717182]">{tr("pos.receiptLabel", { num: ticket.receipt_number })}</p>
            </div>

            <div className="border-t border-dashed border-black/[0.15] dark:border-white/[0.15] pt-3">
              {/* Articles */}
              <div className="space-y-1">
                {ticket.items.map((item) => {
                  const unitPrice = item.total / item.quantity;
                  return (
                    <div key={item.product_id} className="flex justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[#17211f] dark:text-white">{item.quantity}× {item.name}</span>
                      <span className="shrink-0 text-right text-[#717182]">{item.quantity > 1 ? `${Math.round(unitPrice).toLocaleString(i18n.language)} ×${item.quantity}` : ""}</span>
                      <span className="shrink-0 font-semibold text-[#17211f] dark:text-white">{item.total.toLocaleString(i18n.language)} F</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-dashed border-black/[0.15] dark:border-white/[0.15] pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#717182]">
                  <span>{tr("pos.subtotal")}</span>
                  <span>{ticket.subtotal_before_discount.toLocaleString(i18n.language)} F</span>
                </div>
                {ticket.discount_percent > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>{tr("pos.discount", { pct: ticket.discount_percent })}</span>
                    <span>-{Math.round(ticket.subtotal_before_discount * ticket.discount_percent / 100).toLocaleString(i18n.language)} F</span>
                  </div>
                )}
                {ticket.tax > 0 && (
                  <div className="flex justify-between text-[#717182]">
                    <span>{tr("pos.tva")}</span>
                    <span>{ticket.tax.toLocaleString(i18n.language)} F</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-black/[0.10] dark:border-white/[0.10] pt-2 text-base font-bold text-[#17211f] dark:text-white">
                  <span>{tr("pos.totalTtc")}</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{ticket.total_amount.toLocaleString(i18n.language)} F</span>
                </div>
                <div className="flex justify-between text-[#717182]">
                  <span>{tr("pos.payment")}</span>
                  <span className="font-semibold capitalize">{ticket.payment_account_label || paymentMethodLabel(ticket.payment_method, tr)}</span>
                </div>
              </div>

              <p className="mt-4 text-center text-[10px] text-[#717182]">{tr("pos.thanks")}</p>
            </div>
          </div>

          {/* Actions (non imprimées) */}
          <div className="ticket-no-print flex gap-2 border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <button
              onClick={() => window.print()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50 dark:border-white/[0.08] dark:bg-white/5 dark:text-white"
            >
              <Printer size={15} /> {tr("pos.print")}
            </button>
            <button
              onClick={onNewSale}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ShoppingCart size={15} /> {tr("pos.newSale")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export function PosPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Subscribe to currency changes so the component re-renders when currency switches
  useCurrency();

  const products       = useQuery({ queryKey: ["products"],        queryFn: api.products });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });
  const payConfig      = useQuery({ queryKey: ["paymentsConfig"],   queryFn: api.paymentsConfig });
  // Nom de l'entreprise — affiché et imprimé sur le ticket de caisse
  const company        = useQuery({ queryKey: ["company"],          queryFn: api.company });
  const clients        = useQuery({ queryKey: ["clients", "pos"],   queryFn: () => api.clients({ status: "active" }) });
  const [historyOpen, setHistoryOpen] = useState(false);
  const salesHistory = useQuery({
    queryKey: ["posSales"],
    queryFn: () => api.posSales(50),
    enabled: historyOpen,
  });

  /* ── Recherche + catégorie ── */
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState("Tous");
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Panier ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartId]        = useState(() => Math.floor(Math.random() * 9000) + 1000);

  /* ── Bouton flottant panier : masqué quand le panier est à l'écran ── */
  const cartSectionRef = useRef<HTMLDivElement>(null);
  const [cartVisible, setCartVisible] = useState(false);
  useEffect(() => {
    const el = cartSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setCartVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ── Paiement ── */
  const [paymentMethod,    setPaymentMethod]    = useState("cash");
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [paymentSelectionInitialized, setPaymentSelectionInitialized] = useState(false);

  /* ── TVA ── */
  const [tvaEnabled, setTvaEnabled] = useState(true);
  const [tvaRate,    setTvaRate]     = useState(18);

  /* ── Remise ── */
  const [discountPercent, setDiscountPercent] = useState(0);

  /* ── Client (optionnel) — figure sur le ticket ── */
  const [clientName, setClientName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const selectedClientDiscounts = useQuery({
    queryKey: ["clientDiscounts", selectedClientId],
    queryFn: () => api.clientDiscounts(selectedClientId!),
    enabled: selectedClientId !== null,
  });

  /* ── Ticket modal ── */
  const [ticketData, setTicketData] = useState<TicketData | null>(null);

  /* ── Hors-ligne ── */
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [syncing,        setSyncing]        = useState(false);
  const [offlineToast,   setOfflineToast]   = useState<string | null>(null);

  /* ── Scanner QR ── */
  const [scannerOpen,   setScannerOpen]   = useState(false);

  /* ── Zola QR paiement ── */
  const [zolaQrOpen,    setZolaQrOpen]    = useState(false);

  /* ── Mobile Money paiement ── */
  const [momoOpen,      setMomoOpen]      = useState(false);

  /* ── Stripe card paiement ── */
  const [stripeOpen,    setStripeOpen]    = useState(false);

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
    if (paymentSelectionInitialized) return;
    const def = posAccounts.find((a) => a.is_default_pos) ?? posAccounts[0];
    if (def) {
      setPaymentAccountId(def.id);
      setPaymentMethod(accountMethodKey(def));
      setPaymentSelectionInitialized(true);
      return;
    }
    if (paymentAccounts.isSuccess) {
      setPaymentSelectionInitialized(true);
    }
  }, [paymentAccounts.isSuccess, paymentSelectionInitialized, posAccounts]);

  /* ── Options de paiement affichées ──
     - Si des comptes POS sont configurés : afficher ces comptes + Espèces
     - Sinon : afficher tous les modes génériques */
  const paymentOptions = useMemo(() => {
    type Opt = { key: string; method: string; accountId: number | null; label: string; icon: React.ElementType };
    const options: Opt[] = posAccounts.map((a) => ({
      key:       `account-${a.id}`,
      method:    accountMethodKey(a),
      accountId: a.id as number | null,
      label:     a.label,
      icon:      ALL_PAYMENT_METHODS.find((m) => m.key === accountMethodKey(a))?.icon ?? Wallet,
    }));

    // Espèces : toujours disponible (sauf si déjà présent via un compte cash)
    if (!posAccounts.some((a) => a.provider === "cash")) {
      options.push({ key: "cash", method: "cash", accountId: null, label: paymentMethodLabel("cash", tr), icon: Wallet });
    }
    // Carte bancaire : toujours affichée (Stripe activé OU non, le modal explique)
    if (!options.some((o) => o.method === "card")) {
      options.push({ key: "card", method: "card", accountId: null, label: paymentMethodLabel("card", tr), icon: CreditCard });
    }
    // Mobile Money : disponible dès que MoMo est configuré
    if (payConfig.data?.momo_enabled && !options.some((o) => MOMO_METHODS.has(o.method))) {
      options.push({ key: "mobile_money", method: "mobile_money", accountId: null, label: paymentMethodLabel("mobile_money", tr), icon: Smartphone });
    }
    return options;
  }, [posAccounts, payConfig.data?.momo_enabled, tr]);

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

  /* ── Raccourcis clavier globaux ── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ne pas intercepter si l'utilisateur tape dans un input/textarea
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Enter" && cart.length > 0 && !momoOpen && !stripeOpen && !zolaQrOpen && !scannerOpen) {
        e.preventDefault();
        handleCheckout();
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (search) setSearch("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, momoOpen, stripeOpen, zolaQrOpen, scannerOpen, search]);

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
        date: new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
        company_name: company.data?.name,
        client_name: clientName.trim() || undefined,
      });
      toast.success(tr("pos.saleCashed", { num: data.receipt_number }));
      setCart([]);
      setDiscountPercent(0);
      setClientName("");
      setSelectedClientId(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["posSales"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryMovements"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : tr("pos.cashError");
      toast.error(tr("pos.cashRefused", { msg: message }));
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

  useEffect(() => {
    if (selectedClientId === null) return;
    const client = clients.data?.find((item) => item.id === selectedClientId);
    if (!client) return;
    const eligible = (selectedClientDiscounts.data ?? []).filter(
      (promo) => promo.active && ["all", "pos"].includes(promo.applies_to) && promo.min_order_amount <= subtotal,
    );
    const bestSpecificPercent = eligible
      .filter((promo) => promo.discount_type === "percent")
      .reduce((best, promo) => Math.max(best, promo.discount_value), 0);
    const bestFixed = eligible
      .filter((promo) => promo.discount_type === "fixed")
      .reduce((best, promo) => Math.max(best, promo.discount_value), 0);
    const fixedAsPercent = subtotal > 0 ? Math.min(100, (bestFixed / subtotal) * 100) : 0;
    setClientName(client.name);
    setDiscountPercent(Math.max(client.global_discount_percent ?? 0, bestSpecificPercent, fixedAsPercent));
  }, [clients.data, selectedClientDiscounts.data, selectedClientId, subtotal]);

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

  function handleQrScan(value: string) {
    setScannerOpen(false);
    const v = value.trim().toLowerCase();
    const match = (products.data ?? []).find(
      (p) => p.sku?.toLowerCase() === v || p.qr_code?.toLowerCase() === v,
    );
    if (match) {
      addToCart(match);
      toast.success(tr("pos.productAdded", { name: match.name }));
    } else {
      setSearch(value);
      searchRef.current?.focus();
      toast.error(tr("pos.productNotFound"));
    }
  }

  function buildSalePayload(paymentTransactionId?: number) {
    return {
      payment_method: paymentMethod,
      payment_account_id: paymentAccountId,
      client_id: selectedClientId,
      items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      // Remise + TVA envoyées pour que le serveur calcule le MÊME total que la caisse
      // (sinon le paiement carte/MoMo est rejeté : montant ≠ total).
      discount_percent: discountPercent,
      tva_enabled: tvaEnabled,
      tax_rate: tvaRate,
      ...(paymentTransactionId ? { payment_transaction_id: paymentTransactionId } : {}),
    };
  }

  async function recordSale(paymentTransactionId?: number) {
    const payload = buildSalePayload(paymentTransactionId);
    if (!isOnline) {
      await enqueue(payload);
      const rows = await listPending();
      setPendingCount(rows.length);
      setOfflineToast(tr("pos.offlineQueued", { amount: money(Math.round(total)) }));
      setCart([]);
      setTimeout(() => setOfflineToast(null), 6000);
    } else {
      sale.mutate(payload);
    }
  }

  async function handleCheckout() {
    if (!cart.length) {
      toast.error(tr("pos.cartEmpty"));
      return;
    }
    // Paiement carte — ouvre le modal Stripe réel et exige une confirmation serveur.
    if (paymentMethod === "card") {
      setStripeOpen(true);
      return;
    }
    // Paiement Mobile Money réel : on encaisse via MoMo AVANT d'enregistrer la vente.
    if (isOnline && MOMO_METHODS.has(paymentMethod) && payConfig.data?.momo_enabled) {
      setMomoOpen(true);
      return;
    }
    // Cash + autres modes → enregistrement direct
    await recordSale();
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

    } catch { toast.error(tr("pos.exportError")); }
    finally { setExportLoading(false); }
  }

  async function downloadReceipt(saleId: number, receiptNumber: string) {
    try {
      const blob = await api.posReceiptPdf(saleId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${receiptNumber}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error(tr("pos.exportError"));
    }
  }

  function reopenReceipt(record: SaleRecord) {
    const subtotal = record.items.reduce((sum, item) => sum + item.line_total, 0);
    setTicketData({
      receipt_number: record.receipt_number,
      total_amount: record.total_amount,
      payment_method: record.payment_method,
      payment_account_label: record.payment_account_label,
      items: record.items.map((item, index) => ({
        product_id: -(index + 1),
        name: item.product_name,
        quantity: item.quantity,
        total: item.line_total,
      })),
      cart: [],
      discount_percent: 0,
      subtotal_before_discount: subtotal,
      tax: Math.max(0, record.total_amount - subtotal),
      date: new Date(record.created_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
      company_name: company.data?.name,
    });
    setHistoryOpen(false);
  }

  const cartTotal = total;

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <>
    {/* Titre sémantique visuellement masqué — requis pour l'accessibilité (a11y) */}
    <h1 className="sr-only">{tr("pos.title", { defaultValue: "Point de vente" })}</h1>
    <div className="flex flex-col gap-4 xl:flex-row xl:h-[calc(100vh-56px)]">

      {/* Mobile floating cart button — masqué dès que le panier est visible
          pour ne PAS recouvrir le bouton « Encaisser ». */}
      {cart.length > 0 && !cartVisible && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40 xl:hidden bottom-[calc(5rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl hover:bg-emerald-700"
          >
            <ShoppingCart size={16} />
            {tr("pos.cartFloating", { count: cart.length, amount: money(cartTotal) })}
          </button>
        </div>
      )}

      {/* ── GAUCHE — Catalogue ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

        {/* Barre export CSV */}
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-[#f8f8fc] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Download size={13} className="shrink-0 text-[#717182]" />
          <span className="text-xs font-semibold text-[#717182]">{tr("pos.exportSales")}</span>
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
            {exportLoading ? tr("pos.exporting") : tr("pos.exportCsv")}
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1 text-xs font-semibold text-[#17211f] hover:bg-stone-50 dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <Clock3 size={12} />
            Historique
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
                placeholder={tr("pos.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[#717182] hover:text-[#17211f]">
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              title={tr("pos.scanTitleAttr")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <Scan size={17} />
            </button>
          </div>

          {/* Filtres rapides par icône */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#717182]">{tr("pos.quickFilters")}</span>
            {productIconSuggestions(search, 14).map((entry) => (
              <button
                key={entry.key}
                onClick={() => setSearch(search === entry.label ? "" : entry.label)}
                title={productIconLabel(entry, tr)}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition ${
                  search === entry.label
                    ? `${entry.bg} ${entry.color} border-transparent`
                    : "border-black/[0.06] bg-white text-[#717182] hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <span className={search === entry.label ? entry.color : "text-[#717182]"}>
                  <entry.Icon size={13} />
                </span>
                {productIconLabel(entry, tr)}
              </button>
            ))}
          </div>
        </div>

        {/* Bannières hors-ligne */}
        {!isOnline && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <WifiOff size={13} className="shrink-0" />
            <span className="font-semibold">{tr("pos.offlineModeBold")}</span>{tr("pos.offlineModeRest")}
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <RefreshCcw size={13} className={syncing ? "animate-spin" : ""} />
            <span className="flex-1">{syncing ? tr("pos.syncing") : tr("pos.pendingSync", { count: pendingCount })}</span>
            {!syncing && (
              <button onClick={syncPending} className="rounded-md bg-blue-600 px-2.5 py-0.5 text-white font-semibold hover:bg-blue-700 transition">
                {tr("pos.sync")}
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
              {cat === "Tous" ? tr("common.all") : cat}
            </button>
          ))}
        </div>

        {/* Grille produits */}
        <div className="flex-1 overflow-y-auto p-3">
          {products.isLoading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-[#717182]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
              <p className="text-sm">{tr("pos.loadingCatalogue")}</p>
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
                        {p.stock_quantity <= 0 ? tr("pos.soldOut") : `×${p.stock_quantity}`}
                      </span>
                    </div>
                  </button>
                );
              })}
              {!filteredProducts.length && !products.isLoading && (
                <div className="col-span-full flex flex-col items-center gap-2 py-14 text-[#717182]">
                  <Search size={28} className="opacity-30" />
                  <p className="text-sm">{tr("pos.noProductFound")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DROITE — Caisse ────────────────────────────────────────────── */}
      <div ref={cartSectionRef} id="pos-cart" className="flex xl:w-[400px] xl:shrink-0 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">

        {/* En-tête panier */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-[#17211f] dark:text-white">
                {tr("pos.cartInProgress")}
                <span className="ml-1.5 font-normal text-[10px] text-[#aaaabc]">#{cartId}</span>
              </p>
              <p className="text-[11px] text-[#717182]">{tr("pos.cartArticles", { count: cart.length })}</p>
            </div>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
            >
              <X size={12} /> {tr("pos.clear")}
            </button>
          )}
        </div>

        {/* Articles du panier */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ShoppingCart size={36} className="text-emerald-200" />
              <p className="text-sm text-[#717182]">{tr("pos.clickToAdd")}</p>
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

        {/* Totaux + paiement + encaisser — sticky en bas sur mobile pour rester
            accessible quand on scrolle le panier ; statique sur desktop (xl). */}
        <div className="shrink-0 sticky bottom-0 z-10 border-t border-black/[0.08] bg-[#f8f8fc] p-4 space-y-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-[#1a1d23] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)] xl:static xl:shadow-none">

          {/* Totaux */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-[#717182]">
              <span>{tr("pos.subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>{tr("pos.discount", { pct: discountPercent })}</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}

            {/* TVA */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTvaEnabled((v) => !v)}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${tvaEnabled ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-600"}`}
                  title={tvaEnabled ? tr("pos.disableTva") : tr("pos.enableTva")}
                >
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${tvaEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <Percent size={11} className="text-[#717182]" />
                <span className="text-[#717182]">{tr("pos.tva")}</span>
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
              <span>{tr("pos.total")}</span>
              <span className="text-emerald-700 dark:text-emerald-400">{money(total)}</span>
            </div>
          </div>

          {/* Client (optionnel) — figure sur le ticket de caisse */}
          <div className="flex items-center gap-2">
            <User size={13} className="shrink-0 text-[#717182]" />
            <select
              value={selectedClientId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setSelectedClientId(id);
                if (id === null) {
                  setClientName("");
                  setDiscountPercent(0);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-[#17211f] outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">{tr("pos.clientPlaceholder")}</option>
              {clients.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}{client.global_discount_percent > 0 ? ` · -${client.global_discount_percent}%` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Remise */}
          <div className="flex items-center gap-2">
            <Percent size={13} className="shrink-0 text-[#717182]" />
            <span className="text-xs font-semibold text-[#717182]">{tr("pos.discountLabel")}</span>
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
                -{discountAmount.toLocaleString(i18n.language)} F
              </span>
            )}
          </div>

          {/* Modes de paiement */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#717182]">{tr("pos.paymentMode")}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {paymentOptions.map((m) => {
                const Icon     = m.icon;
                const selected = paymentMethod === m.method && paymentAccountId === m.accountId;
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setPaymentMethod(m.method);
                      setPaymentAccountId(m.accountId);
                      setPaymentSelectionInitialized(true);
                    }}
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
                {tr("pos.addMethodsIn")}{" "}
                <button
                  onClick={() => navigate("/settings?tab=payments")}
                  className="font-semibold underline underline-offset-2 hover:text-amber-900 transition"
                >
                  {tr("pos.settingsPayments")}
                </button>.
              </p>
            )}
          </div>

          {/* QR Zola — afficher le QR au client pour paiement */}
          {paymentMethod === "qr" && cart.length > 0 && (
            <button
              onClick={() => setZolaQrOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300 transition"
            >
              <QrCode size={16} /> {tr("pos.showZolaQr")}
            </button>
          )}

          {/* Bouton Encaisser */}
          <button
            data-tour="pos-checkout"
            onClick={handleCheckout}
            disabled={!cart.length || sale.isPending || syncing}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-40 ${
              !isOnline
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
            }`}
          >
            {sale.isPending
              ? tr("pos.processing")
              : !isOnline
              ? `${tr("pos.saveOffline")}${total ? " · " + money(total) : ""}`
              : `${tr("pos.checkout")}${total ? " · " + money(total) : ""}`}
          </button>

          {/* Hint raccourcis clavier */}
          <p className="text-[10px] text-center text-[#aaaabc] mt-1">
            <kbd className="rounded border border-black/[0.08] px-1 py-0.5 text-[9px]">↵ Enter</kbd> {tr("pos.kbdCheckout")} · <kbd className="rounded border border-black/[0.08] px-1 py-0.5 text-[9px]">/</kbd> {tr("pos.kbdSearch")}
          </p>

          {/* Erreur */}
          {sale.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <X size={13} className="mt-0.5 shrink-0" />
              {sale.error?.message ?? tr("pos.errorCheckout")}
            </div>
          )}

          {/* Reçu de vente */}
          {sale.isSuccess && sale.data && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{tr("pos.saleRecorded", { num: sale.data.receipt_number })}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-emerald-800 dark:text-emerald-200">
                <span className="text-[#717182]">{tr("pos.amount")}</span>
                <span className="font-bold text-right">{money(sale.data.total_amount)}</span>
                <span className="text-[#717182]">{tr("pos.mode")}</span>
                <span className="font-semibold text-right capitalize">
                  {sale.data.payment_account_label || paymentMethodLabel(sale.data.payment_method, tr)}
                </span>
                <span className="text-[#717182]">{tr("pos.articles")}</span>
                <span className="font-semibold text-right">{tr("pos.linesCount", { count: sale.data.items?.length ?? 0 })}</span>
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
                {tr("pos.txRecorded")}
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
        onNewSale={() => { setTicketData(null); setCart([]); setDiscountPercent(0); setClientName(""); setSelectedClientId(null); }}
      />
    )}

    {historyOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setHistoryOpen(false)}>
        <div className="max-h-[85dvh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
            <div>
              <h2 className="font-black text-[#17211f] dark:text-white">Historique des ventes</h2>
              <p className="text-xs text-[#717182]">Retrouvez, imprimez ou téléchargez chaque ticket.</p>
            </div>
            <button onClick={() => setHistoryOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[calc(85dvh-5rem)] overflow-y-auto p-3">
            {salesHistory.isLoading && <p className="p-6 text-center text-sm text-[#717182]">{tr("common.loading")}</p>}
            {salesHistory.isError && <p className="p-6 text-center text-sm text-red-600">{salesHistory.error.message}</p>}
            {salesHistory.data?.length === 0 && <p className="p-6 text-center text-sm text-[#717182]">Aucune vente enregistrée.</p>}
            <div className="space-y-2">
              {salesHistory.data?.map((record) => (
                <div key={record.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
                  <button onClick={() => reopenReceipt(record)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold text-[#17211f] dark:text-white">{record.receipt_number}</p>
                    <p className="text-xs text-[#717182]">
                      {new Date(record.created_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })} · {record.items.length} article(s)
                    </p>
                  </button>
                  <p className="shrink-0 text-sm font-black text-emerald-700 dark:text-emerald-400">{money(record.total_amount)}</p>
                  <button
                    onClick={() => void downloadReceipt(record.id, record.receipt_number)}
                    aria-label={`Télécharger ${record.receipt_number}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-black/[0.08] text-[#17211f] hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/[0.08]"
                  >
                    <Download size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Scanner QR / code-barres produit */}
    {scannerOpen && (
      <QrScannerModal
        title={tr("pos.scanProduct")}
        onScan={handleQrScan}
        onClose={() => setScannerOpen(false)}
      />
    )}

    {/* Paiement Mobile Money réel (MTN MoMo) */}
    {momoOpen && (
      <MoMoPaymentModal
        amountCents={Math.round(total * 100)}
        currency="XAF"
        description={tr("pos.salePosDesc", { id: cartId })}
        onSuccess={(transactionId) => { setMomoOpen(false); recordSale(transactionId); }}
        onClose={() => setMomoOpen(false)}
      />
    )}

    {/* Paiement carte Stripe réel */}
    {stripeOpen && (
      <StripeCardPaymentModal
        amountCents={Math.round(total * 100)}
        currency="XAF"
        description={tr("pos.salePosDesc", { id: cartId })}
        onSuccess={(transactionId) => { setStripeOpen(false); recordSale(transactionId); }}
        onClose={() => setStripeOpen(false)}
      />
    )}

    {/* Modal QR Zola — paiement client */}
    {zolaQrOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <QrCode size={16} className="text-emerald-600" />
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("pos.zolaPayTitle")}</h3>
            </div>
            <button onClick={() => setZolaQrOpen(false)} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white transition">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-black/[0.06]">
              <QRCodeSVG
                value={`zola://pay?amount=${total}&ref=${cartId}&currency=XAF`}
                size={200}
                level="M"
                includeMargin
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{money(total)}</p>
              <p className="text-sm text-[#717182]">{tr("pos.amountToPayZola")}</p>
              <p className="text-xs font-mono text-[#aaaabc]">{tr("pos.refShort", { id: cartId })}</p>
            </div>
            <p className="text-xs text-[#717182] text-center max-w-56">
              {tr("pos.clientScansZola")}
            </p>
            <button
              onClick={() => { setZolaQrOpen(false); handleCheckout(); }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-bold text-white transition"
            >
              <CheckCircle2 size={15} /> {tr("pos.confirmPayment")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
