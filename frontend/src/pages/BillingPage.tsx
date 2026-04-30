import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { CheckCircle2, Download, FilePlus2 } from "lucide-react";

import { TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { money, shortDate } from "../utils/format";

export function BillingPage() {
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const [form, setForm] = useState({ customer_name: "", description: "", quantity: 1, unit_price: 0 });

  const create = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      setForm({ customer_name: "", description: "", quantity: 1, unit_price: 0 });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const markPaid = useMutation({
    mutationFn: (id: number) => api.updateInvoice(id, { status: "paid" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const [exportingId, setExportingId] = useState<number | null>(null);
  async function exportInvoice(id: number, number: string, format: "html" | "pdf" = "pdf") {
    setExportingId(id);
    try {
      const blob = await api.exportInvoice(id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facture-${number}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setExportingId(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({
      customer_name: form.customer_name,
      status: "sent",
      lines: [{ description: form.description, quantity: form.quantity, unit_price: form.unit_price }],
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Facturation et gestion commerciale</p>
        <h1 className="text-3xl font-black text-ink">Clients, factures et encaissements</h1>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Factures récentes">
          <div className="space-y-3">
            {invoices.data?.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                <div>
                  <p className="font-semibold text-ink">{invoice.number} · {invoice.customer_name}</p>
                  <p className="text-sm text-[#717182]">Échéance {shortDate(invoice.due_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={invoice.status === "paid" ? "Payée" : invoice.status === "sent" ? "Envoyée" : invoice.status} tone={invoice.status === "paid" ? "green" : "blue"} />
                  <p className="font-bold text-ink">{money(invoice.total_amount)}</p>
                  <button
                    onClick={() => exportInvoice(invoice.id, invoice.number)}
                    disabled={exportingId === invoice.id}
                    className="flex items-center gap-1 rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-bold text-[#17211f] hover:bg-stone-50 disabled:text-stone-400"
                  >
                    <Download size={13} />
                    {exportingId === invoice.id ? "…" : "PDF"}
                  </button>
                  {invoice.status !== "paid" && (
                    <button
                      onClick={() => markPaid.mutate(invoice.id)}
                      disabled={markPaid.isPending}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300"
                    >
                      <CheckCircle2 size={13} />
                      Marquer payée
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!invoices.data?.length && (
              <p className="py-6 text-center text-sm text-[#717182]">Aucune facture pour le moment.</p>
            )}
          </div>
        </Panel>

        <Panel title="Nouvelle facture">
          <form onSubmit={submit} className="space-y-3">
            <TextInput
              label="Client"
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              required
            />
            <TextInput
              label="Ligne de facturation"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Quantité"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
              <TextInput
                label="Prix unitaire (F CFA)"
                type="number"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
              />
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm font-semibold text-ink">
              Total : {money(form.quantity * form.unit_price)}
            </div>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:bg-stone-300"
            >
              <FilePlus2 size={18} />
              {create.isPending ? "Création…" : "Créer la facture"}
            </button>
            {create.error && (
              <p className="text-sm text-red-600">{create.error.message}</p>
            )}
          </form>
        </Panel>
      </div>
    </div>
  );
}
