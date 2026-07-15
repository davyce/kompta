import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  Building2,
  Download,
  Eye,
  LayoutGrid,
  List,
  Megaphone,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../../services/api";
import i18n from "../../i18n";

// ── Types ──────────────────────────────────────────────────────────────────────

type Company = {
  id: number;
  name: string;
  legal_name: string;
  industry: string;
  country: string;
  completion_score: number;
  teras_score: number;
  users_count: number;
  employees_count: number;
  created_at: string | null;
  /** "active" | "suspended" — renvoyé par routes_subscriptions.py /admin/subscription/companies */
  company_status?: string;
};

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({ children, tone = "violet" }: { children: ReactNode; tone?: "violet" | "emerald" | "amber" | "rose" | "sky" }) {
  const tones = {
    violet: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/20",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/20",
    amber: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/20",
    rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/20",
    sky: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-400/20",
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

// ── Create company modal ──────────────────────────────────────────────────────

type CreateForm = {
  company_name: string;
  legal_name: string;
  industry: string;
  country: string;
  plan: string;
  admin_full_name: string;
  admin_email: string;
  admin_phone: string;
  password: string;
  organization_type: string;
  signatory_name: string;
  accept_privacy: boolean;
  accept_terms: boolean;
  accept_disclaimer: boolean;
};

function CreateCompanyModal({ onClose }: { onClose: () => void }) {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>({
    company_name: "",
    legal_name: "",
    industry: "",
    country: "",
    plan: "basic",
    admin_full_name: "",
    admin_email: "",
    admin_phone: "",
    password: "",
    organization_type: "company",
    signatory_name: "",
    accept_privacy: false,
    accept_terms: false,
    accept_disclaimer: false,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.registerCompany({
        company_name: form.company_name,
        legal_name: form.legal_name,
        industry: form.industry,
        country: form.country,
        admin_full_name: form.admin_full_name,
        admin_email: form.admin_email,
        admin_phone: form.admin_phone,
        password: form.password,
        organization_type: form.organization_type,
        signatory_name: form.signatory_name,
        accept_privacy: form.accept_privacy,
        accept_terms: form.accept_terms,
        accept_disclaimer: form.accept_disclaimer,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminCompanies"] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : tr("admin.companies.errors.generic")),
  });

  type StringFieldKey = { [K in keyof CreateForm]: CreateForm[K] extends string ? K : never }[keyof CreateForm];
  function field(key: StringFieldKey, label: string, type = "text", placeholder = "") {
    return (
      <div>
        <label className="mb-1 block text-xs font-bold text-white/60">{label}</label>
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-indigo-500"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black">{tr("admin.companies.createCompany")}</h2>
          <button onClick={onClose} aria-label={tr("common.close")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 text-white/60">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("company_name", tr("admin.companies.fields.tradeName"), "text", "Acme Corp")}
            {field("legal_name", tr("admin.companies.fields.legalName"), "text", "Acme SARL")}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("industry", tr("admin.companies.fields.industry"), "text", tr("admin.companies.placeholders.industry"))}
            {field("country", tr("admin.companies.fields.country"), "text", "CM")}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-white/60">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="basic">{tr("admin.companies.plans.basic")}</option>
              <option value="pro">{tr("admin.companies.plans.pro")}</option>
              <option value="enterprise">{tr("admin.companies.plans.enterprise")}</option>
            </select>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">{tr("admin.companies.adminAccount")}</p>
          {field("admin_full_name", tr("admin.companies.fields.fullName"), "text", tr("admin.companies.placeholders.fullName"))}
          {field("admin_email", "Email", "email", "admin@acme.com")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("admin_phone", tr("admin.companies.fields.phone"), "tel", "+237600000000")}
            {field("password", tr("admin.companies.fields.temporaryPassword"), "password")}
          </div>
          {field("signatory_name", tr("admin.companies.fields.signatoryName"), "text", tr("admin.companies.placeholders.fullName"))}
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="flex items-start gap-2 text-xs text-white/70">
              <input type="checkbox" className="mt-0.5 accent-indigo-500" checked={form.accept_privacy}
                onChange={(e) => setForm((f) => ({ ...f, accept_privacy: e.target.checked }))} />
              <span>{tr("admin.companies.consent.privacy")}</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-white/70">
              <input type="checkbox" className="mt-0.5 accent-indigo-500" checked={form.accept_terms}
                onChange={(e) => setForm((f) => ({ ...f, accept_terms: e.target.checked }))} />
              <span>{tr("admin.companies.consent.terms")}</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-white/70">
              <input type="checkbox" className="mt-0.5 accent-indigo-500" checked={form.accept_disclaimer}
                onChange={(e) => setForm((f) => ({ ...f, accept_disclaimer: e.target.checked }))} />
              <span>{tr("admin.companies.consent.disclaimer")}</span>
            </label>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
            {tr("common.cancel")}
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !form.company_name ||
              !form.admin_email ||
              !form.signatory_name.trim() ||
              !form.accept_privacy ||
              !form.accept_terms ||
              !form.accept_disclaimer
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {create.isPending ? tr("admin.companies.creating") : tr("admin.companies.createCompanyShort")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Broadcast modal ───────────────────────────────────────────────────────────

function BroadcastModal({ companyId, companyName, onClose }: { companyId: number; companyName: string; onClose: () => void }) {
  const { t: tr } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      api.adminBroadcast({ title, message, type, target_company_id: companyId }),
    onSuccess: () => setSent(true),
    onError: (e) => setError(e instanceof Error ? e.message : tr("admin.companies.errors.generic")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">{tr("admin.companies.targetedBroadcast")}</h2>
            <p className="text-xs text-white/50">{companyName}</p>
          </div>
          <button onClick={onClose} aria-label={tr("common.close")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 text-white/60">
            <X size={16} />
          </button>
        </div>
        {sent ? (
          <div className="py-8 text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-2 font-black text-emerald-300">{tr("admin.companies.messageSent")}</p>
            <button onClick={onClose} className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 transition">{tr("common.close")}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-white/60">{tr("admin.broadcast.fieldTitle")}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-white/60">{tr("admin.broadcast.fieldMessage")}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-white/60">{tr("admin.broadcast.messageType")}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="info">{tr("admin.broadcast.typeInfo")}</option>
                <option value="warning">{tr("admin.broadcast.typeWarning")}</option>
                <option value="critical">{tr("admin.broadcast.typeCritical")}</option>
              </select>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
                {tr("common.cancel")}
              </button>
              <button
                onClick={() => send.mutate()}
                disabled={send.isPending || !title || !message}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {send.isPending ? tr("admin.companies.sending") : tr("admin.tickets.send")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card view ─────────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  onView,
  onBroadcast,
  onToggleStatus,
  suspending,
}: {
  company: Company;
  onView: () => void;
  onBroadcast: () => void;
  onToggleStatus: () => void;
  suspending: boolean;
}) {
  const { t: tr } = useTranslation();
  const isSuspended = company.company_status === "suspended";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:shadow-xl dark:shadow-black/10 dark:text-white flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 font-black text-lg text-white">
            {company.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black">{company.name}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-white/50">{company.legal_name || company.industry}</p>
          </div>
        </div>
        <Pill tone={company.completion_score >= 80 ? "emerald" : company.completion_score >= 50 ? "amber" : "rose"}>
          {company.completion_score}%
        </Pill>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <Users size={14} className="text-indigo-500 dark:text-indigo-300" />
          <p className="mt-1 text-lg font-black">{company.users_count}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/40">{tr("admin.companies.users")}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <Building2 size={14} className="text-indigo-500 dark:text-indigo-300" />
          <p className="mt-1 text-lg font-black">{company.employees_count}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/40">{tr("admin.companies.employees")}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <ShieldCheck size={14} className="text-emerald-500 dark:text-emerald-300" />
          <p className="mt-1 text-lg font-black">{company.teras_score}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/40">TERAS</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Pill>{company.industry || tr("admin.companies.servicesFallback")}</Pill>
        <Pill tone="sky">{company.country || "—"}</Pill>
        {company.created_at && (
          <Pill tone="violet">{new Date(company.created_at).toLocaleDateString(i18n.language)}</Pill>
        )}
      </div>

      {/* TERAS bar */}
      <div>
        <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-400 dark:text-white/40">
          <span>{tr("admin.companies.terasScore")}</span>
          <span>{company.teras_score}/100</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${company.teras_score >= 80 ? "bg-emerald-500" : company.teras_score >= 50 ? "bg-indigo-600" : "bg-rose-500"}`}
            style={{ width: `${Math.min(company.teras_score, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onView}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold hover:bg-slate-100 transition dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Eye size={13} /> {tr("admin.companies.detail")}
        </button>
        <button
          onClick={onBroadcast}
          aria-label={tr("admin.companies.sendMessageTo", { name: company.name })}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold hover:bg-slate-100 transition dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Megaphone size={13} />
        </button>
        <button
          onClick={onToggleStatus}
          disabled={suspending}
          aria-label={isSuspended
            ? tr("admin.companies.reactivateCompany", { name: company.name })
            : tr("admin.companies.suspendCompany", { name: company.name })}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
            isSuspended
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              : "border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
          } disabled:opacity-50`}
        >
          {isSuspended ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
        </button>
      </div>
    </article>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(companies: Company[], tr: TFunction) {
  const headers = [
    "ID",
    tr("common.name"),
    tr("admin.companies.fields.legalName"),
    tr("admin.companies.fields.industry"),
    tr("admin.companies.fields.country"),
    tr("admin.companies.users"),
    tr("admin.companies.employees"),
    "TERAS",
    "Completion",
    tr("admin.companies.createdAt"),
  ];
  const rows = companies.map((c) => [
    c.id,
    c.name,
    c.legal_name,
    c.industry,
    c.country,
    c.users_count,
    c.employees_count,
    c.teras_score,
    c.completion_score,
    c.created_at ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kompta_companies.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminCompaniesPage() {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const [terasFilter, setTerasFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [showCreate, setShowCreate] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<Company | null>(null);

  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });

  const suspendMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminSuspendCompany(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminCompanies"] }),
  });

  // Derived filter lists
  const sectors = useMemo(() => {
    const all = new Set((companies.data ?? []).map((c) => c.industry).filter(Boolean));
    return Array.from(all).sort();
  }, [companies.data]);

  const countries = useMemo(() => {
    const all = new Set((companies.data ?? []).map((c) => c.country).filter(Boolean));
    return Array.from(all).sort();
  }, [companies.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (companies.data ?? []).filter((c) => {
      if (q && !`${c.name} ${c.legal_name} ${c.industry} ${c.country}`.toLowerCase().includes(q)) return false;
      if (sector && c.industry !== sector) return false;
      if (country && c.country !== country) return false;
      if (terasFilter === "high" && c.teras_score < 80) return false;
      if (terasFilter === "low" && c.teras_score >= 50) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "teras": return b.teras_score - a.teras_score;
        case "users": return b.users_count - a.users_count;
        case "date": return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        default: return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [companies.data, search, sector, country, terasFilter, sortBy]);

  return (
    <div className="space-y-6">
      {showCreate && <CreateCompanyModal onClose={() => setShowCreate(false)} />}
      {broadcastTarget && (
        <BroadcastModal
          companyId={broadcastTarget.id}
          companyName={broadcastTarget.name}
          onClose={() => setBroadcastTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Tenants</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">{tr("admin.companies.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{tr("admin.companies.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="emerald">{tr("admin.companies.companyCount", { count: filtered.length })}</Pill>
          <button
            onClick={() => exportCsv(filtered, tr)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition"
          >
            <Plus size={13} /> {tr("common.create")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 min-w-48 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
          <Search size={15} className="text-slate-400 shrink-0 dark:text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("admin.companies.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
          />
        </div>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label={tr("admin.companies.filterBySector")}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.companies.allSectors")}</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          aria-label={tr("admin.companies.filterByCountry")}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.companies.allCountries")}</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={terasFilter}
          onChange={(e) => setTerasFilter(e.target.value)}
          aria-label={tr("admin.companies.filterByTeras")}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="">{tr("admin.companies.allTeras")}</option>
          <option value="high">TERAS ≥ 80</option>
          <option value="low">TERAS &lt; 50</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label={tr("admin.companies.sortBy")}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          <option value="name">{tr("admin.companies.sort.az")}</option>
          <option value="teras">{tr("admin.companies.sort.teras")}</option>
          <option value="users">{tr("admin.companies.sort.users")}</option>
          <option value="date">{tr("admin.companies.sort.date")}</option>
        </select>
        <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-white/5">
          <button
            onClick={() => setView("cards")}
            aria-label={tr("admin.companies.viewCards")}
            aria-pressed={view === "cards"}
            className={`px-3 py-2.5 transition ${view === "cards" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView("table")}
            aria-label={tr("admin.companies.viewTable")}
            aria-pressed={view === "table"}
            className={`px-3 py-2.5 transition ${view === "table" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"}`}
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Cards view */}
      {view === "cards" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              onView={() => navigate(`/admin/companies/${company.id}`)}
              onBroadcast={() => setBroadcastTarget(company)}
              onToggleStatus={() => suspendMut.mutate({
                id: company.id,
                status: company.company_status === "suspended" ? "active" : "suspended",
              })}
              suspending={suspendMut.isPending}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 py-16 text-center text-slate-400 dark:text-white/30">
              <Building2 size={36} className="mx-auto mb-3" />
              <p className="font-semibold">{companies.isLoading ? tr("common.loading") : tr("admin.companies.empty")}</p>
            </div>
          )}
        </div>
      )}

      {/* Table view */}
      {view === "table" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">

          {/* Mobile : cartes empilées (lg-) */}
          <div className="divide-y divide-slate-200 lg:hidden dark:divide-white/5">
            {filtered.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-black text-white">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate dark:text-white">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate dark:text-white/60">{c.legal_name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/60">
                      <span>{c.industry || "—"}</span>
                      <span>·</span>
                      <span>{c.country || "—"}</span>
                      <span>·</span>
                      <span className="font-bold text-slate-900 dark:text-white">{tr("admin.companies.usersCount", { count: c.users_count })}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/40">TERAS</span>
                      <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-slate-200 overflow-hidden dark:bg-white/10">
                        <div
                          className={`h-full rounded-full ${c.teras_score >= 80 ? "bg-emerald-500" : c.teras_score >= 50 ? "bg-indigo-600" : "bg-rose-500"}`}
                          style={{ width: `${Math.min(c.teras_score, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-black text-slate-900 dark:text-white">{c.teras_score}</span>
                      <span className="ml-auto rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase dark:bg-emerald-500/20 dark:text-emerald-200">
                        {tr("admin.subscriptions.status.active")}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Actions empilées */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => navigate(`/admin/companies/${c.id}`)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <Eye size={12} /> {tr("admin.companies.detail")}
                  </button>
                  <button
                    onClick={() => setBroadcastTarget(c)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                  >
                    <Megaphone size={12} /> Broadcast
                  </button>
                  <button
                    onClick={() => suspendMut.mutate({ id: c.id, status: c.company_status === "suspended" ? "active" : "suspended" })}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${c.company_status === "suspended" ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20" : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"}`}
                  >
                    {c.company_status === "suspended" ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
                    {c.company_status === "suspended" ? tr("admin.subscriptions.reactivate", { defaultValue: "Réactiver" }) : tr("admin.subscriptions.suspend")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:border-white/10 dark:text-white/40">
                <tr>
                  <th className="px-4 py-3">{tr("admin.subscriptions.company")}</th>
                  <th className="px-4 py-3">{tr("admin.companies.fields.industry")}</th>
                  <th className="px-4 py-3">{tr("admin.companies.fields.country")}</th>
                  <th className="px-4 py-3">{tr("admin.companies.users")}</th>
                  <th className="px-4 py-3 w-32">TERAS</th>
                  <th className="px-4 py-3">{tr("common.status")}</th>
                  <th className="px-4 py-3">{tr("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-black text-white">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{c.name}</p>
                          <p className="text-xs text-slate-400 dark:text-white/40">{c.legal_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-white/60">{c.industry || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-white/60">{c.country || "—"}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{c.users_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden dark:bg-white/10">
                          <div
                            className={`h-full rounded-full ${c.teras_score >= 80 ? "bg-emerald-500" : c.teras_score >= 50 ? "bg-indigo-600" : "bg-rose-500"}`}
                            style={{ width: `${Math.min(c.teras_score, 100)}%` }}
                          />
                        </div>
                        <span className="font-black text-slate-900 dark:text-white w-6 text-right text-xs">{c.teras_score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase dark:bg-emerald-500/20 dark:text-emerald-200">
                        {tr("admin.subscriptions.status.active")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => navigate(`/admin/companies/${c.id}`)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                          title={tr("admin.companies.viewDetail")}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={() => setBroadcastTarget(c)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                          title="Broadcast"
                        >
                          <Megaphone size={13} />
                        </button>
                        <button
                          onClick={() => suspendMut.mutate({ id: c.id, status: c.company_status === "suspended" ? "active" : "suspended" })}
                          className={`grid h-7 w-7 place-items-center rounded-md border transition ${c.company_status === "suspended" ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"}`}
                          title={c.company_status === "suspended" ? tr("admin.subscriptions.reactivate", { defaultValue: "Réactiver" }) : tr("admin.subscriptions.suspend")}
                        >
                          {c.company_status === "suspended" ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400 dark:text-white/30">
              <Building2 size={36} className="mx-auto mb-3" />
              <p className="font-semibold">{companies.isLoading ? tr("common.loading") : tr("admin.companies.empty")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
