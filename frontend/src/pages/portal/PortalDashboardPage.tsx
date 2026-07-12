import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Award, Check, Copy, Download, Eye, KeyRound, LogOut, Settings, Wallet, X } from "lucide-react";

import { usePortalAuth } from "../../contexts/PortalAuthContext";
import { PortalApiError, portalApi } from "../../services/portalApi";
import type {
  PortalCompany,
  PortalInvoice,
  PortalInvoiceDetail,
  PortalLoyaltyEntry,
  PortalPaymentInstructions,
} from "../../services/portalApi";

const TIER_KEY: Record<string, string> = {
  standard: "portal.loyaltyTierStandard",
  silver: "portal.loyaltyTierSilver",
  gold: "portal.loyaltyTierGold",
  vip: "portal.loyaltyTierVip",
};

const TIER_TONE: Record<string, string> = {
  standard: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
  silver: "bg-slate-200 text-slate-700 dark:bg-white/15 dark:text-white/80",
  gold: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  vip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

const TIER_STEPS: Record<string, number> = { standard: 0, silver: 500, gold: 2000, vip: 5000 };

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
  const [loyalty, setLoyalty] = useState<PortalLoyaltyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<PortalPaymentInstructions | null>(null);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<PortalInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (bootstrapping) return; // attend la restauration de session via le cookie
    if (!isAuthenticated) {
      navigate("/portal/login");
      return;
    }
    (async () => {
      try {
        const [c, inv, loy] = await Promise.all([
          portalApi.myCompany(),
          portalApi.myInvoices(),
          portalApi.loyaltyOverview().catch(() => []),
        ]);
        setCompany(c);
        setInvoices(inv);
        setLoyalty(loy);
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

  async function openDetail(invoice: PortalInvoice) {
    setDetailLoading(true);
    try {
      const full = await portalApi.invoiceDetail(invoice.id);
      setDetail(full);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleChangePassword() {
    setPasswordFeedback(null);
    setPasswordSaving(true);
    try {
      await portalApi.changePassword(currentPassword, newPassword);
      setPasswordFeedback({ ok: true, text: t("portal.changePasswordSuccess") });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      const msg = err instanceof PortalApiError ? err.message : t("portal.changePasswordError");
      setPasswordFeedback({ ok: false, text: msg });
    } finally {
      setPasswordSaving(false);
    }
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            title={t("portal.settings")}
            className="flex items-center gap-2 rounded-lg border border-black/10 p-2 text-sm font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
          >
            <LogOut size={14} /> <span className="hidden sm:inline">{t("portal.logout")}</span>
          </button>
        </div>
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

        {!loading && loyalty.length > 0 ? (
          <div className="mb-6">
            <h2 className="mb-1 text-base font-bold text-[#17211f] dark:text-white">{t("portal.loyaltyTitle")}</h2>
            <p className="mb-3 text-xs text-[#717182]">{t("portal.loyaltySubtitle")}</p>
            <div className="space-y-3">
              {loyalty.map((entry) => {
                const step = TIER_STEPS[entry.loyalty_tier] ?? 0;
                const nextStep = entry.next_tier ? TIER_STEPS[entry.next_tier] ?? step : step;
                const span = Math.max(nextStep - step, 1);
                const progress = entry.next_tier
                  ? Math.min(100, Math.max(0, ((entry.loyalty_points - step) / span) * 100))
                  : 100;
                return (
                  <div key={entry.company_id} className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#111a17]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#17211f] dark:text-white">{entry.company_name}</p>
                        <p className="mt-0.5 text-xs text-[#717182]">
                          {t("portal.loyaltyPoints", { count: entry.loyalty_points })}
                        </p>
                      </div>
                      <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TIER_TONE[entry.loyalty_tier] ?? TIER_TONE.standard}`}>
                        <Award size={12} /> {t(TIER_KEY[entry.loyalty_tier] ?? "portal.loyaltyTierStandard")}
                      </span>
                    </div>

                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-[#717182]">
                      {entry.next_tier && entry.points_to_next_tier != null
                        ? t("portal.loyaltyNextTier", {
                            points: entry.points_to_next_tier,
                            tier: t(TIER_KEY[entry.next_tier] ?? "portal.loyaltyTierStandard"),
                          })
                        : t("portal.loyaltyMaxTier")}
                    </p>

                    {entry.global_discount_percent > 0 ? (
                      <p className="mt-2 inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {t("portal.loyaltyDiscount", { percent: entry.global_discount_percent })}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

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
                      onClick={() => openDetail(inv)}
                      className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                    >
                      <Eye size={13} /> {t("portal.viewDetails")}
                    </button>
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

      {detail || detailLoading ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-[#111a17]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-[#17211f] dark:text-white">
                {t("portal.invoiceDetailTitle")} {detail ? `— ${detail.number}` : ""}
              </h3>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg p-1 text-[#717182] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading || !detail ? (
              <p className="text-sm text-[#717182]">{t("portal.loadingLines")}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wide text-[#717182] dark:border-white/10">
                        <th className="py-2 pr-2">{t("portal.lineDescription")}</th>
                        <th className="py-2 pr-2 text-right">{t("portal.lineQuantity")}</th>
                        <th className="py-2 pr-2 text-right">{t("portal.lineUnitPrice")}</th>
                        <th className="py-2 pr-2 text-right">{t("portal.lineTax")}</th>
                        <th className="py-2 text-right">{t("portal.lineTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id} className="border-b border-black/5 dark:border-white/5">
                          <td className="py-2 pr-2 text-[#17211f] dark:text-white">{line.description}</td>
                          <td className="py-2 pr-2 text-right text-[#17211f] dark:text-white">{line.quantity}</td>
                          <td className="py-2 pr-2 text-right text-[#17211f] dark:text-white">
                            {line.unit_price.toLocaleString()}
                          </td>
                          <td className="py-2 pr-2 text-right text-[#17211f] dark:text-white">{line.tax_rate}%</td>
                          <td className="py-2 text-right font-semibold text-[#17211f] dark:text-white">
                            {line.total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-between border-t border-black/10 pt-3 text-base font-black text-[#17211f] dark:border-white/10 dark:text-white">
                  <span>{t("portal.grandTotal")}</span>
                  <span>
                    {detail.total_amount.toLocaleString()} {detail.currency}
                  </span>
                </div>
              </>
            )}

            <button
              onClick={() => setDetail(null)}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("portal.close")}
            </button>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
          onClick={() => {
            setShowSettings(false);
            setShowChangePassword(false);
            setPasswordFeedback(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-[#111a17]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-[#17211f] dark:text-white">{t("portal.settings")}</h3>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setShowChangePassword(false);
                  setPasswordFeedback(null);
                }}
                className="rounded-lg p-1 text-[#717182] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {!showChangePassword ? (
              <button
                onClick={() => setShowChangePassword(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-[#17211f] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                <KeyRound size={15} /> {t("portal.changePassword")}
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#717182]">{t("portal.currentPassword")}</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#717182]">{t("portal.newPassword")}</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-[#717182]">{t("portal.newPasswordHint")}</p>
                </div>
                {passwordFeedback ? (
                  <p className={`text-xs font-semibold ${passwordFeedback.ok ? "text-emerald-600" : "text-red-600"}`}>
                    {passwordFeedback.text}
                  </p>
                ) : null}
                <button
                  onClick={handleChangePassword}
                  disabled={passwordSaving || !currentPassword || newPassword.length < 8}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {t("portal.changePasswordSubmit")}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
