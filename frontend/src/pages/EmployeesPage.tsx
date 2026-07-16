import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Briefcase, CalendarDays, Clipboard, Clock3, ExternalLink, FileCheck2, FileDown, FileText,
  KeyRound, Loader2, Maximize2, Search, Send, ShieldOff, Upload, UserPlus, Users, Wallet, X,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { ModuleHint } from "../components/ModuleHint";
import { SelectInput, TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import i18n from "../i18n";
import { api } from "../services/api";
import { money, currencyLabel } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import * as T from "../styles/table";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_title: "",
  employment_type: "CDI",
  department: "Opérations",
  branch: "Siège",
  manager_name: "",
  salary: 0,
  access_role: "employe",
  payout_method: "mobile_money",
  payout_phone: "",
  payout_bank_name: "",
  payout_account_number: "",
  payout_paypal_email: "",
};

function accountStatusLabel(status: string, tr: TFunction) {
  if (status === "active") return tr("employeesPage.status.active");
  if (status === "suspended") return tr("employeesPage.status.suspended");
  if (status === "inactive") return tr("employeesPage.status.inactive");
  if (status === "pending") return tr("employeesPage.status.pending");
  return status;
}

function accessRoleLabel(role: string, tr: TFunction) {
  const labels: Record<string, string> = {
    employe: tr("employeesPage.roles.employee"),
    manager_entreprise: tr("employeesPage.roles.manager"),
    rh_entreprise: tr("employeesPage.roles.hr"),
    comptable: tr("employeesPage.roles.accountant"),
    caissier_pos: tr("employeesPage.roles.cashier"),
    admin_entreprise: tr("employeesPage.roles.admin"),
  };
  return labels[role] ?? role;
}

function payoutMethodLabel(method: string | null | undefined, tr: TFunction) {
  if (!method) return "—";
  const labels: Record<string, string> = {
    mobile_money: tr("employeesPage.payout.mobileMoney"),
    zola: "Zola",
    bank: tr("employeesPage.payout.bank"),
    paypal: "PayPal",
  };
  return labels[method] ?? method;
}

/* ─── Drawer ───────────────────────────────────────────────────────────── */
function EmployeeDrawer({
  open,
  onClose,
  onCreate,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (form: typeof EMPTY_FORM) => void;
  isPending: boolean;
  error: string | null;
}) {
  const { t: tr } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [section, setSection] = useState<"identity" | "position" | "payment" | "access">("identity");
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setSection("identity");
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate(form);
  }

  const SECTIONS = [
    { key: "identity", tk: "employeesPage.drawer.sections.identity", icon: Users },
    { key: "position", tk: "employeesPage.drawer.sections.position", icon: Briefcase },
    { key: "payment", tk: "employeesPage.drawer.sections.payment", icon: Wallet },
    { key: "access", tk: "employeesPage.drawer.sections.access", icon: ShieldOff },
  ] as const;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        aria-modal="true"
        role="dialog"
        aria-label={tr("employeesPage.drawer.ariaLabel")}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-250 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-5">
          <div>
            <h2 className="text-lg font-black text-ink">{tr("employeesPage.drawer.title")}</h2>
            <p className="text-sm font-medium text-[#717182]">
              {tr("employeesPage.drawer.subtitle")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={tr("common.close")}
            className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.06] text-[#717182] hover:bg-stone-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-black/[0.05] px-6 py-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                section === s.key
                  ? "bg-emerald-600 text-white"
                  : "text-[#717182] hover:bg-stone-50"
              }`}
            >
              <s.icon size={14} />
              {tr(s.tk)}
            </button>
          ))}
        </div>

        {/* Form body */}
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ── SECTION : Identité ── */}
            {section === "identity" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <TextInput
                    label={tr("employeesPage.drawer.identity.firstName")}
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    autoFocus
                  />
                  <TextInput
                    label={tr("employeesPage.drawer.identity.lastName")}
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                  />
                </div>
                <TextInput
                  label={tr("employeesPage.drawer.identity.email")}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="employe@entreprise.com"
                />
                <TextInput
                  label={tr("employeesPage.drawer.identity.phone")}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+242 06 XXX XX XX"
                />
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <strong>{tr("employeesPage.drawer.identity.noteLabel")}</strong> {tr("employeesPage.drawer.identity.noteText")}
                </div>
              </div>
            )}

            {/* ── SECTION : Poste ── */}
            {section === "position" && (
              <div className="space-y-4">
                <TextInput
                  label={tr("employeesPage.drawer.position.jobTitle")}
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder={tr("employeesPage.drawer.position.jobPlaceholder")}
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <TextInput
                    label={tr("employeesPage.drawer.position.department")}
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                  <TextInput
                    label={tr("employeesPage.drawer.position.branch")}
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  />
                </div>
                <TextInput
                  label={tr("employeesPage.drawer.position.manager")}
                  value={form.manager_name}
                  onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                  placeholder={tr("employeesPage.drawer.position.managerPlaceholder")}
                />
                <SelectInput
                  label={tr("employeesPage.drawer.position.contractType")}
                  value={form.employment_type}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                >
                  <option value="CDI">{tr("employeesPage.drawer.contractTypes.cdi")}</option>
                  <option value="CDD">{tr("employeesPage.drawer.contractTypes.cdd")}</option>
                  <option value="Mission">{tr("employeesPage.drawer.contractTypes.mission")}</option>
                  <option value="Journalier">{tr("employeesPage.drawer.contractTypes.daily")}</option>
                  <option value="Stage">{tr("employeesPage.drawer.contractTypes.internship")}</option>
                </SelectInput>
                <TextInput
                  label={tr("employeesPage.drawer.position.salary", { currency: currencyLabel() })}
                  type="number"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
                  placeholder={tr("employeesPage.drawer.position.salaryPlaceholder")}
                />
              </div>
            )}

            {/* ── SECTION : Paiement ── */}
            {section === "payment" && (
              <div className="space-y-4">
                <SelectInput
                  label={tr("employeesPage.drawer.payment.method")}
                  value={form.payout_method}
                  onChange={(e) => setForm({ ...form, payout_method: e.target.value })}
                >
                  <option value="mobile_money">Mobile money</option>
                  <option value="zola">Zola</option>
                  <option value="bank">{tr("employeesPage.payout.bank")}</option>
                  <option value="paypal">PayPal</option>
                </SelectInput>
                {(form.payout_method === "mobile_money" || form.payout_method === "zola") && (
                  <TextInput
                    label={tr("employeesPage.drawer.payment.payoutPhone")}
                    value={form.payout_phone}
                    onChange={(e) => setForm({ ...form, payout_phone: e.target.value })}
                    placeholder={form.phone || "+242 06 XXX XX XX"}
                  />
                )}
                {form.payout_method === "bank" && (
                  <>
                    <TextInput
                      label={tr("employeesPage.drawer.payment.bank")}
                      value={form.payout_bank_name}
                      onChange={(e) => setForm({ ...form, payout_bank_name: e.target.value })}
                      placeholder={tr("employeesPage.drawer.payment.bankPlaceholder")}
                    />
                    <TextInput
                      label={tr("employeesPage.drawer.payment.accountNumber")}
                      value={form.payout_account_number}
                      onChange={(e) => setForm({ ...form, payout_account_number: e.target.value })}
                      placeholder={tr("employeesPage.drawer.payment.accountPlaceholder")}
                    />
                  </>
                )}
                {form.payout_method === "paypal" && (
                  <TextInput
                    label="Email PayPal"
                    type="email"
                    value={form.payout_paypal_email}
                    onChange={(e) => setForm({ ...form, payout_paypal_email: e.target.value })}
                    placeholder="employe@email.com"
                  />
                )}
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  {tr("employeesPage.drawer.payment.info")}
                </div>
              </div>
            )}

            {/* ── SECTION : Accès ── */}
            {section === "access" && (
              <div className="space-y-4">
                <SelectInput
                  label={tr("employeesPage.drawer.access.roleLabel")}
                  value={form.access_role}
                  onChange={(e) => setForm({ ...form, access_role: e.target.value })}
                >
                  <option value="employe">{tr("employeesPage.drawer.access.options.employee")}</option>
                  <option value="manager_entreprise">{tr("employeesPage.drawer.access.options.manager")}</option>
                  <option value="rh_entreprise">{tr("employeesPage.drawer.access.options.hr")}</option>
                  <option value="comptable">{tr("employeesPage.drawer.access.options.accountant")}</option>
                  <option value="caissier_pos">{tr("employeesPage.drawer.access.options.cashier")}</option>
                  <option value="admin_entreprise">{tr("employeesPage.drawer.access.options.admin")}</option>
                </SelectInput>

                <div className="space-y-2 rounded-lg border border-black/[0.05] bg-stone-50 p-4 text-sm">
                  <p className="font-semibold text-ink">{tr("employeesPage.drawer.access.scopeTitle")}</p>
                  <ul className="space-y-1 text-[#17211f]">
                    {form.access_role === "employe" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.employee.profile")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.employee.others")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.employee.accounting")}</li>
                      </>
                    )}
                    {form.access_role === "manager_entreprise" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.manager.team")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.manager.reports")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.manager.payroll")}</li>
                      </>
                    )}
                    {form.access_role === "rh_entreprise" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.hr.files")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.hr.contracts")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.hr.payroll")}</li>
                      </>
                    )}
                    {form.access_role === "comptable" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.accountant.accounting")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.accountant.reports")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.accountant.hr")}</li>
                      </>
                    )}
                    {form.access_role === "caissier_pos" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.cashier.pos")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.cashier.restricted")}</li>
                      </>
                    )}
                    {form.access_role === "admin_entreprise" && (
                      <>
                        <li>{tr("employeesPage.drawer.access.scopes.admin.all")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.admin.accounts")}</li>
                        <li>{tr("employeesPage.drawer.access.scopes.admin.settings")}</li>
                      </>
                    )}
                  </ul>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t border-black/[0.05] px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {section !== "identity" && (
                  <button
                    type="button"
                    onClick={() =>
                      setSection(section === "access" ? "payment" : section === "payment" ? "position" : "identity")
                    }
                    className="rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50"
                  >
                    {tr("employeesPage.drawer.actions.previous")}
                  </button>
                )}
                {section !== "access" && (
                  <button
                    type="button"
                    onClick={() =>
                      setSection(section === "identity" ? "position" : section === "position" ? "payment" : "access")
                    }
                    className="rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50"
                  >
                    {tr("employeesPage.drawer.actions.next")}
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isPending || !form.first_name || !form.last_name || !form.job_title}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:bg-stone-300"
              >
                <UserPlus size={17} />
                {isPending ? tr("employeesPage.drawer.actions.creating") : tr("employeesPage.drawer.actions.createAccess")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─── Page principale ──────────────────────────────────────────────────── */
export function EmployeesPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  useCurrency();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "presence" | "leaves" | "contracts">("list");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "department" | "salary" | "branch" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(field: "name" | "department" | "salary" | "branch") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: "name" | "department" | "salary" | "branch" }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp size={12} className="ml-1 text-emerald-500" />
      : <ArrowDown size={12} className="ml-1 text-emerald-500" />;
  }
  const [contractModal, setContractModal] = useState<{ html: string; name: string } | null>(null);
  const [contractLoading, setContractLoading] = useState<number | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const provisioningRef = useRef<HTMLDivElement>(null);
  const [provisioning, setProvisioning] = useState<null | {
    employeeName: string;
    employeeId: number;
    login: string;
    email: string;
    phone: string;
    password: string;
    note: string;
    isReset?: boolean;
  }>(null);

  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const create = useMutation({
    mutationFn: api.quickCreateEmployee,
    onSuccess: (result) => {
      setDrawerOpen(false);
      setProvisioning({
        employeeName: `${result.employee.first_name} ${result.employee.last_name}`,
        employeeId: result.employee.id,
        login: result.login_identifier,
        email: result.employee.email,
        phone: result.employee.phone,
        password: result.temporary_password,
        note: result.access_note,
        isReset: false,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setTimeout(() => provisioningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    },
  });
  const resetAccess = useMutation({
    mutationFn: api.resetEmployeeAccess,
    onSuccess: (result) => {
      setProvisioning({
        employeeName: `${result.employee.first_name} ${result.employee.last_name}`,
        employeeId: result.employee.id,
        login: result.login_identifier,
        email: result.employee.email,
        phone: result.employee.phone,
        password: result.temporary_password,
        note: result.access_note,
        isReset: true,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setTimeout(() => provisioningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    },
  });
  const updateStatus = useMutation({
    mutationFn: ({ employeeId, status }: { employeeId: number; status: string }) =>
      api.updateEmployeeAccountStatus(employeeId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });
  const employability = useMutation({
    mutationFn: api.submitEmployability,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employabilityChecks"] }),
  });
  const importCsv = useMutation({
    mutationFn: api.importEmployeesCsv,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      const suffix = result.errors.length ? tr("employeesPage.toasts.importErrors", { count: result.errors.length }) : "";
      toast.success(tr("employeesPage.toasts.importSuccess", { count: result.imported, suffix }));
    },
  });

  async function openContract(employeeId: number, employeeName?: string) {
    setContractError(null);
    setContractLoading(employeeId);
    try {
      const blob = await api.downloadEmployeeContract(employeeId);
      const html = await blob.text();
      setContractModal({ html, name: employeeName ?? tr("employeesPage.contract.defaultName") });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr("employeesPage.contract.loadError");
      setContractError(msg);
    } finally {
      setContractLoading(null);
    }
  }

  function copyProvisioning() {
    if (!provisioning) return;
    navigator.clipboard.writeText(
      tr("employeesPage.provisioning.clipboard", {
        login: provisioning.login,
        email: provisioning.email,
        phone: provisioning.phone || tr("employeesPage.common.notProvided"),
        password: provisioning.password,
      })
    );
  }

  const filteredEmployees = (() => {
    const filtered = (employees.data ?? []).filter((emp) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.job_title} ${emp.department} ${emp.branch}`
        .toLowerCase()
        .includes(q);
    });
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "name")       { va = `${a.last_name} ${a.first_name}`; vb = `${b.last_name} ${b.first_name}`; }
      if (sortField === "department") { va = a.department ?? ""; vb = b.department ?? ""; }
      if (sortField === "salary")     { va = a.salary ?? 0; vb = b.salary ?? 0; }
      if (sortField === "branch")     { va = a.branch ?? ""; vb = b.branch ?? ""; }
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), i18n.language);
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  const TABS = [
    { key: "list", tk: "employeesPage.tabs.employees", icon: Users },
    { key: "presence", tk: "employeesPage.tabs.presence", icon: Clock3 },
    { key: "leaves", tk: "employeesPage.tabs.leaves", icon: CalendarDays },
    { key: "contracts", tk: "employeesPage.tabs.contracts", icon: FileCheck2 },
  ] as const;

  return (
    <>
      <div className="space-y-5">
        <ModuleHint moduleId="employees" title={tr("moduleHints.employees.title")} body={tr("moduleHints.employees.body")} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-600">{tr("employeesPage.header.eyebrow")}</p>
            <h1 className="text-3xl font-black text-ink">{tr("employeesPage.header.title")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const csv = tr("employeesPage.csv.template");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = tr("employeesPage.csv.fileName"); a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-stone-50 dark:bg-white/5 dark:border-white/[0.08]"
            >
              <FileDown size={15} />
              {tr("employeesPage.header.csvTemplate")}
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-stone-50 dark:bg-white/5 dark:text-white dark:border-white/[0.08]">
              <Upload size={15} />
              {tr("employeesPage.header.importCsv")}
              <input type="file" accept=".csv" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importCsv.mutate(file);
                e.target.value = "";
              }} />
            </label>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              <UserPlus size={18} />
              {tr("employeesPage.header.newEmployee")}
            </button>
          </div>
        </div>

        {/* Résultat provisioning */}
        {provisioning && (
          <div ref={provisioningRef} className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-5 shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                    {provisioning.isReset ? tr("employeesPage.provisioning.accessReset") : tr("employeesPage.provisioning.accountCreated")}
                  </span>
                  <p className="font-bold text-emerald-900">{provisioning.employeeName}</p>
                </div>

                {/* ⚠️ One-time warning */}
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span className="text-base">⚠️</span>
                  <p><strong>{tr("employeesPage.provisioning.warningStrong")}</strong> {tr("employeesPage.provisioning.warningText")}</p>
                </div>

                {/* Credentials grid */}
                <div className="mt-3 grid gap-3 rounded-xl bg-white p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">{tr("employeesPage.provisioning.loginLabel")}</p>
                    <p className="mt-0.5 break-all font-mono font-bold text-emerald-700 text-base">{provisioning.login}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">{tr("employeesPage.provisioning.passwordLabel")}</p>
                    <p className="mt-0.5 break-all font-mono font-bold text-rose-600 text-base">{provisioning.password}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">{tr("employeesPage.provisioning.emailLabel")}</p>
                    <p className="mt-0.5 font-mono text-ink">{provisioning.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">{tr("employeesPage.provisioning.phoneLabel")}</p>
                    <p className="mt-0.5 font-mono text-ink">{provisioning.phone || tr("employeesPage.common.notProvided")}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-emerald-700">
                  {provisioning.note} {tr("employeesPage.provisioning.loginNote")}
                </p>
              </div>
              <button onClick={() => setProvisioning(null)} aria-label={tr("common.close")} className="shrink-0 text-emerald-600 hover:text-emerald-900">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={copyProvisioning}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Clipboard size={15} />
                {tr("employeesPage.provisioning.copy")}
              </button>
              <button
                onClick={() => openContract(provisioning.employeeId, provisioning.employeeName)}
                disabled={contractLoading === provisioning.employeeId}
                className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {contractLoading === provisioning.employeeId ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {contractLoading === provisioning.employeeId ? tr("employeesPage.actions.generating") : tr("employeesPage.provisioning.openContract")}
              </button>
              <button
                onClick={() => setProvisioning(null)}
                className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                {tr("employeesPage.provisioning.closeAfterCopy")}
              </button>
            </div>
          </div>
        )}

        <Panel
          title={tr("employeesPage.panel.title")}
          action={
            <StatusBadge label={tr("employeesPage.panel.employeeCount", { count: employees.data?.length ?? 0 })} tone="blue" />
          }
        >
          {/* Tabs */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  tab === t.key
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-50 text-[#17211f] hover:bg-black/[0.04]"
                }`}
              >
                <t.icon size={16} />
                {tr(t.tk)}
              </button>
            ))}
          </div>

          {/* Recherche */}
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-3 py-2">
            <Search size={17} className="text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("employeesPage.search.placeholder")}
              aria-label={tr("employeesPage.search.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {/* Tab : Liste */}
          {tab === "list" && filteredEmployees?.length ? (
            <div className={T.tableWrap}>
              <table className={`${T.table} min-w-[900px]`}>
                <thead>
                  <tr className={T.theadRow}>
                    <th className={T.th}>
                      <button onClick={() => toggleSort("name")} className="flex items-center hover:text-emerald-600 transition">
                        {tr("employeesPage.table.name")} <SortIcon field="name" />
                      </button>
                    </th>
                    <th className={T.th}>{tr("employeesPage.table.contact")}</th>
                    <th className={T.th}>{tr("employeesPage.table.role")}</th>
                    <th className={T.th}>
                      <button onClick={() => toggleSort("department")} className="flex items-center hover:text-emerald-600 transition">
                        {tr("employeesPage.table.department")} <SortIcon field="department" />
                      </button>
                    </th>
                    <th className={T.th}>
                      <button onClick={() => toggleSort("branch")} className="flex items-center hover:text-emerald-600 transition">
                        {tr("employeesPage.table.branch")} <SortIcon field="branch" />
                      </button>
                    </th>
                    <th className={T.th}>
                      <button onClick={() => toggleSort("salary")} className="flex items-center hover:text-emerald-600 transition">
                        {tr("employeesPage.table.salary")} <SortIcon field="salary" />
                      </button>
                    </th>
                    <th className={T.th}>{tr("employeesPage.table.payment")}</th>
                    <th className={T.th}>{tr("employeesPage.table.account")}</th>
                    <th className={T.th}>{tr("employeesPage.table.access")}</th>
                    <th className={T.th}>{tr("employeesPage.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className={T.tbody}>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className={T.tr}>
                      <td className={T.td}>
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                            style={{ background: emp.badge_color }}
                          >
                            {emp.first_name[0]}{emp.last_name[0]}
                          </span>
                          <div>
                            <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                            <p className="text-xs text-[#717182]">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={T.td}>
                        <p>{emp.phone || tr("employeesPage.common.notProvided")}</p>
                        <p className="text-xs text-[#717182]">{tr("employeesPage.common.sms")}</p>
                      </td>
                      <td className={`${T.td} font-medium`}>{emp.job_title}</td>
                      <td className={T.td}>{emp.department}</td>
                      <td className={T.td}>{emp.branch}</td>
                      <td className={`${T.td} font-semibold text-emerald-600`}>{money(emp.salary)}</td>
                      <td className={T.td}>
                        <p className="font-medium">{payoutMethodLabel(emp.payout_method, tr)}</p>
                        <p className="text-xs text-[#717182]">
                          {emp.payout_phone || emp.payout_bank_name || emp.payout_paypal_email || tr("employeesPage.common.toComplete")}
                        </p>
                      </td>
                      <td className={T.td}>
                        <StatusBadge
                          label={accountStatusLabel(emp.account_status, tr)}
                          tone={emp.account_status === "active" ? "green" : emp.account_status === "suspended" ? "red" : "amber"}
                        />
                      </td>
                      <td className={T.td}>
                        <p className="font-medium">{accessRoleLabel(emp.access_role, tr)}</p>
                        <p className="text-xs text-[#717182]">{emp.access_scope}</p>
                      </td>
                      <td className={T.td}>
                        <div className="flex items-center gap-1.5">
                          <Link to={`/employees/${emp.id}`} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title={tr("employeesPage.actions.viewProfile")} aria-label={tr("employeesPage.actions.viewProfile")}><ExternalLink size={15} /></Link>
                          <button
                            onClick={() => resetAccess.mutate(emp.id)}
                            disabled={resetAccess.isPending}
                            className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                            title={tr("employeesPage.actions.resetPasswordTitle")}
                          >
                            {resetAccess.isPending ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                            {tr("employeesPage.actions.resetPassword")}
                          </button>
                          <button onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)} disabled={contractLoading === emp.id} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50" title={tr("employeesPage.actions.printableContract")} aria-label={tr("employeesPage.actions.printableContract")}>{contractLoading === emp.id ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}</button>
                          <button onClick={() => employability.mutate(emp.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title={tr("employeesPage.actions.employability")} aria-label={tr("employeesPage.actions.employability")}><Send size={15} /></button>
                          <button
                            onClick={() => updateStatus.mutate({ employeeId: emp.id, status: emp.account_status === "suspended" ? "active" : "suspended" })}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-rose-500 hover:text-rose-600"
                            title={tr("employeesPage.actions.toggleStatus")}
                            aria-label={tr("employeesPage.actions.toggleStatus")}
                          >
                            <ShieldOff size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tab === "presence" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-stone-50 px-4 py-2 text-sm">
                <span className="font-semibold text-ink">
                  {tr("employeesPage.presence.today", {
                    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date()),
                  })}
                </span>
                <span className="font-bold text-emerald-600">
                  {tr("employeesPage.presence.activeCount", {
                    count: (filteredEmployees ?? []).filter((e) => e.account_status === "active").length,
                  })}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(filteredEmployees ?? []).map((emp) => {
                  const isActive = emp.account_status === "active";
                  const isSuspended = emp.account_status === "suspended";
                  return (
                    <article key={emp.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                          {emp.first_name[0]}{emp.last_name[0]}
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-[#717182]">{emp.branch} · {emp.job_title}</p>
                        </div>
                      </div>
                      <StatusBadge
                        label={isSuspended
                          ? tr("employeesPage.status.suspended")
                          : isActive
                            ? tr("employeesPage.status.active")
                            : tr("employeesPage.status.inactive")}
                        tone={isSuspended ? "red" : isActive ? "green" : "amber"}
                      />
                    </article>
                  );
                })}
              </div>
              {!(filteredEmployees ?? []).length && <EmptyState icon={Users} title={tr("employeesPage.empty.notFound")} />}
            </div>
          ) : tab === "leaves" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 mb-2">
                <div className="rounded-lg border border-black/[0.05] bg-stone-50 p-3 text-center">
                  <p className="text-2xl font-black text-ink">{(employees.data ?? []).filter((e) => e.employment_type === "CDI").length}</p>
                  <p className="text-xs text-[#717182]">{tr("employeesPage.leaves.cdiActive")}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-black text-amber-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDD").length}</p>
                  <p className="text-xs text-amber-700">{tr("employeesPage.leaves.cddWatch")}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{(employees.data ?? []).filter((e) => e.employment_type === "Stage").length}</p>
                  <p className="text-xs text-emerald-700">{tr("employeesPage.leaves.interns")}</p>
                </div>
              </div>
              {(filteredEmployees ?? []).map((emp) => (
                <article key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                      {emp.first_name[0]}{emp.last_name[0]}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                      <p className="text-sm text-[#717182]">{emp.employment_type} · {emp.department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={emp.employment_type === "CDD" ? "CDD" : emp.employment_type === "Stage" ? "Stage" : "CDI"}
                      tone={emp.employment_type === "CDD" ? "amber" : emp.employment_type === "Stage" ? "blue" : "green"}
                    />
                    <button
                      onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)}
                      disabled={contractLoading === emp.id}
                      className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-stone-50 disabled:opacity-50"
                    >
                      {contractLoading === emp.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                      {tr("employeesPage.actions.contract")}
                    </button>
                  </div>
                </article>
              ))}
              {!(filteredEmployees ?? []).length && <EmptyState icon={Users} title={tr("employeesPage.empty.notFound")} />}
            </div>
          ) : tab === "contracts" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-black/[0.05] bg-stone-50 p-4">
                  <p className="text-2xl font-black text-ink">{employees.data?.length ?? 0}</p>
                  <p className="text-sm font-medium text-[#717182]">{tr("employeesPage.contracts.activeContracts")}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-2xl font-black text-emerald-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDI").length}</p>
                  <p className="text-sm font-medium text-emerald-700">CDI</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <p className="text-2xl font-black text-amber-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDD").length}</p>
                  <p className="text-sm font-medium text-amber-800">{tr("employeesPage.contracts.cddRenew")}</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                  <p className="text-2xl font-black text-sky-700">{(employees.data ?? []).filter((e) => e.employment_type === "Stage" || e.employment_type === "Mission").length}</p>
                  <p className="text-sm font-medium text-sky-700">{tr("employeesPage.contracts.internshipsMissions")}</p>
                </div>
              </div>
              <div className="space-y-2">
                {(filteredEmployees ?? []).map((emp) => (
                  <div key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                        {emp.first_name[0]}{emp.last_name[0]}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-[#717182]">{emp.job_title} · {emp.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={emp.employment_type}
                        tone={emp.employment_type === "CDI" ? "green" : emp.employment_type === "CDD" ? "amber" : "blue"}
                      />
                      <button
                        onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)}
                        disabled={contractLoading === emp.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {contractLoading === emp.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                        {contractLoading === emp.id ? tr("employeesPage.actions.generating") : tr("employeesPage.contracts.viewAiContract")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={Users} title={tr("employeesPage.empty.noEmployee")} />
          )}
        </Panel>
      </div>

      {/* Drawer modal */}
      <EmployeeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreate={(form) => create.mutate(form)}
        isPending={create.isPending}
        error={create.error?.message ?? null}
      />

      {/* Contract error toast */}
      {contractError && (
        <div className="fixed left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-red-200 bg-white px-5 py-3 shadow-xl bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6">
          <span className="text-sm font-semibold text-red-700">{contractError}</span>
          <button onClick={() => setContractError(null)} aria-label={tr("common.close")} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
        </div>
      )}

      {/* Contract preview modal */}
      {contractModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setContractModal(null)}>
          <div
            className="relative mx-auto mt-8 flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ maxHeight: "calc(100vh - 4rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100">
                  <FileText size={18} className="text-emerald-700" />
                </div>
                <div>
                  <p className="font-bold text-ink">{tr("employeesPage.contractModal.title", { name: contractModal.name })}</p>
                  <p className="text-xs text-[#717182]">{tr("employeesPage.contractModal.subtitle")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([contractModal.html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${tr("employeesPage.contractModal.downloadPrefix")}_${contractModal.name.replace(/\s+/g, "_")}.html`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-stone-50 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-stone-100"
                  title={tr("employeesPage.contractModal.download")}
                >
                  <Maximize2 size={15} />
                  {tr("employeesPage.contractModal.download")}
                </button>
                <button
                  onClick={() => setContractModal(null)}
                  aria-label={tr("common.close")}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.06] text-[#717182] hover:bg-stone-50"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Iframe content */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={contractModal.html}
                title={tr("employeesPage.contractModal.iframeTitle", { name: contractModal.name })}
                className="h-full w-full border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
