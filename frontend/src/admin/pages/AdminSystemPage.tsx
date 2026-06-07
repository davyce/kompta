import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Edit2,
  HardDrive,
  Info,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Server,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useConfirm } from "../../components/ConfirmProvider";
import { api } from "../../services/api";
import i18n from "../../i18n";

type Tab = "flags" | "health" | "system" | "email";

// ── Feature flag types
type FeatureFlag = {
  id: number;
  key: string;
  description: string;
  value: string;
  enabled: boolean;
};

// ── Health check types
type ServiceHealth = {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms: number | null;
  last_check: string | null;
};

type SystemHealthResponse = {
  status?: string;
  services?: ServiceHealth[];
  uptime_seconds?: number;
  version?: string;
  environment?: string;
  database?: string;
  updated_at?: string;
};

function statusColors(status: ServiceHealth["status"]) {
  if (status === "healthy") return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200", text: "text-emerald-600 dark:text-emerald-300" };
  if (status === "degraded") return { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-200", text: "text-indigo-600 dark:text-indigo-300" };
  return { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200", text: "text-rose-600 dark:text-rose-300" };
}

function serviceIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("database") || n.includes("db") || n.includes("sql")) return Database;
  if (n.includes("ai") || n.includes("limule") || n.includes("ia")) return Zap;
  if (n.includes("storage") || n.includes("fichier") || n.includes("file")) return HardDrive;
  return Server;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function serviceStatusLabel(status: ServiceHealth["status"], tr: TFunction): string {
  if (status === "healthy") return tr("admin.system.serviceStatus.healthy");
  if (status === "degraded") return tr("admin.system.serviceStatus.degraded");
  return tr("admin.system.serviceStatus.down");
}

function serviceNameLabel(name: string, tr: TFunction): string {
  const n = name.toLowerCase();
  if (n === "database") return tr("admin.system.defaultServices.database");
  if (n.includes("limule")) return tr("admin.system.defaultServices.limule");
  if (n === "storage") return tr("admin.system.defaultServices.storage");
  return name;
}

// ── Flag modal
function FlagModal({
  flag,
  onClose,
  onSave,
}: {
  flag: Partial<FeatureFlag> | null;
  onClose: () => void;
  onSave: (data: { key: string; description: string; value: string; enabled: boolean }) => void;
}) {
  const { t: tr } = useTranslation();
  const [key, setKey] = useState(flag?.key ?? "");
  const [description, setDescription] = useState(flag?.description ?? "");
  const [value, setValue] = useState(flag?.value ?? "");
  const [enabled, setEnabled] = useState(flag?.enabled ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 text-white shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black">{flag?.id ? tr("admin.system.editFlag") : tr("admin.system.newFlag")}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">{tr("admin.system.key")}</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="feature_key"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">{tr("admin.subscriptions.fields.description")}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr("admin.system.flagDescriptionPlaceholder")}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">{tr("admin.system.value")}</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="true / false / custom_value"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-bold">{tr("admin.system.enabled")}</span>
            <button onClick={() => setEnabled((v) => !v)} className="text-indigo-300">
              {enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} className="text-white/40" />}
            </button>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            {tr("common.cancel")}
          </button>
          <button
            onClick={() => onSave({ key, description, value, enabled })}
            disabled={!key.trim()}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {tr("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Feature Flags tab
function FlagsTab() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { t: tr } = useTranslation();
  const [modal, setModal] = useState<Partial<FeatureFlag> | null | false>(false);

  const flags = useQuery({
    queryKey: ["adminFlags"],
    queryFn: api.adminSystemFlags,
  });

  const createFlag = useMutation({
    mutationFn: (data: { key: string; description: string; value: string; enabled: boolean }) =>
      api.adminCreateSystemFlag(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminFlags"] }),
  });

  const updateFlag = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FeatureFlag> }) =>
      api.adminUpdateSystemFlag(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminFlags"] }),
  });

  const deleteFlag = useMutation({
    mutationFn: (id: number) => api.adminDeleteSystemFlag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminFlags"] }),
  });

  function handleSave(data: { key: string; description: string; value: string; enabled: boolean }) {
    if (modal && typeof modal === "object" && "id" in modal && modal.id) {
      updateFlag.mutate({ id: modal.id, data });
    } else {
      createFlag.mutate(data);
    }
    setModal(false);
  }

  async function handleDeleteFlag(flag: FeatureFlag) {
    const ok = await confirm({
      title: tr("admin.system.confirmDeleteFlagTitle"),
      message: flag.key,
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deleteFlag.mutate(flag.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-500 dark:text-white/60">
          {tr("admin.system.flagsConfigured", { count: (flags.data ?? []).length })}
        </p>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500"
        >
          <Plus size={14} /> {tr("admin.system.newFlag")}
        </button>
      </div>

      {flags.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {!flags.isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-white/5">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 dark:bg-white/5 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3 text-left">{tr("admin.system.key")}</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">{tr("admin.subscriptions.fields.description")}</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">{tr("admin.system.value")}</th>
                <th className="px-4 py-3 text-center">{tr("admin.system.enabled")}</th>
                <th className="px-4 py-3 text-right">{tr("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {(flags.data ?? []).map((flag) => (
                <tr key={flag.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-200">{flag.key}</td>
                  <td className="px-4 py-3 hidden text-slate-500 dark:text-white/60 md:table-cell">{flag.description}</td>
                  <td className="px-4 py-3 hidden font-mono text-xs text-indigo-500 dark:text-indigo-200 lg:table-cell">{flag.value}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => updateFlag.mutate({ id: flag.id, data: { enabled: !flag.enabled } })}
                      className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-100"
                    >
                      {flag.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} className="text-slate-300 dark:text-white/30" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModal(flag)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteFlag(flag)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:text-white/40 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(flags.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-white/35">
                    {tr("admin.system.noFlags")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {modal !== false && (
        <FlagModal
          flag={modal ?? null}
          onClose={() => setModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Health Check tab
function HealthTab() {
  const { t: tr } = useTranslation();
  const health = useQuery<SystemHealthResponse>({
    queryKey: ["adminSystemHealth"],
    queryFn: api.adminSystemHealth,
    refetchInterval: 60_000,
  });

  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    health.refetch().finally(() => setTimeout(() => setSpinning(false), 700));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-500 dark:text-white/60">{tr("admin.system.lastAutoCheck")}</p>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
        >
          <RefreshCw size={14} className={spinning ? "animate-spin" : ""} /> {tr("admin.subscriptions.refresh")}
        </button>
      </div>

      {health.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {!health.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(health.data?.services ?? defaultServices).map((svc) => {
            const colors = statusColors(svc.status);
            const Icon = serviceIcon(svc.name);
            return (
              <div key={svc.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 dark:bg-white/5">
                      <Icon size={16} className="text-indigo-500 dark:text-indigo-300" />
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{serviceNameLabel(svc.name, tr)}</span>
                  </div>
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${colors.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                    {serviceStatusLabel(svc.status, tr)}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500 dark:text-white/50">
                  <div className="flex justify-between">
                    <span>{tr("admin.system.latency")}</span>
                    <span className={`font-bold ${svc.latency_ms != null ? colors.text : "text-slate-400 dark:text-white/30"}`}>
                      {svc.latency_ms != null ? `${svc.latency_ms}ms` : "–"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tr("admin.system.lastCheck")}</span>
                    <span className="font-bold text-slate-500 dark:text-white/50">
                      {svc.last_check ? new Date(svc.last_check).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : "–"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const defaultServices: ServiceHealth[] = [
  { name: "Database", status: "healthy", latency_ms: null, last_check: null },
  { name: "Limule IA", status: "healthy", latency_ms: null, last_check: null },
  { name: "Storage", status: "healthy", latency_ms: null, last_check: null },
];

// ── System Info tab
function SystemInfoTab() {
  const { t: tr } = useTranslation();
  const health = useQuery<SystemHealthResponse>({
    queryKey: ["adminSystemHealth"],
    queryFn: api.adminSystemHealth,
  });

  const rows = [
    { label: tr("admin.system.info.version"), value: health.data?.version ?? "v1.6.0", icon: Info },
    { label: tr("admin.system.info.environment"), value: health.data?.environment ?? "production", icon: Server },
    { label: tr("admin.system.info.database"), value: health.data?.database ?? "SQLite", icon: Database },
    { label: tr("admin.system.info.updatedAt"), value: health.data?.updated_at ? new Date(health.data.updated_at).toLocaleDateString(i18n.language) : new Date("2026-05-08T12:00:00").toLocaleDateString(i18n.language), icon: Clock },
    {
      label: "Uptime",
      value: health.data?.uptime_seconds != null ? formatUptime(health.data.uptime_seconds) : "–",
      icon: CheckCircle,
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/5 dark:divide-white/10">
      {rows.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Icon size={14} />
            </span>
            <span className="text-sm font-bold text-slate-600 dark:text-white/70">{label}</span>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-mono font-bold text-slate-900 dark:bg-white/10 dark:text-white">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page
export function AdminSystemPage() {
  const { t: tr } = useTranslation();
  const [tab, setTab] = useState<Tab>("flags");

  const TABS: { key: Tab; label: string; icon: typeof Server }[] = [
    { key: "flags", label: tr("admin.system.tabs.flags"), icon: ToggleRight },
    { key: "health", label: tr("admin.system.tabs.health"), icon: CheckCircle },
    { key: "email", label: tr("admin.system.tabs.email"), icon: Mail },
    { key: "system", label: tr("admin.system.tabs.system"), icon: Info },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{tr("admin.system.eyebrow")}</p>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">{tr("admin.system.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{tr("admin.system.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1 dark:border-white/10">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold transition-colors ${
                tab === t.key
                  ? "border-b-2 border-indigo-500 text-indigo-700 dark:border-indigo-400 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "flags" && <FlagsTab />}
      {tab === "health" && <HealthTab />}
      {tab === "email" && <EmailTab />}
      {tab === "system" && <SystemInfoTab />}
    </div>
  );
}

// ── Email SMTP tab ────────────────────────────────────────────────────────────
function EmailTab() {
  const { t: tr } = useTranslation();
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ok: boolean; msg: string} | null>(null);
  const [sending, setSending] = useState(false);

  const status = useQuery({
    queryKey: ["adminEmailStatus"],
    queryFn: () => api.adminEmailStatus(),
    retry: false,
  });

  async function handleTest() {
    if (!testTo.trim()) return;
    setSending(true);
    setTestResult(null);
    try {
      const r = await api.adminTestEmail(testTo.trim());
      setTestResult({ ok: r.sent, msg: r.message });
    } catch {
      setTestResult({ ok: false, msg: tr("admin.system.email.sendError") });
    } finally {
      setSending(false);
    }
  }

  const s = status.data;

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <h3 className="mb-4 font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Mail size={16} className="text-indigo-500 dark:text-indigo-300" /> {tr("admin.system.email.smtpConfig")}
        </h3>
        {status.isLoading ? (
          <p className="text-sm text-slate-400 dark:text-white/40 animate-pulse">{tr("common.loading")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: tr("common.status"), value: s?.enabled ? tr("admin.system.email.enabledValue") : tr("admin.system.email.notConfiguredValue") },
              { label: tr("admin.system.email.server"), value: s?.host || "—" },
              { label: tr("admin.system.email.sender"), value: s?.from || "—" },
              { label: "Provider", value: s?.provider || "SMTP" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-white/5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/40">{label}</p>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        )}
        {!s?.enabled && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-amber-50 p-4 text-sm text-indigo-700 dark:border-indigo-600/30 dark:bg-indigo-600/10 dark:text-indigo-200">
            <p className="font-bold">{tr("admin.system.email.requiredConfig")}</p>
            <p className="mt-1 opacity-80">{tr("admin.system.email.addToEnv")} <code className="font-mono bg-slate-200 dark:bg-white/10 px-1 rounded">.env</code> :</p>
            <pre className="mt-2 rounded bg-slate-100 dark:bg-black/30 p-3 text-xs font-mono overflow-x-auto">{`SMTP_HOST=smtp.mailjet.com
SMTP_PORT=587
SMTP_USER=votre-api-key
SMTP_PASSWORD=votre-secret
SMTP_FROM_EMAIL=noreply@votre-domaine.com`}</pre>
          </div>
        )}
      </div>

      {/* Test email */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <h3 className="mb-4 font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Send size={16} className="text-indigo-500 dark:text-indigo-300" /> {tr("admin.system.email.testConfig")}
        </h3>
        <div className="flex flex-wrap gap-3">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="email@test.com"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
          />
          <button
            onClick={handleTest}
            disabled={sending || !testTo.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? tr("admin.companies.sending") : tr("admin.system.email.sendTest")}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold ${testResult.ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"}`}>
            {testResult.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            {testResult.msg}
          </div>
        )}
      </div>

      {/* Automatic emails */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="mb-4 font-black text-white">{tr("admin.system.email.automaticEmails")}</h3>
        <div className="space-y-2">
          {[
            { label: tr("admin.system.email.automatic.unpaidInvoice"), trigger: "POST /invoices/{id}/relance", active: true },
            { label: tr("admin.system.email.automatic.passwordReset"), trigger: "POST /admin/users/{id}/reset-password", active: true },
            { label: tr("admin.system.email.automatic.broadcast"), trigger: "POST /admin/broadcast", active: true },
            { label: tr("admin.system.email.automatic.newUserWelcome"), trigger: "POST /users (invitation)", active: false },
            { label: tr("admin.system.email.automatic.twoFactor"), trigger: "POST /auth/2fa/enable", active: true },
          ].map(({ label, trigger, active }) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">{label}</p>
                <p className="text-xs font-mono text-white/40">{trigger}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>
                {active ? tr("admin.subscriptions.status.active") : tr("admin.system.comingSoon")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
