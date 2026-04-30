import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { CreditCard, Minus, PackagePlus, Plus, Printer, QrCode, ScanLine, Search, ShoppingCart, Smartphone, Trash2, Wallet } from "lucide-react";

import { TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { money } from "../utils/format";
import type { Product } from "../types/domain";

const productForm = { name: "", sku: "", category: "General", price: 0, stock_quantity: 0, reorder_level: 5 };

type CartItem = {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
};

export function InventoryPosPage() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });
  const [form, setForm] = useState(productForm);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [receipt, setReceipt] = useState("");

  const createProduct = useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => {
      setForm(productForm);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });
  const qr = useMutation({ mutationFn: api.qrLabel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }) });
  const sale = useMutation({
    mutationFn: api.createSale,
    onSuccess: (data) => {
      setReceipt(`${data.receipt_number} - ${money(data.total_amount)}`);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    }
  });

  const categories = useMemo(() => ["Tous", ...Array.from(new Set((products.data ?? []).map((product) => product.category)))], [products.data]);
  const filteredProducts = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return (products.data ?? []).filter((product) => {
      const matchesSearch = !lowered || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(lowered);
      const matchesCategory = category === "Tous" || product.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, products.data, search]);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;

  function submitProduct(event: FormEvent) {
    event.preventDefault();
    createProduct.mutate(form);
  }

  function addToCart(product: Product) {
    if (product.stock_quantity <= 0) {
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product_id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock_quantity) } : item
        );
      }
      return [...current, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }

  function updateQuantity(productId: number, quantity: number) {
    setCart((current) => current.map((item) => item.product_id === productId ? { ...item, quantity } : item).filter((item) => item.quantity > 0));
  }

  function submitSale() {
    if (cart.length) {
      sale.mutate({ payment_method: paymentMethod, items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Inventaire, QR et caisse</p>
          <h1 className="text-3xl font-black text-ink">POS terrain et stock multi-sites</h1>
          <p className="mt-1 text-sm font-medium text-stone-500">Scan, panier, mobile money, QR produits et alertes de seuil.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">
          <ScanLine size={18} />
          Scanner
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Panel title="Catalogue produits">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <Search size={17} className="text-stone-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher produit, SKU, categorie..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700">
              <ScanLine size={18} />
            </button>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${category === item ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <article key={product.id} className="rounded-lg border border-stone-100 bg-white p-3 transition hover:border-emerald-500 hover:shadow-sm">
                <button onClick={() => addToCart(product)} className="w-full text-left">
                  <div className="grid aspect-video place-items-center rounded-lg bg-emerald-50 text-3xl font-black text-emerald-700">
                    {product.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="mt-3 font-bold text-ink">{product.name}</p>
                  <p className="text-xs font-medium text-stone-500">{product.sku} · {product.category}</p>
                  <p className="mt-2 font-black text-emerald-700">{money(product.price)}</p>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <StatusBadge label={`Stock ${product.stock_quantity}`} tone={product.stock_quantity <= product.reorder_level ? "amber" : "green"} />
                  <button onClick={() => qr.mutate(product.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700" title="Generer QR">
                    <Printer size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Panier POS">
            <div className="space-y-3">
              {cart.length ? cart.map((item) => (
                <article key={item.product_id} className="flex items-center gap-3 rounded-lg border border-stone-100 p-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-stone-100 text-xs font-bold text-stone-600">POS</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-stone-500">{money(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200">
                      <Minus size={13} />
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product_id, item.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200">
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => updateQuantity(item.product_id, 0)} className="text-stone-400 hover:text-red-600">
                    <Trash2 size={17} />
                  </button>
                </article>
              )) : (
                <div className="rounded-lg bg-stone-50 p-4 text-sm font-medium text-stone-500">Clique sur un produit pour l'ajouter au panier.</div>
              )}
            </div>
            <div className="mt-4 space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
              <div className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between text-stone-500"><span>TVA 18%</span><span>{money(tax)}</span></div>
              <div className="flex justify-between border-t border-stone-200 pt-2 text-lg font-black text-ink"><span>Total</span><span>{money(total)}</span></div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { key: "qr", label: "QR", icon: QrCode },
                { key: "mobile_money", label: "Mobile", icon: Smartphone },
                { key: "card", label: "Carte", icon: CreditCard },
                { key: "cash", label: "Cash", icon: Wallet }
              ].map((method) => (
                <button
                  key={method.key}
                  onClick={() => setPaymentMethod(method.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold ${
                    paymentMethod === method.key ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  <method.icon size={18} />
                  {method.label}
                </button>
              ))}
            </div>
            <button
              onClick={submitSale}
              disabled={!cart.length || sale.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 font-bold text-white disabled:bg-stone-300"
            >
              <ShoppingCart size={18} />
              Encaisser {total ? money(total) : ""}
            </button>
            {receipt ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{receipt}</p> : null}
            {sale.error ? <p className="mt-3 text-sm text-red-600">{sale.error.message}</p> : null}
          </Panel>

          <Panel title="Nouveau produit">
            <form onSubmit={submitProduct} className="space-y-3">
              <TextInput label="Nom" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="SKU" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
                <TextInput label="Categorie" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Prix" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
                <TextInput label="Stock" type="number" value={form.stock_quantity} onChange={(event) => setForm({ ...form, stock_quantity: Number(event.target.value) })} />
              </div>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">
                <PackagePlus size={18} />
                Creer avec QR
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
