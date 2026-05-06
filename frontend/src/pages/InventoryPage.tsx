import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Boxes, Camera, Check, Filter,
  MapPin, Plus, Printer, QrCode, RefreshCcw, Search, Sparkles, X,
} from "lucide-react";

import { api } from "../services/api";
import type { Product } from "../types/domain";
import { shortDate, money, compactMoney } from "../utils/format";
import { inferProductIcon, productIconSuggestions } from "../utils/productIcons";
import { useCurrency } from "../contexts/CurrencyContext";

function ProductIconDisplay({ product, size = 22 }: { product: Pick<Product, "name" | "category">; size?: number }) {
  const entry = inferProductIcon(product);
  return (
    <span className={entry.color}>
      <entry.Icon size={size} />
    </span>
  );
}

function statusBadge(qty: number, threshold: number) {
  if (qty === 0) return { label: "Rupture", cls: "bg-rose-50 text-rose-700" };
  if (qty <= threshold) return { label: "Bas", cls: "bg-amber-50 text-amber-700" };
  return { label: "OK", cls: "bg-emerald-50 text-emerald-700" };
}

type Tab = "list" | "movements" | "labels" | "alerts";

function AlertsTab({ lowStock, onRestock, restocking }: {
  lowStock: import("../types/domain").Product[];
  onRestock: (p: import("../types/domain").Product) => void;
  restocking: boolean;
}) {
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);

  function handleRestock(p: import("../types/domain").Product) {
    setRestockingId(p.id);
    onRestock(p);
    setTimeout(() => {
      setDone((d) => [...d, p.id]);
      setRestockingId(null);
    }, 1200);
  }

  if (lowStock.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Check size={40} className="text-emerald-500" />
        <p className="font-semibold text-[#17211f] dark:text-white">Tout est nominal</p>
        <p className="text-sm text-[#717182]">Aucun produit sous le seuil de réapprovisionnement</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {lowStock.length} produit{lowStock.length > 1 ? "s" : ""} nécessitent une action — réapprovisionnement recommandé
      </div>
      {lowStock.map((p) => {
        const isDone = done.includes(p.id);
        const isRestocking = restockingId === p.id && restocking;
        const qtyToOrder = Math.max(p.reorder_level * 2 - p.stock_quantity, 10);
        return (
          <div key={p.id} className="flex items-start gap-3 rounded-lg border border-black/[0.06] p-4 dark:border-white/[0.06]">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${inferProductIcon(p).bg} dark:bg-white/10`}>
              <ProductIconDisplay product={p} size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[#17211f] dark:text-white">{p.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.stock_quantity === 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                  {p.stock_quantity === 0 ? "Rupture" : `Stock bas · ${p.stock_quantity} restants`}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#717182]">
                Seuil : {p.reorder_level} · SKU : {p.sku} · Prix : {money(p.price)}
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Recommandation IA : commander {qtyToOrder} unités → stock cible {p.reorder_level * 2}
              </p>
            </div>
            <button
              onClick={() => handleRestock(p)}
              disabled={isRestocking || isDone}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${
                isDone
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              }`}
            >
              {isDone ? "✓ Réappro. lancé" : isRestocking ? "Traitement…" : `+ ${qtyToOrder} unités`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_FORM = { name: "", sku: "", category: "Général", price: 0, stock_quantity: 0, reorder_level: 5 };
type EditableProductForm = Omit<typeof EMPTY_FORM, "sku"> & { brand: string; variant: string };
type ImagePreview = { file: File; url: string };

export function InventoryPage() {
  const queryClient = useQueryClient();
  // Subscribe to currency changes so money() calls re-render with new currency
  useCurrency();
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });
  const movements = useQuery({ queryKey: ["inventoryMovements"], queryFn: api.inventoryMovements });
  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  type InvSortField = "name" | "price" | "stock" | "category";
  const [invSortField, setInvSortField] = useState<InvSortField>("name");
  const [invSortDir, setInvSortDir] = useState<"asc" | "desc">("asc");
  function toggleInvSort(f: InvSortField) {
    if (invSortField === f) setInvSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setInvSortField(f); setInvSortDir("asc"); }
  }
  function InvSortIcon({ field }: { field: InvSortField }) {
    if (invSortField !== field) return <ArrowUpDown size={11} className="ml-0.5 opacity-40" />;
    return invSortDir === "asc" ? <ArrowUp size={11} className="ml-0.5 text-emerald-500" /> : <ArrowDown size={11} className="ml-0.5 text-emerald-500" />;
  }
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [scanError, setScanError] = useState("");
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<EditableProductForm>({
    name: "",
    category: "Général",
    brand: "KOMPTA",
    variant: "Standard",
    price: 0,
    stock_quantity: 0,
    reorder_level: 5,
  });
  const [editImagePreviews, setEditImagePreviews] = useState<ImagePreview[]>([]);

  const createProduct = useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => {
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
  const updateProduct = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Product> }) => api.updateProduct(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const uploadImages = useMutation({
    mutationFn: ({ id, files }: { id: number; files: File[] }) => api.uploadProductImages(id, files),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const generateQr = useMutation({
    mutationFn: api.qrLabel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const scanQr = useMutation({
    mutationFn: api.scanProductQr,
    onSuccess: (product) => {
      setScanResult(product);
      setScanError("");
    },
    onError: (error) => {
      setScanResult(null);
      setScanError(error instanceof Error ? error.message : "QR introuvable");
    },
  });

  const categories = useMemo(
    () => ["Tous", ...Array.from(new Set((products.data ?? []).map((p) => p.category)))],
    [products.data]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = (products.data ?? []).filter((p) => {
      const matchSearch = !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q);
      const matchCat = category === "Tous" || p.category === category;
      const matchStock =
        stockFilter === "all" ? true :
        stockFilter === "out" ? p.stock_quantity === 0 :
        p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level;
      return matchSearch && matchCat && matchStock;
    });
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (invSortField === "name")     cmp = a.name.localeCompare(b.name, "fr");
      if (invSortField === "price")    cmp = a.price - b.price;
      if (invSortField === "stock")    cmp = a.stock_quantity - b.stock_quantity;
      if (invSortField === "category") cmp = (a.category ?? "").localeCompare(b.category ?? "", "fr");
      return invSortDir === "asc" ? cmp : -cmp;
    });
  }, [products.data, search, category, stockFilter, invSortField, invSortDir]);

  const lowStock = (products.data ?? []).filter((p) => p.stock_quantity <= p.reorder_level);
  const ruptures = (products.data ?? []).filter((p) => p.stock_quantity === 0);
  const totalValue = (products.data ?? []).reduce((s, p) => s + p.price * p.stock_quantity, 0);

  function toggleSelect(id: number) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? filtered.map((p) => p.id) : []);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    createProduct.mutate(form);
  }

  function openEdit(product: Product) {
    clearEditImages();
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      category: product.category,
      brand: product.brand,
      variant: product.variant,
      price: product.price,
      stock_quantity: product.stock_quantity,
      reorder_level: product.reorder_level,
    });
  }

  function clearEditImages() {
    editImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setEditImagePreviews([]);
  }

  function closeEdit() {
    clearEditImages();
    setEditingProduct(null);
  }

  function handleEditImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setEditImagePreviews((current) => [
      ...current,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    event.target.value = "";
  }

  function removeEditImage(index: number) {
    setEditImagePreviews((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingProduct) return;
    await updateProduct.mutateAsync({ id: editingProduct.id, payload: editForm });
    if (editImagePreviews.length) {
      await uploadImages.mutateAsync({ id: editingProduct.id, files: editImagePreviews.map((preview) => preview.file) });
    }
    closeEdit();
  }

  async function openQr(product: Product) {
    if (!product.qr_generated || !product.qr_code) {
      const generated = await generateQr.mutateAsync(product.id);
      setQrProduct(generated.product);
      return;
    }
    setQrProduct(product);
  }

  function submitScan(event: FormEvent) {
    event.preventDefault();
    if (!scanInput.trim()) return;
    scanQr.mutate(scanInput.trim());
  }

  const tabs: { key: Tab; label: string; icon: typeof Boxes }[] = [
    { key: "list", label: "Catalogue produits", icon: Boxes },
    { key: "movements", label: "Mouvements", icon: RefreshCcw },
    { key: "labels", label: "Étiquettes QR", icon: QrCode },
    { key: "alerts", label: `Alertes IA${lowStock.length ? ` (${lowStock.length})` : ""}`, icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#17211f] dark:text-white">Inventaire</h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {products.data?.length ?? "…"} références · QR codes intégrés pour scan rapide
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setScanOpen(true)} className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5">
            <Camera size={15} /> Scanner
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => setTab("labels")}
              className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
            >
              <QrCode size={15} /> QR codes ({selected.length})
            </button>
          )}
          <button
            onClick={() => document.getElementById("add-product-form")?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={15} /> Produit
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Valeur stock", value: compactMoney(totalValue), hint: "prix de vente total", accent: "indigo" },
          { label: "Ruptures", value: ruptures.length.toString(), hint: "à réapprovisionner urgt.", accent: "rose" },
          { label: "Sous seuil", value: lowStock.length.toString(), hint: "seuils d'alerte dépassés", accent: "amber" },
          { label: "Références", value: (products.data?.length ?? "…").toString(), hint: "produits actifs", accent: "sky" },
        ].map((k) => {
          const colors: Record<string, string> = {
            indigo: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
            emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
            amber: "from-amber-500/15 to-amber-500/0 text-amber-600",
            rose: "from-rose-500/15 to-rose-500/0 text-rose-600",
            sky: "from-sky-500/15 to-sky-500/0 text-sky-600",
          };
          return (
            <div key={k.label} className="relative overflow-hidden rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
              <div className={`absolute -right-8 -top-8 size-32 rounded-full bg-gradient-to-br ${colors[k.accent]} blur-2xl opacity-70`} />
              <p className="text-sm text-[#717182]">{k.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#17211f] dark:text-white">{k.value}</p>
              <p className="mt-0.5 text-xs text-[#717182]">{k.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertCircle size={17} className="shrink-0 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {lowStock.length} produit{lowStock.length > 1 ? "s" : ""} sous le seuil de réapprovisionnement
          </p>
          <p className="truncate text-sm text-amber-600 dark:text-amber-400">
            {lowStock.map((p) => p.name).join(" · ")}
          </p>
        </div>
      )}

      {/* Main tabs card */}
      <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
        {/* Tab bar */}
        <div className="flex items-center gap-0 overflow-x-auto border-b border-black/[0.06] px-2 dark:border-white/[0.06]">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm -mb-px transition ${
                  tab === t.key
                    ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                    : "border-transparent text-[#717182] hover:text-[#17211f] dark:hover:text-white"
                }`}
              >
                <Icon size={15} />{t.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {/* ── Catalogue ── */}
          {tab === "list" && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex flex-1 min-w-56 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <Search size={15} className="text-[#717182]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher par SKU, nom, catégorie…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
                  />
                </div>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    showFilters || stockFilter !== "all"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-black/[0.08] bg-white hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <Filter size={14} /> Filtres{stockFilter !== "all" ? " ·" : ""}
                  {stockFilter === "low" && " Stock bas"}
                  {stockFilter === "out" && " Ruptures"}
                </button>
                {showFilters && (
                  <div className="flex gap-1.5 rounded-lg border border-black/[0.06] bg-white p-1.5 dark:border-white/[0.06] dark:bg-[#1e2229]">
                    {(["all", "low", "out"] as const).map((key) => (
                      <button
                        key={key}
                        onClick={() => { setStockFilter(key); }}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                          stockFilter === key
                            ? "bg-emerald-600 text-white"
                            : "text-[#717182] hover:bg-stone-100 dark:hover:bg-white/10"
                        }`}
                      >
                        {key === "all" ? "Tous" : key === "low" ? "Stock bas" : "Ruptures"}
                      </button>
                    ))}
                  </div>
                )}
                {selected.length > 0 && (
                  <button
                    onClick={() => setTab("labels")}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Printer size={14} /> Imprimer étiquettes ({selected.length})
                  </button>
                )}
              </div>

              {/* Category pills */}
              <div className="mb-4 flex gap-2 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      category === cat
                        ? "bg-emerald-600 text-white"
                        : "bg-[#ececf0] text-[#717182] hover:bg-[#e0e0ea] dark:bg-white/10 dark:text-white/60"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/[0.06] text-left text-xs font-semibold uppercase tracking-wide text-[#717182] dark:border-white/[0.06]">
                      <th className="w-10 py-2 pr-3">
                        <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} className="rounded" />
                      </th>
                      <th className="py-2 pr-4 cursor-pointer" onClick={() => toggleInvSort("name")}>
                        <span className="flex items-center">Produit<InvSortIcon field="name" /></span>
                      </th>
                      <th className="py-2 pr-4 hidden sm:table-cell">SKU</th>
                      <th className="py-2 pr-4 hidden md:table-cell cursor-pointer" onClick={() => toggleInvSort("category")}>
                        <span className="flex items-center">Catégorie<InvSortIcon field="category" /></span>
                      </th>
                      <th className="py-2 pr-4 hidden lg:table-cell">Site</th>
                      <th className="py-2 pr-4 text-right cursor-pointer" onClick={() => toggleInvSort("price")}>
                        <span className="flex items-center justify-end">Prix<InvSortIcon field="price" /></span>
                      </th>
                      <th className="py-2 pr-4 text-right cursor-pointer" onClick={() => toggleInvSort("stock")}>
                        <span className="flex items-center justify-end">Stock<InvSortIcon field="stock" /></span>
                      </th>
                      <th className="py-2 pr-4">Statut</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                    {filtered.map((p) => {
                      const badge = statusBadge(p.stock_quantity, p.reorder_level);
                      return (
                        <tr key={p.id} className={`hover:bg-[#f8f8fc] dark:hover:bg-white/[0.03] ${selected.includes(p.id) ? "bg-emerald-50/50 dark:bg-emerald-500/5" : ""}`}>
                          <td className="py-3 pr-3">
                            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${inferProductIcon(p).bg} dark:bg-white/[0.06]`}>
                                <ProductIconDisplay product={p} size={18} />
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate font-medium text-[#17211f] dark:text-white">{p.name}</span>
                                {(p.images?.length ?? 0) > 0 && (
                                  <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                                    {p.images.length} image{p.images.length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 hidden sm:table-cell font-mono text-xs text-[#717182]">{p.sku}</td>
                          <td className="py-3 pr-4 hidden md:table-cell text-[#717182]">{p.category}</td>
                          <td className="py-3 pr-4 hidden lg:table-cell">
                            <span className="flex items-center gap-1 text-[#717182]"><MapPin size={12} />Plateau</span>
                          </td>
                          <td className="py-3 pr-4 text-right font-medium text-[#17211f] dark:text-white">{p.price.toLocaleString("fr-FR")}</td>
                          <td className="py-3 pr-4 text-right font-medium text-[#17211f] dark:text-white">{p.stock_quantity}</td>
                          <td className="py-3 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => openEdit(p)}
                                className="rounded-md border border-black/[0.08] px-2.5 py-1.5 text-xs hover:bg-[#f5f5fa] dark:border-white/10"
                              >
                                Modifier
                              </button>
                              <button
                                onClick={() => openQr(p)}
                                className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2.5 py-1.5 text-xs hover:bg-[#f5f5fa] dark:border-white/10"
                              >
                                <QrCode size={12} /> Voir QR
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="py-10 text-center text-sm text-[#717182]">Aucun produit trouvé.</p>
                )}
              </div>
            </>
          )}

          {/* ── Mouvements ── */}
          {tab === "movements" && (
            <div className="space-y-2">
              {movements.isLoading && <div className="h-32 animate-pulse rounded-lg bg-[#ececf0] dark:bg-white/10" />}
              {(movements.data ?? []).length === 0 && !movements.isLoading && (
                <p className="py-10 text-center text-sm text-[#717182]">Aucun mouvement enregistré.</p>
              )}
              {(movements.data ?? []).map((m) => {
                const isIn = m.movement_type === "in";
                const Icon = isIn ? ArrowDown : ArrowUp;
                const productName = (products.data ?? []).find((p) => p.id === m.product_id)?.name ?? `Produit #${m.product_id}`;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-black/[0.06] p-3 dark:border-white/[0.06]">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#17211f] dark:text-white">
                        {isIn ? "Entrée" : "Sortie"} — <span className="font-semibold">{productName}</span>
                        {m.reason ? ` · ${m.reason}` : ""}
                      </p>
                      <p className="text-xs text-[#717182]">{shortDate(m.created_at)}</p>
                    </div>
                    <span className={`text-sm font-semibold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                      {isIn ? "+" : "-"}{m.quantity} unité{m.quantity !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Étiquettes QR ── */}
          {tab === "labels" && (
            <div className="text-center py-10">
              <QrCode size={48} className="mx-auto text-emerald-600 mb-3" />
              <h3 className="font-semibold text-[#17211f] dark:text-white">Génération d'étiquettes QR</h3>
              <p className="mt-1 text-sm text-[#717182] max-w-md mx-auto">
                Sélectionnez des produits dans le catalogue puis générez une planche A4 prête à imprimer.
              </p>
              {selected.length > 0 ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-4xl mx-auto">
                  {(products.data ?? []).filter((p) => selected.includes(p.id)).map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#c0c0d0] bg-white p-3 text-center text-xs dark:bg-white/5">
                      <QRCodeSVG value={p.qr_code || p.sku} size={104} level="M" includeMargin />
                      <p className="font-mono text-[10px] text-[#717182] truncate w-full">{p.sku}</p>
                      <p className="font-medium text-[#17211f] dark:text-white truncate w-full">{p.name}</p>
                      <p className="text-emerald-600">{money(p.price)}</p>
                      <button onClick={() => openQr(p)} className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                        Agrandir
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-6 flex gap-3 justify-center">
                <button onClick={() => setTab("list")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  {selected.length > 0 ? `Imprimer ${selected.length} étiquette(s)` : "Choisir des produits"}
                </button>
                {(products.data?.length ?? 0) > 0 && (
                  <button onClick={() => setSelected((products.data ?? []).map((p) => p.id))} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10">
                    Tous les produits
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Alertes IA ── */}
          {tab === "alerts" && (
            <AlertsTab lowStock={lowStock} onRestock={(p) => {
              updateProduct.mutate({ id: p.id, payload: { stock_quantity: p.stock_quantity + Math.max(p.reorder_level * 2 - p.stock_quantity, 10) } });
            }} restocking={updateProduct.isPending} />
          )}
        </div>
      </div>

      {/* Add product form */}
      <div id="add-product-form" className="rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#17211f] dark:text-white">Nouveau produit</h3>
            <p className="mt-1 text-xs text-[#717182]">Le pictogramme se propose automatiquement depuis le nom ou la catégorie.</p>
          </div>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${inferProductIcon(form).bg} dark:bg-white/[0.06]`}>
            <ProductIconDisplay product={form} size={22} />
            <span className="text-xs font-bold uppercase tracking-wide text-[#17211f] dark:text-white">icône suggérée</span>
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Icône rapide</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {productIconSuggestions(`${form.name} ${form.category}`, 20).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setForm((value) => ({ ...value, category: entry.label }))}
                  title={entry.label}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold transition
                    ${form.category === entry.label
                      ? `${entry.bg} ${entry.color} border-transparent`
                      : "bg-white text-[#17211f] hover:border-violet-300 hover:bg-violet-50 dark:bg-white/5 dark:text-white dark:border-white/10 dark:hover:bg-violet-500/10"}`}
                >
                  <span className={form.category === entry.label ? entry.color : "text-[#717182]"}>
                    <entry.Icon size={13} />
                  </span>
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          {[
            { label: "Nom du produit", key: "name", placeholder: "Ex : Jus Tropical 33cl" },
            { label: "SKU", key: "sku", placeholder: "Ex : JUS-TROP-33" },
            { label: "Catégorie", key: "category", placeholder: "Général" },
          ].map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{f.label}</span>
              <input
                value={(form as any)[f.key]}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
          ))}
          {[
            { label: "Prix unitaire (XAF)", key: "price" },
            { label: "Quantité en stock", key: "stock_quantity" },
            { label: "Seuil de réapprovisionnement", key: "reorder_level" },
          ].map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{f.label}</span>
              <input
                type="number"
                min={0}
                value={(form as any)[f.key]}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
          ))}
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={createProduct.isPending || !form.name || !form.sku}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <QrCode size={15} />
              {createProduct.isPending ? "Création…" : "Créer + générer QR"}
            </button>
          </div>
        </form>
      </div>

      {/* Scanner modal */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setScanOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <Camera size={18} className="text-emerald-600" />
              <h3 className="flex-1 font-semibold text-[#17211f] dark:text-white">Scanner un QR Kompta</h3>
              <button onClick={() => setScanOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f5f5fa] dark:hover:bg-white/10">
                <X size={15} />
              </button>
            </div>
            <div className="aspect-square bg-slate-900 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 to-green-900/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-56 w-56 rounded-2xl border-2 border-emerald-400">
                  {["top-0 left-0", "top-0 right-0 rotate-90", "bottom-0 right-0 rotate-180", "bottom-0 left-0 -rotate-90"].map((pos) => (
                    <span key={pos} className={`absolute ${pos} h-6 w-6 rounded-tl-lg border-l-4 border-t-4 border-emerald-300`} />
                  ))}
                  <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">
                    Pointez vers une étiquette QR Kompta
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <form onSubmit={submitScan} className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">QR code ou SKU</span>
                  <input
                    value={scanInput}
                    onChange={(event) => setScanInput(event.target.value)}
                    placeholder="Ex : KOMPTA:1:SKU:12 ou SKU"
                    className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <button
                  disabled={scanQr.isPending || !scanInput.trim()}
                  className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {scanQr.isPending ? "Scan…" : "Scanner ce code"}
                </button>
              </form>
              {scanResult && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <Check size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#17211f] dark:text-white">{scanResult.name} — {scanResult.sku}</p>
                    <p className="text-xs text-[#717182]">{scanResult.stock_quantity} en stock · {money(scanResult.price)}</p>
                  </div>
                </div>
              )}
              {scanError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{scanError}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded-lg border border-black/[0.08] py-2 text-sm dark:border-white/10" onClick={() => setScanOpen(false)}>
                  Continuer le scan
                </button>
                <button className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white" onClick={() => setScanOpen(false)}>
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setQrProduct(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-white p-5 text-center shadow-2xl dark:border-white/10 dark:bg-[#1e2229]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <QrCode size={22} />
            </div>
            <h3 className="mt-3 text-lg font-semibold text-[#17211f] dark:text-white">{qrProduct.name}</h3>
            <p className="text-xs font-mono text-[#717182]">{qrProduct.sku}</p>
            <div className="mt-4 inline-flex rounded-2xl border border-black/[0.08] bg-white p-4">
              <QRCodeSVG value={qrProduct.qr_code || qrProduct.sku} size={220} level="M" includeMargin />
            </div>
            <p className="mt-3 break-all rounded-lg bg-[#f8f8fc] px-3 py-2 text-[11px] font-mono text-[#717182] dark:bg-white/5">
              {qrProduct.qr_code || qrProduct.sku}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setQrProduct(null)} className="rounded-lg border border-black/[0.08] py-2 text-sm dark:border-white/10">
                Fermer
              </button>
              <button onClick={() => window.print()} className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">
                Imprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={closeEdit}>
          <form
            onSubmit={submitEdit}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`grid h-12 w-12 place-items-center rounded-xl ${inferProductIcon(editForm).bg} dark:bg-white/10`}>
                  <ProductIconDisplay product={editForm} size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#17211f] dark:text-white">Modifier le produit</h3>
                  <p className="text-xs text-[#717182]">{editingProduct.sku} · galerie multi-images</p>
                </div>
              </div>
              <button type="button" onClick={closeEdit} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f5f5fa] dark:hover:bg-white/10">
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Nom du produit", key: "name" },
                  { label: "Catégorie", key: "category" },
                  { label: "Marque", key: "brand" },
                  { label: "Variante", key: "variant" },
                ].map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{field.label}</span>
                    <input
                      value={(editForm as any)[field.key]}
                      onChange={(event) => setEditForm((value) => ({ ...value, [field.key]: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </label>
                ))}
                {[
                  { label: "Prix unitaire", key: "price" },
                  { label: "Stock", key: "stock_quantity" },
                  { label: "Seuil", key: "reorder_level" },
                ].map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{field.label}</span>
                    <input
                      type="number"
                      min={0}
                      value={(editForm as any)[field.key]}
                      onChange={(event) => setEditForm((value) => ({ ...value, [field.key]: Number(event.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Icône de catégorie</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {productIconSuggestions(`${editForm.name} ${editForm.category}`, 16).map((entry) => (
                      <button
                        key={`edit-${entry.key}`}
                        type="button"
                        onClick={() => setEditForm((value) => ({ ...value, category: entry.label }))}
                        title={entry.label}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold transition
                          ${editForm.category === entry.label
                            ? `${entry.bg} ${entry.color} border-transparent`
                            : "bg-white text-[#17211f] hover:border-violet-300 hover:bg-violet-50 dark:bg-white/5 dark:text-white dark:border-white/10 dark:hover:bg-violet-500/10"}`}
                      >
                        <span className={editForm.category === entry.label ? entry.color : "text-[#717182]"}>
                          <entry.Icon size={13} />
                        </span>
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-black/[0.08] bg-[#f8f8fc] p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#17211f] dark:text-white">Images produit</p>
                      <p className="text-xs text-[#717182]">Ajoute face, dos, emballage, détail.</p>
                    </div>
                    <label className="cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
                      Ajouter
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleEditImages} />
                    </label>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(editingProduct.images ?? []).map((image) => (
                      <div key={image.id} className="rounded-lg border border-black/[0.06] bg-white p-2 text-xs dark:border-white/10 dark:bg-[#252931]">
                        <div className="grid aspect-square place-items-center rounded-md bg-violet-50 text-2xl dark:bg-violet-500/10">🖼️</div>
                        <p className="mt-1 truncate font-semibold text-[#17211f] dark:text-white">{image.filename}</p>
                        <p className="text-[10px] text-[#717182]">{image.is_primary ? "Principale" : "Galerie"}</p>
                      </div>
                    ))}
                    {editImagePreviews.map((preview, index) => (
                      <div key={preview.url} className="relative overflow-hidden rounded-lg border border-violet-200 bg-white p-1 dark:border-violet-500/30 dark:bg-[#252931]">
                        <img src={preview.url} alt={preview.file.name} className="aspect-square w-full rounded-md object-cover" />
                        <button
                          type="button"
                          onClick={() => removeEditImage(index)}
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-950/70 text-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {!editingProduct.images?.length && !editImagePreviews.length && (
                      <div className="col-span-2 rounded-lg border border-dashed border-black/[0.12] p-5 text-center text-xs text-[#717182] dark:border-white/15">
                        Aucune image encore.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <button type="button" onClick={closeEdit} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm dark:border-white/10">
                Annuler
              </button>
              <button
                type="submit"
                disabled={updateProduct.isPending || uploadImages.isPending || !editForm.name}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {updateProduct.isPending || uploadImages.isPending ? "Enregistrement…" : "Enregistrer le produit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
