import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Boxes, Camera, Check, FileDown, Filter,
  MapPin, Plus, Printer, QrCode, RefreshCcw, Search, Trash2, Upload, X, FileText, Loader2,
} from "lucide-react";

import { api } from "../services/api";
import { LimuleIcon } from "../components/LimuleAvatar";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import type { Product } from "../types/domain";
import { shortDate, money, compactMoney, currencyLabel } from "../utils/format";
import { inferProductIcon, productIconLabel, productIconSuggestions } from "../utils/productIcons";
import { useCurrency } from "../contexts/CurrencyContext";
import i18n from "../i18n";

function ProductIconDisplay({ product, size = 22 }: { product: Pick<Product, "name" | "category">; size?: number }) {
  const entry = inferProductIcon(product);
  return (
    <span className={entry.color}>
      <entry.Icon size={size} />
    </span>
  );
}

function statusBadge(qty: number, threshold: number) {
  if (qty === 0) return { key: "statusOut", cls: "bg-rose-50 text-rose-700" };
  if (qty <= threshold) return { key: "statusLow", cls: "bg-amber-50 text-amber-700" };
  return { key: "statusOk", cls: "bg-emerald-50 text-emerald-700" };
}

type Tab = "list" | "movements" | "labels" | "alerts";

function AlertsTab({ lowStock, onRestock, restocking }: {
  lowStock: Product[];
  onRestock: (p: Product) => void;
  restocking: boolean;
}) {
  const { t: tr } = useTranslation();
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);

  function handleRestock(p: Product) {
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
        <p className="font-semibold text-[#17211f] dark:text-white">{tr("inventory.allNominal")}</p>
        <p className="text-sm text-[#717182]">{tr("inventory.noneBelow")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {tr("inventory.needAction", { count: lowStock.length })}
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
                  {p.stock_quantity === 0 ? tr("inventory.statusOut") : tr("inventory.stockLowRemaining", { count: p.stock_quantity })}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#717182]">
                {tr("inventory.thresholdLine", { threshold: p.reorder_level, sku: p.sku, price: money(p.price) })}
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {tr("inventory.recommendation", { qty: qtyToOrder, target: p.reorder_level * 2 })}
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
              {isDone ? tr("inventory.restockDone") : isRestocking ? tr("inventory.processing") : tr("inventory.restockUnits", { qty: qtyToOrder })}
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

const EMPTY_MOVEMENT = { product_id: 0, movement_type: "in" as "in" | "out", quantity: 1, reason: "", reference: "" };

export function InventoryPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
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
  const [createError, setCreateError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [scanError, setScanError] = useState("");
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<EditableProductForm>({
    name: "", category: "Général", brand: "KOMPTA", variant: "Standard",
    price: 0, stock_quantity: 0, reorder_level: 5,
  });
  const [editImagePreviews, setEditImagePreviews] = useState<ImagePreview[]>([]);

  // Movement modal state
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT);
  const [movementSuccess, setMovementSuccess] = useState("");
  const [movementError, setMovementError] = useState("");
  const [reportBusy, setReportBusy] = useState<"csv" | "pdf" | null>(null);
  const [aiReport, setAiReport] = useState<{ content: string; generated_at: string } | null>(null);
  const [aiReportOpen, setAiReportOpen] = useState(false);

  const downloadReport = async (format: "csv" | "pdf") => {
    setReportBusy(format);
    try {
      const res = await api.inventoryReport(format);
      if (!res.ok) throw new Error(tr("inventory.downloadFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_inventaire_${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tr("inventory.reportDownloaded"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReportBusy(null);
    }
  };

  const aiReportMutation = useMutation({
    mutationFn: api.inventoryReportAi,
    onSuccess: (data) => {
      setAiReport(data);
      setAiReportOpen(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createProduct = useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setCreateError("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => setCreateError(err.message),
  });
  const updateProduct = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Product> }) => api.updateProduct(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const deleteProduct = useMutation({
    mutationFn: api.deleteProduct,
    onSuccess: () => {
      closeEdit();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
  const importCsv = useMutation({
    mutationFn: api.importProductsCsv,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const suffix = result.errors.length ? tr("inventory.importErrors", { count: result.errors.length }) : "";
      toast.success(tr("inventory.importDone", { count: result.imported }) + suffix);
    },
  });
  const createMovement = useMutation({
    mutationFn: api.createMovement,
    onSuccess: (data) => {
      setMovementSuccess(tr("inventory.stockUpdated", { count: data.new_stock }));
      setMovementForm(EMPTY_MOVEMENT);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryMovements"] });
      setTimeout(() => setMovementOpen(false), 1500);
    },
    onError: (err: Error) => setMovementError(err.message),
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
    onSuccess: (product) => { setScanResult(product); setScanError(""); },
    onError: (error) => { setScanResult(null); setScanError(error instanceof Error ? error.message : tr("inventory.qrNotFound")); },
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
    setCreateError("");
    createProduct.mutate(form);
  }
  function openEdit(product: Product) {
    clearEditImages();
    setEditingProduct(product);
    setEditForm({
      name: product.name, category: product.category,
      brand: product.brand, variant: product.variant,
      price: product.price, stock_quantity: product.stock_quantity,
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
      return current.filter((_, i) => i !== index);
    });
  }
  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingProduct) return;
    await updateProduct.mutateAsync({ id: editingProduct.id, payload: editForm });
    if (editImagePreviews.length) {
      await uploadImages.mutateAsync({ id: editingProduct.id, files: editImagePreviews.map((p) => p.file) });
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
  function openMovementModal(productId?: number) {
    setMovementForm({ ...EMPTY_MOVEMENT, product_id: productId ?? 0 });
    setMovementSuccess("");
    setMovementError("");
    setMovementOpen(true);
  }
  function submitMovement(e: FormEvent) {
    e.preventDefault();
    setMovementError("");
    setMovementSuccess("");
    if (!movementForm.product_id) { setMovementError(tr("inventory.chooseProductErr")); return; }
    createMovement.mutate(movementForm);
  }

  const tabs: { key: Tab; label: string; icon: typeof Boxes }[] = [
    { key: "list", label: tr("inventory.tabCatalogue"), icon: Boxes },
    { key: "movements", label: tr("inventory.tabMovements"), icon: RefreshCcw },
    { key: "labels", label: tr("inventory.tabLabels"), icon: QrCode },
    { key: "alerts", label: `${tr("inventory.tabAlerts")}${lowStock.length ? ` (${lowStock.length})` : ""}`, icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#17211f] dark:text-white">{tr("inventory.title")}</h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {tr("inventory.subtitle", { count: products.data?.length ?? "…" })}
          </p>
        </div>
        {/* Actions — ligne principale sur mobile, alignée à droite sur desktop */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setScanOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5">
            <Camera size={15} /> {tr("inventory.scan")}
          </button>
          <button
            onClick={() => openMovementModal()}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
          >
            <RefreshCcw size={15} /> {tr("inventory.movement")}
          </button>
          <button
            onClick={() => downloadReport("pdf")}
            disabled={reportBusy !== null}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
          >
            {reportBusy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} {tr("inventory.reportPdf")}
          </button>
          <button
            onClick={() => downloadReport("csv")}
            disabled={reportBusy !== null}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
          >
            {reportBusy === "csv" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} {tr("inventory.reportCsv")}
          </button>
          <button
            onClick={() => aiReportMutation.mutate()}
            disabled={aiReportMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            {aiReportMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <LimuleIcon size={15} />} {tr("inventory.reportAi")}
          </button>
          {selected.length > 0 && (
            <button onClick={() => setTab("labels")} className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5">
              <QrCode size={15} /> QR ({selected.length})
            </button>
          )}
          {/* Secondary actions collapsible on mobile */}
          <button
            onClick={() => {
              const csv = tr("inventory.csvTemplateContent");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = tr("inventory.csvTemplateFilename"); a.click();
              URL.revokeObjectURL(url);
            }}
            className="hidden sm:flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-stone-50 dark:bg-white/5 dark:border-white/[0.08]"
          >
            <FileDown size={15} />
            <span className="hidden md:inline">{tr("inventory.csvTemplate")}</span>
            <span className="md:hidden">{tr("inventory.csvTemplateShort")}</span>
          </button>
          <label className="hidden sm:flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-stone-50 dark:bg-white/5 dark:text-white dark:border-white/[0.08]">
            <Upload size={15} />
            <span className="hidden md:inline">{tr("inventory.importCsv")}</span>
            <span className="md:hidden">{tr("inventory.importShort")}</span>
            <input type="file" accept=".csv" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv.mutate(file);
              e.target.value = "";
            }} />
          </label>
          <button
            data-tour="add-product"
            onClick={() => document.getElementById("add-product-form")?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={15} /> <span className="hidden sm:inline">{tr("inventory.newProduct")}</span><span className="sm:hidden">{tr("inventory.newShort")}</span>
          </button>
        </div>
        {/* Mobile-only: secondary actions row */}
        <div className="flex flex-wrap gap-2 sm:hidden">
          <button
            onClick={() => {
              const csv = tr("inventory.csvTemplateContent");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = tr("inventory.csvTemplateFilename"); a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#717182] dark:bg-white/5 dark:border-white/[0.08]"
          >
            <FileDown size={15} /> {tr("inventory.csvTemplate")}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] dark:bg-white/5 dark:text-white dark:border-white/[0.08]">
            <Upload size={15} /> {tr("inventory.importCsv")}
            <input type="file" accept=".csv" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv.mutate(file);
              e.target.value = "";
            }} />
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: tr("inventory.kpiStockValue"), value: compactMoney(totalValue), hint: tr("inventory.kpiStockValueHint"), accent: "indigo" },
          { label: tr("inventory.kpiRuptures"), value: ruptures.length.toString(), hint: tr("inventory.kpiRupturesHint"), accent: "rose" },
          { label: tr("inventory.kpiBelow"), value: lowStock.length.toString(), hint: tr("inventory.kpiBelowHint"), accent: "amber" },
          { label: tr("inventory.kpiRefs"), value: (products.data?.length ?? "…").toString(), hint: tr("inventory.kpiRefsHint"), accent: "sky" },
        ].map((k) => {
          const colors: Record<string, string> = {
            indigo: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
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
            {tr("inventory.lowStockBanner", { count: lowStock.length })}
          </p>
          <p className="truncate text-sm text-amber-600 dark:text-amber-400">
            {lowStock.map((p) => p.name).join(" · ")}
          </p>
        </div>
      )}

      {/* Main tabs card */}
      <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
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
                    placeholder={tr("inventory.searchPlaceholder")}
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
                  <Filter size={14} /> {tr("inventory.filters")}{stockFilter === "low" ? tr("inventory.filterLowSuffix") : stockFilter === "out" ? tr("inventory.filterOutSuffix") : ""}
                </button>
                {showFilters && (
                  <div className="flex gap-1.5 rounded-lg border border-black/[0.06] bg-white p-1.5 dark:border-white/[0.06] dark:bg-[#1e2229]">
                    {(["all", "low", "out"] as const).map((key) => (
                      <button key={key} onClick={() => setStockFilter(key)}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${stockFilter === key ? "bg-emerald-600 text-white" : "text-[#717182] hover:bg-stone-100 dark:hover:bg-white/10"}`}>
                        {key === "all" ? tr("inventory.filterAll") : key === "low" ? tr("inventory.filterLow") : tr("inventory.filterOut")}
                      </button>
                    ))}
                  </div>
                )}
                {selected.length > 0 && (
                  <button onClick={() => setTab("labels")} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                    <Printer size={14} /> {tr("inventory.labelsBtn", { count: selected.length })}
                  </button>
                )}
              </div>

              <div className="mb-4 flex gap-2 overflow-x-auto">
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      category === cat ? "bg-emerald-600 text-white" : "bg-[#ececf0] text-[#717182] hover:bg-[#e0e0ea] dark:bg-white/10 dark:text-white/60"
                    }`}>
                    {cat === "Tous" ? tr("inventory.filterAll") : cat}
                  </button>
                ))}
              </div>

              {products.isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#f0f0f5] dark:bg-white/10" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Boxes size={40} className="text-[#d1d5db]" />
                  <p className="font-semibold text-[#717182]">{tr("inventory.noProductFound")}</p>
                  <p className="text-sm text-[#9ca3af]">{tr("inventory.useFormBelow")}</p>
                  <button onClick={() => document.getElementById("add-product-form")?.scrollIntoView({ behavior: "smooth" })}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Plus size={15} /> {tr("inventory.createProductBtn")}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/[0.06] text-left text-xs font-semibold uppercase tracking-wide text-[#717182] dark:border-white/[0.06]">
                        <th className="w-10 py-2 pr-3">
                          <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} className="rounded" />
                        </th>
                        <th className="py-2 pr-4 cursor-pointer" onClick={() => toggleInvSort("name")}>
                          <span className="flex items-center">{tr("inventory.colProduct")}<InvSortIcon field="name" /></span>
                        </th>
                        <th className="py-2 pr-4 hidden sm:table-cell">SKU</th>
                        <th className="py-2 pr-4 hidden md:table-cell cursor-pointer" onClick={() => toggleInvSort("category")}>
                          <span className="flex items-center">{tr("inventory.colCategory")}<InvSortIcon field="category" /></span>
                        </th>
                        <th className="py-2 pr-4 hidden lg:table-cell">{tr("inventory.colSite")}</th>
                        <th className="py-2 pr-4 text-right cursor-pointer" onClick={() => toggleInvSort("price")}>
                          <span className="flex items-center justify-end">{tr("inventory.colPrice")}<InvSortIcon field="price" /></span>
                        </th>
                        <th className="py-2 pr-4 text-right cursor-pointer" onClick={() => toggleInvSort("stock")}>
                          <span className="flex items-center justify-end">{tr("inventory.colStock")}<InvSortIcon field="stock" /></span>
                        </th>
                        <th className="py-2 pr-4">{tr("inventory.colStatus")}</th>
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
                                      {tr("inventory.imagesCount", { count: p.images.length })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4 hidden sm:table-cell font-mono text-xs text-[#717182]">{p.sku}</td>
                            <td className="py-3 pr-4 hidden md:table-cell text-[#717182]">{p.category}</td>
                            <td className="py-3 pr-4 hidden lg:table-cell">
                              <span className="flex items-center gap-1 text-[#717182]"><MapPin size={12} />{tr("inventory.depot")}</span>
                            </td>
                            <td className="py-3 pr-4 text-right font-medium text-[#17211f] dark:text-white">{p.price.toLocaleString(i18n.language)}</td>
                            <td className="py-3 pr-4 text-right font-medium text-[#17211f] dark:text-white">{p.stock_quantity}</td>
                            <td className="py-3 pr-4">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{tr(`inventory.${badge.key}`)}</span>
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => openEdit(p)} className="rounded-md border border-black/[0.08] px-2.5 py-1.5 text-xs hover:bg-[#f5f5fa] dark:border-white/10">
                                  {tr("inventory.edit")}
                                </button>
                                <button onClick={() => { openMovementModal(p.id); }} className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2.5 py-1.5 text-xs hover:bg-[#f5f5fa] dark:border-white/10">
                                  <RefreshCcw size={11} /> {tr("inventory.mvt")}
                                </button>
                                <button onClick={() => openQr(p)} className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2.5 py-1.5 text-xs hover:bg-[#f5f5fa] dark:border-white/10">
                                  <QrCode size={12} /> QR
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
            </>
          )}

          {/* ── Mouvements ── */}
          {tab === "movements" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#717182]">{tr("inventory.movementsCount", { count: (movements.data ?? []).length })}</p>
                <button
                  onClick={() => openMovementModal()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus size={15} /> {tr("inventory.newMovement")}
                </button>
              </div>
              {movements.isLoading && <div className="h-32 animate-pulse rounded-lg bg-[#ececf0] dark:bg-white/10" />}
              {(movements.data ?? []).length === 0 && !movements.isLoading && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <RefreshCcw size={36} className="text-[#d1d5db]" />
                  <p className="font-semibold text-[#717182]">{tr("inventory.noMovement")}</p>
                  <p className="text-xs text-[#9ca3af]">{tr("inventory.recordInOut")}</p>
                  <button onClick={() => openMovementModal()} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Plus size={15} /> {tr("inventory.firstMovement")}
                  </button>
                </div>
              )}
              {(movements.data ?? []).map((m) => {
                const isIn = m.movement_type === "in";
                const Icon = isIn ? ArrowDown : ArrowUp;
                const productName = (products.data ?? []).find((p) => p.id === m.product_id)?.name ?? tr("inventory.productHash", { id: m.product_id });
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-black/[0.06] p-3 dark:border-white/[0.06]">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#17211f] dark:text-white">
                        {isIn ? tr("inventory.entry") : tr("inventory.exit")} — <span className="font-semibold">{productName}</span>
                        {m.reason ? ` · ${m.reason}` : ""}
                      </p>
                      <p className="text-xs text-[#717182]">{shortDate(m.created_at)}</p>
                    </div>
                    <span className={`text-sm font-semibold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                      {isIn ? "+" : "-"}{m.quantity} {tr("inventory.unit", { count: m.quantity })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Étiquettes QR ── */}
          {tab === "labels" && (
            <div className="text-center py-6">
              <QrCode size={40} className="mx-auto text-emerald-600 mb-3" />
              <h3 className="font-semibold text-[#17211f] dark:text-white">{tr("inventory.labelsTitle")}</h3>
              <p className="mt-1 text-sm text-[#717182] max-w-md mx-auto">
                {tr("inventory.labelsDesc")}
              </p>
              {selected.length > 0 ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-4xl mx-auto">
                    {(products.data ?? []).filter((p) => selected.includes(p.id)).map((p) => (
                      <div key={p.id} className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#c0c0d0] bg-white p-3 text-center text-xs dark:bg-white/5">
                        <QRCodeSVG value={p.qr_code || p.sku} size={104} level="M" includeMargin />
                        <p className="font-mono text-[10px] text-[#717182] truncate w-full">{p.sku}</p>
                        <p className="font-medium text-[#17211f] dark:text-white truncate w-full">{p.name}</p>
                        <p className="text-emerald-600">{money(p.price)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3 justify-center">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <Printer size={15} /> {tr("inventory.printLabels", { count: selected.length })}
                    </button>
                    <button onClick={() => setSelected([])} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10">
                      {tr("inventory.deselect")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-6 flex gap-3 justify-center">
                  <button onClick={() => setTab("list")} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10">
                    {tr("inventory.chooseFromCatalogue")}
                  </button>
                  {(products.data?.length ?? 0) > 0 && (
                    <button onClick={() => setSelected((products.data ?? []).map((p) => p.id))} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                      {tr("inventory.allProducts", { count: products.data?.length })}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Alertes ── */}
          {tab === "alerts" && (
            <AlertsTab lowStock={lowStock} onRestock={(p) => {
              const qty = Math.max(p.reorder_level * 2 - p.stock_quantity, 10);
              createMovement.mutate({
                product_id: p.id,
                movement_type: "in",
                quantity: qty,
                reason: tr("inventory.autoRestock"),
              });
            }} restocking={createMovement.isPending} />
          )}
        </div>
      </div>

      {/* Add product form */}
      <div id="add-product-form" className="rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#17211f] dark:text-white">{tr("inventory.newProduct")}</h3>
            <p className="mt-1 text-xs text-[#717182]">{tr("inventory.addFormHint")}</p>
          </div>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${inferProductIcon(form).bg} dark:bg-white/[0.06]`}>
            <ProductIconDisplay product={form} size={22} />
            <span className="text-xs font-bold uppercase tracking-wide text-[#17211f] dark:text-white">{tr("inventory.iconSuggested")}</span>
          </div>
        </div>
        {createError && (
          <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{createError}</div>
        )}
        {createProduct.isSuccess && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            {tr("inventory.productCreated")}
          </div>
        )}
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.quickIcon")}</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {productIconSuggestions(`${form.name} ${form.category}`, 20).map((entry) => (
                <button key={entry.key} type="button" onClick={() => setForm((v) => ({ ...v, category: entry.label }))}
                  title={productIconLabel(entry, tr)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold transition
                    ${form.category === entry.label ? `${entry.bg} ${entry.color} border-transparent` : "bg-white text-[#17211f] hover:border-violet-300 hover:bg-violet-50 dark:bg-white/5 dark:text-white dark:border-white/10 dark:hover:bg-violet-500/10"}`}
                >
                  <span className={form.category === entry.label ? entry.color : "text-[#717182]"}>
                    <entry.Icon size={13} />
                  </span>
                  {productIconLabel(entry, tr)}
                </button>
              ))}
            </div>
          </div>
          {[
            { label: tr("inventory.fieldName"), key: "name", placeholder: tr("inventory.phName") },
            { label: tr("inventory.fieldSku"), key: "sku", placeholder: tr("inventory.phSku") },
            { label: tr("inventory.fieldCategory"), key: "category", placeholder: tr("inventory.phCategory") },
          ].map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{f.label}</span>
              <input
                value={(form as Record<string, unknown>)[f.key] as string}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                required={f.key === "name" || f.key === "sku"}
                className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
          ))}
          {[
            { label: tr("inventory.fieldPrice", { cur: currencyLabel() }), key: "price" },
            { label: tr("inventory.fieldStockQty"), key: "stock_quantity" },
            { label: tr("inventory.fieldReorder"), key: "reorder_level" },
          ].map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{f.label}</span>
              <input
                type="number" min={0}
                value={(form as Record<string, unknown>)[f.key] as number}
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
              {createProduct.isPending ? tr("inventory.creating") : tr("inventory.createProduct")}
            </button>
          </div>
        </form>
      </div>

      {/* ── Movement modal ── */}
      {movementOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setMovementOpen(false)}>
          <form
            onSubmit={submitMovement}
            className="w-full max-w-md rounded-2xl border bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <RefreshCcw size={18} className="text-emerald-600" />
              <h3 className="flex-1 font-semibold text-[#17211f] dark:text-white">{tr("inventory.modalMovementTitle")}</h3>
              <button type="button" onClick={() => setMovementOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f5f5fa] dark:hover:bg-white/10">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {/* Product */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.fieldProduct")}</span>
                <select
                  value={movementForm.product_id || ""}
                  onChange={(e) => setMovementForm({ ...movementForm, product_id: Number(e.target.value) })}
                  required
                  className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value="">{tr("inventory.chooseProduct")}</option>
                  {(products.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{tr("inventory.optionStock", { name: p.name, count: p.stock_quantity })}</option>
                  ))}
                </select>
              </label>
              {/* Type */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.movementType")}</span>
                <div className="mt-2 flex gap-2">
                  {([["in", tr("inventory.typeIn")], ["out", tr("inventory.typeOut")]] as const).map(([val, label]) => (
                    <button
                      key={val} type="button"
                      onClick={() => setMovementForm({ ...movementForm, movement_type: val })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        movementForm.movement_type === val
                          ? val === "in" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                        : "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          : "border-black/[0.08] dark:border-white/10 hover:bg-[#f5f5fa] dark:hover:bg-white/5"
                      }`}
                    >
                      {val === "in" ? "↓ " : "↑ "}{label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Quantity */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.fieldQuantity")}</span>
                <input
                  type="number" min={1} required
                  value={movementForm.quantity}
                  onChange={(e) => setMovementForm({ ...movementForm, quantity: Math.max(1, Number(e.target.value)) })}
                  className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>
              {/* Reason */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.fieldReason")}</span>
                <input
                  type="text"
                  value={movementForm.reason}
                  onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                  placeholder={tr("inventory.phReason")}
                  className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>
              {movementError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{movementError}</p>}
              {movementSuccess && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">✓ {movementSuccess}</p>}
            </div>
            <div className="flex gap-2 border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <button type="button" onClick={() => setMovementOpen(false)} className="flex-1 rounded-lg border border-black/[0.08] py-2 text-sm dark:border-white/10">
                {tr("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMovement.isPending || !movementForm.product_id}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  movementForm.movement_type === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {createMovement.isPending ? tr("common.saving") : (movementForm.movement_type === "in" ? tr("inventory.saveEntry") : tr("inventory.saveExit"))}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Scanner modal ── */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setScanOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <Camera size={18} className="text-emerald-600" />
              <h3 className="flex-1 font-semibold text-[#17211f] dark:text-white">{tr("inventory.scanTitle")}</h3>
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
                    {tr("inventory.scanPoint")}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <form onSubmit={submitScan} className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.qrOrSku")}</span>
                  <input
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder={tr("inventory.phScan")}
                    className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <button disabled={scanQr.isPending || !scanInput.trim()} className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {scanQr.isPending ? tr("inventory.scanning") : tr("inventory.scanThis")}
                </button>
              </form>
              {scanResult && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <Check size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#17211f] dark:text-white">{scanResult.name} — {scanResult.sku}</p>
                    <p className="text-xs text-[#717182]">{tr("inventory.inStockShort", { count: scanResult.stock_quantity, price: money(scanResult.price) })}</p>
                  </div>
                </div>
              )}
              {scanError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{scanError}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-black/[0.08] py-2 text-sm dark:border-white/10 hover:bg-[#f5f5fa]"
                  onClick={() => { setScanInput(""); setScanResult(null); setScanError(""); }}
                >
                  {tr("inventory.newScan")}
                </button>
                <button
                  type="button"
                  disabled={!scanResult}
                  className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  onClick={() => {
                    if (scanResult) { openEdit(scanResult); setScanOpen(false); }
                  }}
                >
                  {tr("inventory.editProduct")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Product modal ── */}
      {qrProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setQrProduct(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-white p-5 text-center shadow-2xl dark:border-white/10 dark:bg-[#1e2229]" onClick={(e) => e.stopPropagation()}>
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
                {tr("common.close")}
              </button>
              <button onClick={() => window.print()} className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">
                {tr("inventory.print")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Product modal ── */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={closeEdit}>
          <form
            onSubmit={submitEdit}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`grid h-12 w-12 place-items-center rounded-xl ${inferProductIcon(editForm).bg} dark:bg-white/10`}>
                  <ProductIconDisplay product={editForm} size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#17211f] dark:text-white">{tr("inventory.editProduct")}</h3>
                  <p className="text-xs text-[#717182]">{editingProduct.sku}</p>
                </div>
              </div>
              <button type="button" onClick={closeEdit} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f5f5fa] dark:hover:bg-white/10">
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: tr("inventory.editFieldName"), key: "name" },
                  { label: tr("inventory.fieldCategory"), key: "category" },
                  { label: tr("inventory.editFieldBrand"), key: "brand" },
                  { label: tr("inventory.editFieldVariant"), key: "variant" },
                ].map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{field.label}</span>
                    <input
                      value={(editForm as Record<string, unknown>)[field.key] as string}
                      onChange={(e) => setEditForm((v) => ({ ...v, [field.key]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </label>
                ))}
                {[
                  { label: "", key: "price", lk: "inventory.colPrice" },
                  { label: "", key: "stock_quantity", lk: "inventory.editFieldStock" },
                  { label: "", key: "reorder_level", lk: "inventory.editFieldAlert" },
                ].map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr((field as any).lk)}</span>
                    <input
                      type="number" min={0}
                      value={(editForm as Record<string, unknown>)[field.key] as number}
                      onChange={(e) => setEditForm((v) => ({ ...v, [field.key]: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{tr("inventory.categoryIcon")}</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {productIconSuggestions(`${editForm.name} ${editForm.category}`, 16).map((entry) => (
                      <button key={`edit-${entry.key}`} type="button"
                        onClick={() => setEditForm((v) => ({ ...v, category: entry.label }))} title={productIconLabel(entry, tr)}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold transition
                          ${editForm.category === entry.label ? `${entry.bg} ${entry.color} border-transparent` : "bg-white text-[#17211f] hover:border-violet-300 hover:bg-violet-50 dark:bg-white/5 dark:text-white dark:border-white/10 dark:hover:bg-violet-500/10"}`}
                      >
                        <span className={editForm.category === entry.label ? entry.color : "text-[#717182]"}>
                          <entry.Icon size={13} />
                        </span>
                        {productIconLabel(entry, tr)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-black/[0.08] bg-[#f8f8fc] p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#17211f] dark:text-white">{tr("inventory.productImages")}</p>
                      <p className="text-xs text-[#717182]">{tr("inventory.imagesHint")}</p>
                    </div>
                    <label className="cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
                      {tr("common.add")}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleEditImages} />
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(editingProduct.images ?? []).map((image) => (
                      <div key={image.id} className="rounded-lg border border-black/[0.06] bg-white p-2 text-xs dark:border-white/10 dark:bg-[#252931]">
                        <div className="grid aspect-square place-items-center rounded-md bg-violet-50 text-2xl dark:bg-violet-500/10">🖼️</div>
                        <p className="mt-1 truncate font-semibold text-[#17211f] dark:text-white">{image.filename}</p>
                        <p className="text-[10px] text-[#717182]">{image.is_primary ? tr("inventory.primary") : tr("inventory.gallery")}</p>
                      </div>
                    ))}
                    {editImagePreviews.map((preview, index) => (
                      <div key={preview.url} className="relative overflow-hidden rounded-lg border border-violet-200 bg-white p-1 dark:border-violet-500/30 dark:bg-[#252931]">
                        <img src={preview.url} alt={preview.file.name} className="aspect-square w-full rounded-md object-cover" />
                        <button type="button" onClick={() => removeEditImage(index)} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-950/70 text-white">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {!editingProduct.images?.length && !editImagePreviews.length && (
                      <div className="col-span-2 rounded-lg border border-dashed border-black/[0.12] p-5 text-center text-xs text-[#717182] dark:border-white/15">
                        {tr("inventory.noImageYet")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              {/* Delete button */}
              <button
                type="button"
                disabled={deleteProduct.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: tr("inventory.deleteTitle", { name: editingProduct.name }),
                    message: tr("inventory.deleteMsg"),
                    confirmLabel: tr("common.delete"),
                    danger: true,
                  });
                  if (ok) deleteProduct.mutate(editingProduct.id);
                }}
                className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
              >
                <Trash2 size={14} />
                {deleteProduct.isPending ? tr("inventory.deleting") : tr("common.delete")}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={closeEdit} className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm dark:border-white/10">
                  {tr("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={updateProduct.isPending || uploadImages.isPending || !editForm.name}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {updateProduct.isPending || uploadImages.isPending ? tr("common.saving") : tr("common.save")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {aiReportOpen && aiReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAiReportOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-[#1a1f1e]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <LimuleIcon size={18} className="text-emerald-600" />
                <h2 className="text-lg font-semibold text-[#17211f] dark:text-white">{tr("inventory.aiReportTitle")}</h2>
              </div>
              <button onClick={() => setAiReportOpen(false)} className="rounded-lg p-1 hover:bg-black/[0.04] dark:hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-xs text-[#717182]">
                {tr("inventory.aiGeneratedAt", { date: new Date(aiReport.generated_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) })}
              </p>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#17211f] dark:text-white/90">
                {aiReport.content}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/[0.06] px-5 py-3 dark:border-white/[0.06]">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(aiReport.content);
                  toast.success(tr("common.copied"));
                }}
                className="rounded-lg border border-black/[0.08] bg-white px-4 py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
              >
                {tr("common.copy")}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([aiReport.content], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `rapport_ia_inventaire_${new Date().toISOString().slice(0, 10)}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {tr("common.download")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
