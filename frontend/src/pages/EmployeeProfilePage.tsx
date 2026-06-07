/**
 * EmployeeProfilePage — Fiche individuelle d'un employé
 * Route: /employees/:id
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, DollarSign,
  Shield, User, FileText, Key, AlertTriangle, CheckCircle2,
  Clock, Calendar, CreditCard, RefreshCw, Download, Edit3,
  MoreHorizontal, ExternalLink
} from "lucide-react";
import { api } from "../services/api";
import type { Employee } from "../types/domain";
import { money, shortDate } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { useToast } from "../components/ToastProvider";

const formatCurrency = money;
const formatDate = shortDate;

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string, tr: TFunction) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: tr("empProfile.statusActive"), cls: "bg-emerald-100 text-emerald-700" },
    inactive: { label: tr("empProfile.statusInactive"), cls: "bg-stone-100 text-stone-600" },
    on_leave: { label: tr("empProfile.statusOnLeave"), cls: "bg-amber-100 text-amber-700" },
    suspended: { label: tr("empProfile.statusSuspended"), cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-stone-100 text-stone-600" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function accountBadge(status: string, tr: TFunction) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: tr("empProfile.accActive"), cls: "bg-emerald-100 text-emerald-700" },
    draft: { label: tr("empProfile.accDraft"), cls: "bg-stone-100 text-stone-500" },
    invited: { label: tr("empProfile.accInvited"), cls: "bg-blue-100 text-blue-700" },
    suspended: { label: tr("empProfile.accSuspended"), cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-stone-100 text-stone-600" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function roleLabel(role: string, tr: TFunction) {
  const map: Record<string, string> = {
    admin_entreprise: tr("empProfile.roleAdmin"),
    manager_entreprise: tr("empProfile.roleManager"),
    rh_entreprise: tr("empProfile.roleHr"),
    comptable: tr("empProfile.roleAccountant"),
    responsable_pos: tr("empProfile.rolePosManager"),
    caissier_pos: tr("empProfile.roleCashier"),
    employe: tr("empProfile.roleEmployee"),
  };
  return map[role] ?? role;
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/[0.04] last:border-0">
      {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-[#717182]" />}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <span className="shrink-0 text-sm text-[#717182]">{label}</span>
        <span className="min-w-0 break-words text-right text-sm font-medium text-[#17211f]">{value ?? "—"}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#717182]">{title}</h3>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════════════════════

export function EmployeeProfilePage() {
  const { t: tr } = useTranslation();
  useCurrency();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employeeId = Number(id);

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => api.employees().then((list) => list.find((e) => e.id === employeeId) ?? null),
    enabled: !isNaN(employeeId),
  });

  const resetAccess = useMutation({
    mutationFn: () => api.resetEmployeeAccess(employeeId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(
        tr("empProfile.accessReset", { login: result.login_identifier, pwd: result.temporary_password })
      );
    },
  });

  const downloadContract = async () => {
    try {
      const blob = await api.downloadEmployeeContract(employeeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrat_${employee?.last_name}_${employee?.first_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tr("empProfile.contractFail"));
    }
  };

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="font-semibold text-[#17211f]">{tr("empProfile.notFound")}</p>
        <p className="text-sm text-[#717182]">{tr("empProfile.notFoundDesc")}</p>
        <button onClick={() => navigate("/employees")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
          {tr("empProfile.backToList")}
        </button>
      </div>
    );
  }

  const fullName = `${employee.first_name} ${employee.last_name}`;
  const initials = `${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-full overflow-x-hidden space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#717182]">
        <button onClick={() => navigate("/employees")} className="flex items-center gap-1.5 hover:text-emerald-700 transition">
          <ArrowLeft size={14} />
          {tr("empProfile.breadcrumb")}
        </button>
        <span>/</span>
        <span className="text-[#17211f] font-medium">{fullName}</span>
      </div>

      {/* Hero card */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-[#071407] to-[#0f2a0f] p-6 text-white sm:flex-row sm:items-center">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-black text-white shadow-lg"
          style={{ backgroundColor: employee.badge_color || "#2563eb" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black">{fullName}</h1>
            {statusBadge(employee.status, tr)}
            {accountBadge(employee.account_status, tr)}
          </div>
          <p className="mt-0.5 text-sm text-white/70">{employee.job_title} · {employee.department} · {employee.branch}</p>
          <p className="text-xs text-white/50 mt-0.5">#{employee.id} · {employee.employment_type}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={downloadContract}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20 transition"
          >
            <Download size={14} /> {tr("empProfile.contract")}
          </button>
          <button
            onClick={() => resetAccess.mutate()}
            disabled={resetAccess.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-semibold hover:bg-amber-500 transition disabled:opacity-60"
          >
            <RefreshCw size={14} className={resetAccess.isPending ? "animate-spin" : ""} />
            {resetAccess.isPending ? tr("empProfile.inProgress") : tr("empProfile.resetAccess")}
          </button>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Left — 2 cols */}
        <div className="space-y-5 lg:col-span-2">

          {/* Identity */}
          <Section title={tr("empProfile.identityContact")}>
            <InfoRow label={tr("empProfile.firstName")} value={employee.first_name} icon={User} />
            <InfoRow label={tr("empProfile.lastName")} value={employee.last_name} />
            <InfoRow label={tr("empProfile.email")} value={
              <a href={`mailto:${employee.email}`} className="flex min-w-0 items-center gap-1 break-all text-emerald-600 hover:underline">
                {employee.email} <ExternalLink size={11} />
              </a>
            } icon={Mail} />
            <InfoRow label={tr("empProfile.phone")} value={employee.phone || tr("empProfile.notProvided")} icon={Phone} />
          </Section>

          {/* Employment */}
          <Section title={tr("empProfile.positionContract")}>
            <InfoRow label={tr("empProfile.jobTitle")} value={employee.job_title} icon={Briefcase} />
            <InfoRow label={tr("empProfile.contractType")} value={employee.employment_type} />
            <InfoRow label={tr("empProfile.department")} value={employee.department} icon={Building2} />
            <InfoRow label={tr("empProfile.site")} value={employee.branch} />
            <InfoRow label={tr("empProfile.manager")} value={employee.manager_name || tr("empProfile.notDefined")} />
            <InfoRow
              label={tr("empProfile.grossSalary")}
              value={employee.salary ? formatCurrency(employee.salary) : tr("empProfile.notProvided")}
              icon={DollarSign}
            />
          </Section>

          {/* Payout */}
          <Section title={tr("empProfile.payoutMode")}>
            <InfoRow label={tr("empProfile.method")} value={employee.payout_method || tr("empProfile.notDefined")} icon={CreditCard} />
            {employee.payout_method === "mobile_money" && (
              <InfoRow label={tr("empProfile.momoPhone")} value={employee.payout_phone || "—"} />
            )}
            {employee.payout_method === "bank" && (
              <>
                <InfoRow label={tr("empProfile.bank")} value={employee.payout_bank_name || "—"} />
                <InfoRow label={tr("empProfile.accountNumber")} value={employee.payout_account_number || "—"} />
              </>
            )}
            {employee.payout_method === "paypal" && (
              <InfoRow label={tr("empProfile.paypalEmail")} value={employee.payout_paypal_email || "—"} />
            )}
          </Section>
        </div>

        {/* Right — 1 col */}
        <div className="space-y-5">

          {/* Access */}
          <Section title={tr("empProfile.accessSecurity")}>
            <InfoRow label={tr("empProfile.roleLabel")} value={roleLabel(employee.access_role, tr)} icon={Shield} />
            <InfoRow label={tr("empProfile.scope")} value={employee.access_scope} />
            <InfoRow label={tr("empProfile.accountStatus")} value={accountBadge(employee.account_status, tr)} icon={Key} />
            <InfoRow
              label={tr("empProfile.lastLogin")}
              value={employee.last_login_at ? formatDate(employee.last_login_at) : tr("empProfile.never")}
              icon={Clock}
            />
            <InfoRow
              label={tr("empProfile.invitedOn")}
              value={employee.invited_at ? formatDate(employee.invited_at) : "—"}
              icon={Calendar}
            />
            <InfoRow
              label={tr("empProfile.activatedOn")}
              value={employee.activated_at ? formatDate(employee.activated_at) : "—"}
            />
          </Section>

          {/* Quick actions */}
          <Section title={tr("empProfile.quickActions")}>
            <div className="space-y-2">
              <Link
                to={`/documents?employee=${employeeId}`}
                className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-black/[0.02] transition"
              >
                <FileText size={15} className="text-[#717182]" />
                {tr("empProfile.viewDocuments")}
              </Link>
              <button
                onClick={downloadContract}
                className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-black/[0.02] transition"
              >
                <Download size={15} className="text-[#717182]" />
                {tr("empProfile.downloadContract")}
              </button>
              <button
                onClick={() => resetAccess.mutate()}
                disabled={resetAccess.isPending}
                className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 transition disabled:opacity-60"
              >
                <RefreshCw size={15} className={resetAccess.isPending ? "animate-spin" : ""} />
                {tr("empProfile.resetAccess")}
              </button>
            </div>
          </Section>

          {/* Meta */}
          <Section title={tr("empProfile.metadata")}>
            <InfoRow label={tr("empProfile.employeeId")} value={`#${employee.id}`} />
            <InfoRow label={tr("empProfile.createdOn")} value={formatDate(employee.created_at)} icon={Calendar} />
            {employee.user_id && (
              <InfoRow label={tr("empProfile.userId")} value={`#${employee.user_id}`} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
