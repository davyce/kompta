import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Download, LogOut, Wallet } from "lucide-react";

import { usePortalAuth } from "../../contexts/PortalAuthContext";
import {
  portalApi,
  type PortalCompany,
  type PortalInvoice,
  type PortalPaymentInstructions,
} from "../../services/portalApi";

const STATUS_KEY: Record<string, string> = {
  draft: "portal.statusDraft",
  sent: "portal.statusSent",
  paid: "portal.statusPaid",
  overdue: "portal.statusOverdue",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
};

export function PortalDashboardPage() {
  const { t } = useTranslation();
  const { token, clientName, logout } = usePortalAuth();
  const navigate = useNavigate();

  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<PortalPaymentInstructions | null>(null);
  const [requesting, setRequesting] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      navigate("/portal/login");
      return;
    }
    (async () => {
      try {
        const [c, inv] = await Promise.all([portalApi.myCompany(), portalApi.myInvoices()]);
        setCompany(c);
        setInvoices(inv);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, navigate]);

  async function handleDownload(invoice: PortalInvoice) {
    await portalApi.downloadInvoicePdf(invoice.id, `facture-${invoice.number}.pdf`);
  }

  async function handleRequestPayment(invoice: PortalInvoice) {
    setRequesting(invoice.id);
    try {
      const result = await portalApi.requestPayment(invoice.id);
      setInstructions(result);
      const refreshed = await portalApi.myInvoices();
      setInvoices(refreshed);
    } finally {
      setRequesting(null);
    }
  }

  function handleLogout() {
    logout();
    navigate("/portal/login");
  }

  return (
    <div className="min-h-dvh bg-[#f5f7fb] dark:bg-[#0b1210]">
      <header className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-4 dark:border-white/10 dark:bg-[#111a17]">
        <div>
          <p className="text-sm font-semibold text-[#717182] dark:text-white/60">{company?.name ?? "..."}</p>
          <h1 className="text-lg font-bold text-[#17211f] dark:text-white">{clientName ?? ""}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
        >
          <LogOut size={14} /> {t("portal.logout")}
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="mb-4 text-base font-bold text-[#17211f] dark:text-white">{t("portal.invoicesTitle")}</h2>

        {loading ? (
          <p className="text-sm text-[#717182]">…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-[#717182]">{t("portal.noInvoices")}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-[#111a17]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs font-semibold uppercase text-[#717182] dark:border-white/10">
                  <th className="px-4 py-3">{t("portal.invoiceNumber")}</th>
                  <th className="px-4 py-3">{t("portal.amount")}</th>
                  <th className="px-4 py-3">{t("portal.dueDate")}</th>
                  <th className="px-4 py-3">{t("portal.status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                    <td className="px-4 py-3 font-medium text-[#17211f] dark:text-white">{inv.number}</td>
                    <td className="px-4 py-3">
                      {inv.total_amount.toLocaleString()} {inv.currency}
                    </td>
                    <td className="px-4 py-3 text-[#717182]">{inv.due_date ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_TONE[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {t(STATUS_KEY[inv.status] ?? "portal.statusDraft")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(inv)}
                          className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                        >
                          <Download size={13} /> {t("portal.downloadPdf")}
                        </button>
                        {inv.status !== "paid" ? (
                          <button
                            onClick={() => handleRequestPayment(inv)}
                            disabled={requesting === inv.id}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <Wallet size={13} />
                            {inv.payment_requested_at ? t("portal.paymentRequested") : t("portal.requestPayment")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {instructions ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setInstructions(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#111a17]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#17211f] dark:text-white">{t("portal.paymentInstructionsTitle")}</h3>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#717182]">{t("portal.paymentReference")}</dt>
                <dd className="font-semibold text-[#17211f] dark:text-white">{instructions.reference}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#717182]">{t("portal.amount")}</dt>
                <dd className="font-semibold text-[#17211f] dark:text-white">
                  {instructions.amount.toLocaleString()} {instructions.currency}
                </dd>
              </div>
              {instructions.provider ? (
                <div className="flex justify-between">
                  <dt className="text-[#717182]">{t("portal.paymentProvider")}</dt>
                  <dd className="font-semibold text-[#17211f] dark:text-white">{instructions.provider}</dd>
                </div>
              ) : null}
              {instructions.phone_number ? (
                <div className="flex justify-between">
                  <dt className="text-[#717182]">{t("portal.paymentPhone")}</dt>
                  <dd className="font-semibold text-[#17211f] dark:text-white">{instructions.phone_number}</dd>
                </div>
              ) : null}
              {instructions.account_name ? (
                <div className="flex justify-between">
                  <dt className="text-[#717182]">{t("portal.paymentAccountName")}</dt>
                  <dd className="font-semibold text-[#17211f] dark:text-white">{instructions.account_name}</dd>
                </div>
              ) : null}
              {instructions.instructions ? (
                <p className="mt-2 rounded-lg bg-black/5 p-3 text-xs text-[#17211f] dark:bg-white/5 dark:text-white/80">
                  {instructions.instructions}
                </p>
              ) : null}
            </dl>
            <button
              onClick={() => setInstructions(null)}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("portal.paymentInstructionsClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
