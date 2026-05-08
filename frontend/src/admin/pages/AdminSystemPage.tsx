import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Edit2,
  HardDrive,
  Info,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../services/api";

type Tab = "flags" | "health" | "system";

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
  services: ServiceHealth[];
  uptime_seconds?: number;
  version?: string;
  environment?: string;
  database?: string;
  updated_at?: string;
};

function statusColors(status: ServiceHealth["status"]) {
  if (status === "healthy") return { dot: "bg-emerald-500", badge: "bg-emerald-500/20 text-emerald-200", text: "text-emerald-300" };
  if (status === "degraded") return { dot: "bg-amber-400", badge: "bg-amber-500/20 text-amber-200", text: "text-amber-300" };
  return { dot: "bg-rose-500", badge: "bg-rose-500/20 text-rose-200", text: "text-rose-300" };
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
  const [key, setKey] = useState(flag?.key ?? "");
  const [description, setDescription] = useState(flag?.description ?? "");
  const [value, setValue] = useState(flag?.value ?? "");
  const [enabled, setEnabled] = useState(flag?.enabled ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black">{flag?.id ? "Modifier le flag" : "Nouveau flag"}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">Clé</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="feature_key"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du flag..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-white/50">Valeur</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="true / false / custom_value"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-violet-400"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-bold">Activé</span>
            <button onClick={() => setEnabled((v) => !v)} className="text-violet-300">
              {enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} className="text-white/40" />}
            </button>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave({ key, description, value, enabled })}
            disabled={!key.trim()}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Feature Flags tab
function FlagsTab() {
  const qc = useQueryClient();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white/60">
          {(flags.data ?? []).length} flag(s) configuré(s)
        </p>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          <Plus size={14} /> Nouveau flag
        </button>
      </div>

      {flags.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      )}

      {!flags.isLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs font-bold uppercase text-white/40">
                <th className="px-4 py-3 text-left">Clé</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Valeur</th>
                <th className="px-4 py-3 text-center">Activé</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(flags.data ?? []).map((flag) => (
                <tr key={flag.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-violet-200">{flag.key}</td>
                  <td className="px-4 py-3 hidden text-white/60 md:table-cell">{flag.description}</td>
                  <td className="px-4 py-3 hidden font-mono text-xs text-fuchsia-200 lg:table-cell">{flag.value}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => updateFlag.mutate({ id: flag.id, data: { enabled: !flag.enabled } })}
                      className="text-violet-300 hover:text-violet-100"
                    >
                      {flag.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} className="text-white/30" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModal(flag)}
                        className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer "${flag.key}" ?`)) deleteFlag.mutate(flag.id);
                        }}
                        className="rounded-lg p-1.5 text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(flags.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-white/35">
                    Aucun feature flag configuré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        <p className="text-sm font-bold text-white/60">Dernière vérification: auto toutes les 60s</p>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
        >
          <RefreshCw size={14} className={spinning ? "animate-spin" : ""} /> Rafraîchir
        </button>
      </div>

      {health.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      )}

      {!health.isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(health.data?.services ?? defaultServices).map((svc) => {
            const colors = statusColors(svc.status);
            const Icon = serviceIcon(svc.name);
            return (
              <div key={svc.name} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5">
                      <Icon size={16} className="text-violet-300" />
                    </span>
                    <span className="font-bold">{svc.name}</span>
                  </div>
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${colors.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                    {svc.status === "healthy" ? "Opérationnel" : svc.status === "degraded" ? "Dégradé" : "Hors ligne"}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-white/50">
                  <div className="flex justify-between">
                    <span>Latence</span>
                    <span className={`font-bold ${svc.latency_ms != null ? colors.text : "text-white/30"}`}>
                      {svc.latency_ms != null ? `${svc.latency_ms}ms` : "–"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dernier check</span>
                    <span className="font-bold text-white/50">
                      {svc.last_check ? new Date(svc.last_check).toLocaleTimeString("fr-FR") : "–"}
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
  const health = useQuery<SystemHealthResponse>({
    queryKey: ["adminSystemHealth"],
    queryFn: api.adminSystemHealth,
  });

  const rows = [
    { label: "Version application", value: health.data?.version ?? "v1.6.0", icon: Info },
    { label: "Environnement", value: health.data?.environment ?? "production", icon: Server },
    { label: "Base de données", value: health.data?.database ?? "SQLite", icon: Database },
    { label: "Dernière mise à jour", value: health.data?.updated_at ? new Date(health.data.updated_at).toLocaleDateString("fr-FR") : "08/05/2026", icon: Clock },
    {
      label: "Uptime",
      value: health.data?.uptime_seconds != null ? formatUptime(health.data.uptime_seconds) : "–",
      icon: CheckCircle,
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10">
      {rows.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/15 text-violet-300">
              <Icon size={14} />
            </span>
            <span className="text-sm font-bold text-white/70">{label}</span>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-mono font-bold text-white">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page
export function AdminSystemPage() {
  const [tab, setTab] = useState<Tab>("flags");

  const TABS: { key: Tab; label: string; icon: typeof Server }[] = [
    { key: "flags", label: "Feature Flags", icon: ToggleRight },
    { key: "health", label: "Health Check", icon: CheckCircle },
    { key: "system", label: "Informations système", icon: Info },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Administration</p>
        <h1 className="text-3xl font-black">Système</h1>
        <p className="mt-1 text-sm text-white/60">Feature flags, santé des services et informations système.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold transition-colors ${
                tab === t.key
                  ? "border-b-2 border-violet-400 text-white"
                  : "text-white/50 hover:text-white"
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
      {tab === "system" && <SystemInfoTab />}
    </div>
  );
}
