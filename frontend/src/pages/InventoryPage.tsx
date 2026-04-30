import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle, ArrowDown, ArrowUp, Boxes, Camera, Check, Filter,
  MapPin, Plus, Printer, QrCode, RefreshCcw, Search, Sparkles, X,
} from "lucide-react";

import { api } from "../services/api";
import type { Product } from "../types/domain";
import { shortDate } from "../utils/format";
import { emojiSuggestions, inferProductEmoji } from "../utils/productVisuals";

function statusBadge(qty: number, threshold: number) {
  if (qty === 0) return { label: "Rupture", cls: "bg-rose-50 text-rose-700" };
  if (qty <= threshold) return { label: "Bas", cls: "bg-amber-50 text-amber-700" };
  return { label: "OK", cls: "bg-emerald-50 text-emerald-700" };
}

type Tab = "list" | "movements" | "labels" | "alerts";

const EMPTY_FORM = { name: "", sku: "", category: "Général", price: 0, stock_quantity: 0, reorder_level: 5 };
type EditableProductForm = Omit<typeof EMPTY_FORM, "sku"> & { brand: string; variant: string };
type ImagePreview = { file: File; url: string };

export function InventoryPage() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });
  const movements = useQuery({ queryKey: ["inventoryMovements"], queryFn: api.inventoryMovements });
  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
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
    return (products.data ?? []).filter((p) => {
      const matchSearch = !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q);
      const matchCat = category === "Tous" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products.data, search, category]);

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
    { key: "alerts", label: "Alertes IA", icon: AlertCircle },
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
          { label: "Valeur stock", value: `${(totalValue / 1_000_000).toFixed(1)} M`, hint: "prix de vente · XAF", accent: "indigo" },
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
                <button className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5">
                  <Filter size={14} /> Filtres
                </button>
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
                      <th className="py-2 pr-4">Produit</th>
                      <th className="py-2 pr-4 hidden sm:table-cell">SKU</th>
                      <th className="py-2 pr-4 hidden md:table-cell">Catégorie</th>
                      <th className="py-2 pr-4 hidden lg:table-cell">Site</th>
                      <th className="py-2 pr-4 text-right">Prix</th>
                      <th className="py-2 pr-4 text-right">Stock</th>
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
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 text-xl dark:from-emerald-500/10 dark:to-emerald-600/10">
                                {inferProductEmoji(p)}
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
                const color = isIn ? "emerald" : "rose";
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-black/[0.06] p-3 dark:border-white/[0.06]">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-${color}-50 text-${color}-600 dark:bg-${color}-500/15 dark:text-${color}-400`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#17211f] dark:text-white">{isIn ? "Entrée" : "Sortie"} — {m.reason || m.movement_type}</p>
                      <p className="text-xs text-[#717182]">{shortDate(m.created_at)} · Produit #{m.product_id}</p>
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
                      <p className="text-emerald-600">{p.price.toLocaleString("fr-FR")} XAF</p>
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
            <div className="space-y-2">
              {lowStock.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Check size={36} className="text-emerald-500" />
                  <p className="text-sm font-semibold text-[#717182]">Aucune alerte IA active — tout est nominal</p>
                </div>
              )}
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-lg border border-black/[0.06] p-3 dark:border-white/[0.06]">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${p.stock_quantity === 0 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                    <Sparkles size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#17211f] dark:text-white">
                      {p.name} · {p.stock_quantity === 0 ? "rupture totale" : `stock bas (${p.stock_quantity}/${p.reorder_level})`}
                    </p>
                    <p className="mt-0.5 text-xs text-[#717182]">
                      {p.stock_quantity === 0 ? "Commander immédiatement pour éviter une perte de vente" : `Seuil de réapprovisionnement atteint — commander ${Math.max(p.reorder_level * 2 - p.stock_quantity, 10)} unités`}
                    </p>
                  </div>
                  <button className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                    Agir
                  </button>
                </div>
              ))}
            </div>
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
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
            <span className="text-2xl">{inferProductEmoji(form)}</span>
            <span className="text-xs font-bold uppercase tracking-wide">icône suggérée</span>
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Panoplie rapide</span>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {emojiSuggestions(`${form.name} ${form.category}`, 18).map((option) => (
                <button
                  key={`${option.emoji}-${option.label}`}
                  type="button"
                  onClick={() => setForm((value) => ({ ...value, category: option.label }))}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10"
                  title={`Classer comme ${option.label}`}
                >
                  <span className="text-base">{option.emoji}</span>
                  {option.label}
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
                    <p className="text-xs text-[#717182]">{scanResult.stock_quantity} en stock · {scanResult.price.toLocaleString("fr-FR")} XAF</p>
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
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-violet-50 text-3xl dark:bg-violet-500/10">
                  {inferProductEmoji(editForm)}
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Emoji de catégorie</span>
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {emojiSuggestions(`${editForm.name} ${editForm.category}`, 14).map((option) => (
                      <button
                        key={`edit-${option.emoji}-${option.label}`}
                        type="button"
                        onClick={() => setEditForm((value) => ({ ...value, category: option.label }))}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10"
                      >
                        <span className="text-base">{option.emoji}</span>
                        {option.label}
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
