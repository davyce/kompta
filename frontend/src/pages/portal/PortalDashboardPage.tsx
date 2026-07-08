import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Download, LogOut, Wallet } from "lucide-react";

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
  draft: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
  sent: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function isOverdue(inv: PortalInvoice): boolean {
  if (inv.status === "paid" || !inv.due_date) return false;
  return new Date(inv.due_date).getTime() < Date.now();
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function PortalDashboardPage() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, bootstrapping, clientName, logout } = usePortalAuth();
  const navigate = useNavigate();

  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<PortalPaymentInstructions | null>(null);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (bootstrapping) return; // attend la restauration de session via le cookie
    if (!isAuthenticated) {
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
  }, [isAuthenticated, bootstrapping, navigate]);

  const { outstandingTotal, outstandingCount, nextDue, currency } = useMemo(() => {
    const unpaid = invoices.filter((inv) => inv.status !== "paid");
    const total = unpaid.reduce((sum, inv) => sum + inv.total_amount, 0);
    const withDue = unpaid.filter((inv) => inv.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
    return {
      outstandingTotal: total,
      outstandingCount: unpaid.length,
      nextDue: withDue[0]?.due_date ?? null,
      currency: unpaid[0]?.currency ?? invoices[0]?.currency ?? "XAF",
    };
  }, [invoices]);

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

  async function copyReference(ref: string) {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f7fb] dark:bg-[#0b1210]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 dark:border-white/10 dark:bg-[#111a17]/90">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#717182] dark:text-white/60">{company?.name ?? "…"}</p>
          <h1 className="truncate text-lg font-bold text-[#17211f] dark:text-white">
            {clientName ? t("portal.welcomeBack", { name: clientName }) : ""}
          </h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
        >
          <LogOut size={14} /> <span className="hidden sm:inline">{t("portal.logout")}</span>
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {/* ── Summary ── */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#111a17]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{t("portal.outstandingTotal")}</p>
            <p className="mt-1 text-xl font-black text-[#17211f] dark:text-white">
              {outstandingTotal > 0 ? `${outstandingTotal.toLocaleString()} ${currency}` : "0"}
            </p>
            <p className="mt-0.5 text-xs text-[#717182]">
              {outstandingCount > 0 ? t("portal.outstandingCount", { count: outstandingCount }) : t("portal.nothingDue")}
            </p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#111a17]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{t("portal.nextDue")}</p>
            <p className="mt-1 text-xl font-black text-[#17211f] dark:text-white">
              {nextDue ? formatDate(nextDue, i18n.language) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-[#717182]">{nextDue ? "" : t("portal.allSettled")}</p>
          </div>
        </div>

        <h2 className="mb-3 text-base font-bold text-[#17211f] dark:text-white">{t("portal.invoicesTitle")}</h2>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center dark:border-white/10 dark:bg-[#111a17]">
            <p className="text-sm font-semibold text-[#17211f] dark:text-white">{t("portal.noInvoices")}</p>
            <p className="mt-1 text-xs text-[#717182]">{t("portal.emptyStateHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const overdue = isOverdue(inv);
              const statusKey = overdue ? "overdue" : inv.status;
              return (
                <div
                  key={inv.id}
                  className={`rounded-2xl border bg-white p-4 dark:bg-[#111a17] ${
                    overdue ? "border-red-200 dark:border-red-500/30" : "border-black/5 dark:border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[#17211f] dark:text-white">{inv.number}</p>
                      <p className="mt-0.5 text-xs text-[#717182]">
                        {inv.due_date ? t("portal.dueOn", { date: formatDate(inv.due_date, i18n.language) }) : t("portal.noDueDate")}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[statusKey] ?? STATUS_TONE.draft}`}>
                      {t(STATUS_KEY[statusKey] ?? "portal.statusDraft")}
                    </span>
                  </div>

                  <p className="mt-3 text-2xl font-black text-[#17211f] dark:text-white">
                    {inv.total_amount.toLocaleString()} <span className="text-sm font-semibold text-[#717182]">{inv.currency}</span>
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleDownload(inv)}
                      className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                    >
                      <Download size={13} /> {t("portal.downloadPdf")}
                    </button>
                    {inv.status !== "paid" ? (
                      <button
                        onClick={() => handleRequestPayment(inv)}
                        disabled={requesting === inv.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Wallet size={13} />
                        {requesting === inv.id
                          ? t("portal.requestingPayment")
                          : inv.payment_requested_at
                          ? t("portal.paymentRequested")
                          : t("portal.requestPayment")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {instructions ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={() => setInstructions(null)}>
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-[#111a17]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#17211f] dark:text-white">{t("portal.paymentInstructionsTitle")}</h3>
            <p className="mt-1 text-xs text-[#717182]">{t("portal.paymentInstructionsIntro")}</p>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/5">
                <div className="min-w-0">
                  <dt className="text-xs text-[#717182]">{t("portal.paymentReference")}</dt>
                  <dd className="truncate font-semibold text-[#17211f] dark:text-white">{instructions.reference}</dd>
                </div>
                <button
                  onClick={() => copyReference(instructions.reference)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-black/10 px-2 py-1.5 text-xs font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? t("portal.copied") : t("portal.copyReference")}
                </button>
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
