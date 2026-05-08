import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import { api } from "../../services/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  branch: string;
  account_status: string;
  company_id: number;
  company_name: string;
  last_login_at: string | null;
  created_at: string | null;
};

// ── Impersonate modal ─────────────────────────────────────────────────────────

function ImpersonateModal({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const [result, setResult] = useState<{ token: string; user_email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imp = useMutation({
    mutationFn: () => api.adminImpersonate(userId),
    onSuccess: (data) => setResult(data),
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
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
      <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl">
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
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-bold text-amber-200">
                Cette action génère un token JWT temporaire permettant d'accéder au compte de cet utilisateur.
                Utilisation à des fins de diagnostic uniquement. L'action est journalisée.
              </p>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
                Annuler
              </button>
              <button
                onClick={() => imp.mutate()}
                disabled={imp.isPending}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition"
              >
                {imp.isPending ? "Génération…" : "Générer le token"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-emerald-300 font-bold">Token généré pour {result.user_email}</p>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="break-all font-mono text-xs text-white/70">{result.token}</p>
            </div>
            <button
              onClick={copyToken}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-500 transition"
            >
              <Clipboard size={14} />
              {copied ? "Copié !" : "Copier dans le presse-papiers"}
            </button>
            <p className="text-[10px] text-white/40">
              Utilise ce token dans l'en-tête Authorization: Bearer [token] pour accéder à l'API en tant que cet utilisateur.
            </p>
            <button onClick={onClose} className="w-full rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reset password modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const [result, setResult] = useState<{ temp_password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.adminResetPassword(userId),
    onSuccess: (data) => setResult(data),
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  function copyPwd() {
    if (!result) return;
    navigator.clipboard.writeText(result.temp_password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Reset mot de passe</h2>
            <p className="text-xs text-white/50">{userName}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 text-white/60">
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              Un mot de passe temporaire sera généré. L'utilisateur devra le changer à sa prochaine connexion.
            </p>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
                Annuler
              </button>
              <button
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50 transition"
              >
                {reset.isPending ? "Réinitialisation…" : "Réinitialiser"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-bold text-emerald-300">Mot de passe temporaire généré</p>
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <code className="flex-1 text-base font-black tracking-wider text-white">{result.temp_password}</code>
              <button
                onClick={copyPwd}
                className="grid h-8 w-8 place-items-center rounded-md bg-violet-600/30 hover:bg-violet-600/50 transition"
              >
                <Clipboard size={13} className="text-violet-200" />
              </button>
            </div>
            {copied && <p className="text-xs text-emerald-300">Copié !</p>}
            <p className="text-[10px] text-white/40">
              Communique ce mot de passe à l'utilisateur de façon sécurisée. Il sera obligé de le changer à la prochaine connexion.
            </p>
            <button onClick={onClose} className="w-full rounded-lg border border-white/10 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(users: AdminUser[]) {
  const headers = ["ID", "Nom", "Email", "Role", "Entreprise", "Departement", "Branche", "Statut", "Derniere connexion", "Cree le"];
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

function relTime(dateStr: string | null) {
  if (!dateStr) return "Jamais";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
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
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">IAM</p>
          <h1 className="text-3xl font-black">Utilisateurs plateforme</h1>
          <p className="mt-1 text-sm text-white/60">Recherche cross-tenant, statut de comptes et rôles.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center">
            <p className="text-2xl font-black">{filtered.length}</p>
            <p className="text-[10px] font-bold uppercase text-white/40">comptes</p>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 transition"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 min-w-48 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
          <Search size={15} className="text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom ou email…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500"
        >
          <option value="">Toutes entreprises</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500"
        >
          <option value="">Tous rôles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500"
        >
          <option value="">Tous statuts</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
        </select>
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/30">
              <tr>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Entreprise</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Équipe</th>
                <th className="px-4 py-3">Indicateurs</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-white/5 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black text-sm">
                        {user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </span>
                      <div>
                        <p className="font-bold">{user.full_name}</p>
                        <p className="text-xs text-white/50">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">{user.company_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-bold text-violet-200">{user.role}</span>
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">{[user.department, user.branch].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-white/40">
                        Connexion: {relTime(user.last_login_at)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${user.account_status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                      {user.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* Suspend/Reactivate */}
                      <button
                        disabled={user.role === "super_admin" || updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: user.id, status: user.account_status === "active" ? "suspended" : "active" })}
                        title={user.account_status === "active" ? "Suspendre" : "Réactiver"}
                        className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
                      >
                        {user.account_status === "active" ? <ShieldOff size={13} className="text-rose-300" /> : <ShieldCheck size={13} className="text-emerald-300" />}
                      </button>

                      {/* Impersonate */}
                      <button
                        disabled={user.role === "super_admin"}
                        onClick={() => setImpersonateTarget(user)}
                        title="Impersonation"
                        className="grid h-8 w-8 place-items-center rounded-md border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 transition"
                      >
                        <User size={13} className="text-amber-300" />
                      </button>

                      {/* Reset password */}
                      <button
                        onClick={() => setResetTarget(user)}
                        title="Reset mot de passe"
                        className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition"
                      >
                        <KeyRound size={13} className="text-sky-300" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="grid place-items-center py-16 text-white/30">
            <Users size={36} />
            <p className="mt-3 text-sm font-semibold">
              {users.isLoading ? "Chargement…" : "Aucun utilisateur trouvé."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
