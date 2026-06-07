import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  Clipboard,
  Download,
  KeyRound,
  Search,
  ShieldCheck,
  ShieldOff,
  User,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../services/api";
import { useConfirm } from "../../components/ConfirmProvider";

// ── Types ──────────────────────────────────────────────────────────────────────

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  branch: string;
  account_status: string;
  must_change_password: boolean;
  company_id: number;
  company_name: string;
  last_login_at: string | null;
  created_at: string | null;
};

// ── Impersonate modal ─────────────────────────────────────────────────────────

function ImpersonateModal({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const { t: tr } = useTranslation();
  const [result, setResult] = useState<{ token: string; user_email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imp = useMutation({
    mutationFn: () => api.adminImpersonate(userId),
    onSuccess: (data) => setResult(data),
    onError: (e) => setError(e instanceof Error ? e.message : tr("admin.users.errors.generic")),
  });

  function copyToken() {
    if (!result) return;
    navigator.clipboard.writeText(result.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-600/20 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Impersonation</h2>
            <p className="text-xs text-white/50">{userName}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 text-white/60">
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-indigo-600/30 bg-indigo-600/10 p-3">
              <p className="text-xs font-bold text-indigo-200">
                {tr("admin.users.impersonateWarning")}
              </p>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
                {tr("common.cancel")}
              </button>
              <button
                onClick={() => imp.mutate()}
                disabled={imp.isPending}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50 transition"
              >
                {imp.isPending ? tr("admin.users.generating") : tr("admin.users.generateToken")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-emerald-300 font-bold">{tr("admin.users.tokenGeneratedFor", { email: result.user_email })}</p>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="break-all font-mono text-xs text-white/70">{result.token}</p>
            </div>
            <button
              onClick={copyToken}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-600 transition"
            >
              <Clipboard size={14} />
              {copied ? tr("admin.users.copiedBang") : tr("admin.users.copyToClipboard")}
            </button>
            <p className="text-[10px] text-white/40">
              {tr("admin.users.tokenUsageHint")}
            </p>
            <button onClick={onClose} className="w-full rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
              {tr("common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reset password modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ userId, userName, onClose, onReset }: { userId: number; userName: string; onClose: () => void; onReset: () => void }) {
  const { t: tr } = useTranslation();
  const [result, setResult] = useState<{ temp_password: string; message?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.adminResetPassword(userId),
    onSuccess: (data) => {
      setResult(data);
      onReset();
    },
    onError: (e) => setError(e instanceof Error ? e.message : tr("admin.users.errors.generic")),
  });

  function copyPwd() {
    if (!result) return;
    navigator.clipboard.writeText(result.temp_password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{tr("admin.users.resetPassword")}</h2>
            <p className="text-xs text-slate-500 dark:text-white/50">{userName}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-white/70">
              {tr("admin.users.resetPasswordDescription")}
            </p>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 transition">
                {tr("common.cancel")}
              </button>
              <button
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {reset.isPending ? tr("admin.users.resetting") : tr("admin.users.reset")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">✓ {tr("admin.users.tempPasswordGenerated")}</p>
              <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                {tr("admin.users.sessionsRevoked")}
              </p>
            </div>
            {/* Read-only input: reliable copy-paste, no typographic transformation. */}
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
                {tr("admin.users.temporaryPassword")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.temp_password}
                  onClick={(e) => { (e.target as HTMLInputElement).select(); copyPwd(); }}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontVariantLigatures: "none", letterSpacing: "0.5px" }}
                  className="flex-1 cursor-pointer select-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
                <button
                  onClick={copyPwd}
                  title={tr("common.copy")}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 transition"
                >
                  <Clipboard size={15} className="text-white" />
                </button>
              </div>
              {copied && <p className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ {tr("common.copied")}</p>}
            </div>
            <p className="rounded-lg border border-indigo-200 bg-amber-50 px-3 py-2 text-[11px] text-indigo-700 dark:border-indigo-600/20 dark:bg-indigo-600/10 dark:text-indigo-300">
              ⚠️ {tr("admin.users.passwordDashWarning")}
            </p>
            <button onClick={onClose} className="w-full rounded-lg border border-slate-200 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 transition">
              {tr("common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(users: AdminUser[], tr: TFunction) {
  const headers = [
    "ID",
    tr("common.name"),
    "Email",
    tr("admin.users.role"),
    tr("admin.subscriptions.company"),
    tr("admin.users.department"),
    tr("admin.users.branch"),
    tr("common.status"),
    tr("admin.users.lastLogin"),
    tr("admin.companies.createdAt"),
  ];
  const rows = users.map((u) => [
    u.id, u.full_name, u.email, u.role, u.company_name,
    u.department, u.branch, u.account_status,
    u.last_login_at ?? "", u.created_at ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kompta_users.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(dateStr: string | null, tr: TFunction) {
  if (!dateStr) return tr("admin.users.never");
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return tr("admin.dashboard.now");
  if (m < 60) return tr("admin.dashboard.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tr("admin.dashboard.hoursAgo", { count: h });
  return tr("admin.dashboard.daysAgo", { count: Math.floor(h / 24) });
}

function accountStatusLabel(status: string, tr: TFunction) {
  if (status === "active") return tr("admin.subscriptions.status.active");
  if (status === "suspended") return tr("admin.subscriptions.status.suspendedUpper");
  return status;
}

function roleLabel(role: string, tr: TFunction) {
  return tr(`roles.${role}`, { defaultValue: role });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [impersonateTarget, setImpersonateTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  const users = useQuery({
    queryKey: ["adminUsers", search, companyFilter],
    queryFn: () => api.adminUsers({
      search: search || undefined,
      company_id: companyFilter ? Number(companyFilter) : undefined,
    }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminUpdateUserStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminUsers"] }),
  });

  const { confirm, confirmWithReason } = useConfirm();

  async function askToggleStatus(user: AdminUser) {
    if (user.account_status === "active") {
      const { confirmed, reason } = await confirmWithReason({
        title: tr("admin.users.confirmSuspendTitle", { name: user.full_name }),
        message: tr("admin.users.confirmSuspendMessage"),
        confirmLabel: tr("admin.subscriptions.suspend"),
        danger: true,
        reasonLabel: tr("admin.users.suspensionReason"),
      });
      if (!confirmed) return;
      void reason; // motif journalisé côté audit serveur via l'action
      updateStatus.mutate({ id: user.id, status: "suspended" });
    } else {
      updateStatus.mutate({ id: user.id, status: "active" });
    }
  }

  async function askImpersonate(user: AdminUser) {
    const ok = await confirm({
      title: tr("admin.users.confirmImpersonateTitle", { name: user.full_name }),
      message: tr("admin.users.confirmImpersonateMessage"),
      confirmLabel: tr("admin.users.impersonate"),
      requireAcknowledge: tr("admin.users.impersonateAcknowledge"),
    });
    if (ok) setImpersonateTarget(user);
  }

  // Filter + sort client-side
  const filtered = useMemo(() => {
    return (users.data ?? []).filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.account_status !== statusFilter) return false;
      return true;
    });
  }, [users.data, roleFilter, statusFilter]);

  // Unique companies for dropdown
  const companies = useMemo(() => {
    const map = new Map<number, string>();
    (users.data ?? []).forEach((u) => map.set(u.company_id, u.company_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [users.data]);

  const roles = useMemo(() => {
    const all = new Set((users.data ?? []).map((u) => u.role));
    return Array.from(all).sort();
  }, [users.data]);

  return (
    <div className="space-y-6">
      {impersonateTarget && (
        <ImpersonateModal
          userId={impersonateTarget.id}
          userName={impersonateTarget.full_name}
          onClose={() => setImpersonateTarget(null)}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          userId={resetTarget.id}
          userName={resetTarget.full_name}
          onClose={() => setResetTarget(null)}
          onReset={() => queryClient.invalidateQueries({ queryKey: ["adminUsers"] })}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">IAM</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{tr("admin.users.title")}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">{tr("admin.users.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-2xl font-black text-slate-900 dark:text-white">{filtered.length}</p>
            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/40">{tr("admin.users.accounts")}</p>
          </div>
          <button
            onClick={() => exportCsv(filtered, tr)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 min-w-48 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
          <Search size={15} className="text-slate-400 dark:text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("admin.users.searchPlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.users.allCompanies")}</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.users.allRoles")}</option>
          {roles.map((r) => <option key={r} value={r}>{roleLabel(r, tr)}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.users.allStatuses")}</option>
          <option value="active">{tr("admin.subscriptions.status.active")}</option>
          <option value="suspended">{tr("admin.subscriptions.status.suspendedUpper")}</option>
        </select>
      </div>

      {/* Liste : cards mobile + table desktop */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">

        {/* ── Mobile : cartes empilées (visible < lg) ── */}
        <div className="divide-y divide-slate-200 lg:hidden dark:divide-white/5">
          {filtered.map((user) => {
            const isSuper = user.role === "super_admin";
            return (
              <div key={user.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-black text-white">
                    {user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate dark:text-white">{user.full_name}</p>
                    <p className="text-xs text-slate-500 truncate dark:text-white/50">{user.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{roleLabel(user.role, tr)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${user.account_status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"}`}>
                        {accountStatusLabel(user.account_status, tr)}
                      </span>
                      {user.must_change_password && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
                          {tr("admin.users.passwordToCreate")}
                        </span>
                      )}
                    </div>
                    {user.company_name && <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">{user.company_name}</p>}
                    <p className="text-[10px] text-slate-400 dark:text-white/40">{tr("admin.users.lastLoginWithValue", { value: relTime(user.last_login_at, tr) })}</p>
                  </div>
                </div>
                {/* Actions — labels visibles */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    disabled={isSuper || updateStatus.isPending}
                    onClick={() => askToggleStatus(user)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    {user.account_status === "active"
                      ? <><ShieldOff size={13} className="text-rose-500" /> {tr("admin.subscriptions.suspend")}</>
                      : <><ShieldCheck size={13} className="text-emerald-500" /> {tr("admin.users.activate")}</>}
                  </button>
                  <button
                    disabled={isSuper}
                    onClick={() => askImpersonate(user)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 transition dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                  >
                    <User size={13} /> {tr("admin.users.impersonate")}
                  </button>
                  <button
                    onClick={() => setResetTarget(user)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                  >
                    <KeyRound size={13} /> {tr("admin.users.resetPasswordShort")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop : tableau classique (visible ≥ lg) ── */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40">
              <tr>
                <th className="px-4 py-3">{tr("admin.users.user")}</th>
                <th className="px-4 py-3">{tr("admin.subscriptions.company")}</th>
                <th className="px-4 py-3">{tr("admin.users.role")}</th>
                <th className="px-4 py-3">{tr("admin.users.team")}</th>
                <th className="px-4 py-3">{tr("admin.users.indicators")}</th>
                <th className="px-4 py-3">{tr("common.status")}</th>
                <th className="px-4 py-3 text-right">{tr("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {filtered.map((user) => {
                const isSuper = user.role === "super_admin";
                return (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 font-black text-sm text-white">
                          {user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white">{user.full_name}</p>
                          <p className="text-xs text-slate-500 dark:text-white/50">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-white/70">{user.company_name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{roleLabel(user.role, tr)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50">{[user.department, user.branch].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-white/40">
                          {tr("admin.users.loginWithValue", { value: relTime(user.last_login_at, tr) })}
                        </span>
                        {user.must_change_password && (
                          <span className="w-fit rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
                            {tr("admin.users.passwordToCreate")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${user.account_status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"}`}>
                        {accountStatusLabel(user.account_status, tr)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          disabled={isSuper || updateStatus.isPending}
                          onClick={() => askToggleStatus(user)}
                          title={user.account_status === "active" ? tr("admin.subscriptions.suspend") : tr("admin.subscriptions.reactivate")}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                        >
                          {user.account_status === "active"
                            ? <><ShieldOff size={12} className="text-rose-500" /> {tr("admin.subscriptions.suspend")}</>
                            : <><ShieldCheck size={12} className="text-emerald-500" /> {tr("admin.users.activate")}</>}
                        </button>
                        <button
                          disabled={isSuper}
                          onClick={() => askImpersonate(user)}
                          title={tr("admin.users.impersonate")}
                          className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 transition dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          <User size={12} /> {tr("admin.users.impersonate")}
                        </button>
                        <button
                          onClick={() => setResetTarget(user)}
                          title={tr("admin.users.resetPassword")}
                          className="flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          <KeyRound size={12} /> {tr("admin.users.resetPasswordShort")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* État vide */}
        {filtered.length === 0 && (
          <div className="grid place-items-center py-16 text-slate-400 dark:text-white/30">
            <Users size={36} />
            <p className="mt-3 text-sm font-semibold">
              {users.isLoading ? tr("common.loading") : tr("admin.users.empty")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
