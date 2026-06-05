import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, X, Loader2, UserCheck, UserX, UserPlus, Key, Copy, Check, Trash2, RotateCcw } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { useConfirm } from "../../components/ConfirmProvider";

export function GroupMembersPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", zone: "", profession: "", date_of_birth: "", member_number: "" });
  const [provisionResult, setProvisionResult] = useState<null | { created: boolean; login_identifier: string; temporary_password?: string; message: string }>(null);
  const [copied, setCopied] = useState(false);

  const { data: members = [], isLoading } = useQuery({ queryKey: ["group-members", id], queryFn: () => api.groupMembers(id) });
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });

  const add = useMutation({
    mutationFn: () => api.addMember(id, { ...form, date_of_birth: form.date_of_birth || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-members", id] }); setShowAdd(false); setForm({ full_name: "", phone: "", email: "", zone: "", profession: "", date_of_birth: "", member_number: "" }); },
  });

  const toast = useToast();
  const { confirm } = useConfirm();

  const provision = useMutation({
    mutationFn: (memberId: number) => api.provisionMemberAccount(id, memberId),
    onSuccess: (data) => setProvisionResult(data),
  });

  const resetAccess = useMutation({
    mutationFn: (memberId: number) => api.resetMemberAccess(id, memberId),
    onSuccess: (data) => setProvisionResult({ created: false, login_identifier: data.login_identifier, temporary_password: data.temporary_password, message: data.message }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Réinitialisation impossible"),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.deleteGroupMember(id, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-members", id] }); toast.success("Membre retiré du groupe"); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Suppression impossible"),
  });

  async function handleRemove(memberId: number, name: string) {
    const ok = await confirm({
      title: `Retirer ${name} du groupe ?`,
      message: "Son compte KOMPTA sera désactivé. Tu pourras le réactiver plus tard via « Générer un accès ».",
      confirmLabel: "Retirer le membre",
      danger: true,
    });
    if (ok) removeMember.mutate(memberId);
  }

  async function handleReset(memberId: number, name: string) {
    const ok = await confirm({
      title: `Réinitialiser l'accès de ${name} ?`,
      message: "Un nouveau mot de passe temporaire sera généré. Ses sessions actives seront révoquées.",
      confirmLabel: "Réinitialiser",
    });
    if (ok) resetAccess.mutate(memberId);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const filtered = members.filter(m => m.full_name.toLowerCase().includes(search.toLowerCase()) || (m.zone || "").toLowerCase().includes(search.toLowerCase()));
  const zones = [...new Set(members.map(m => m.zone).filter(Boolean))];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#17211f] dark:text-white">Membres</h2>
          <p className="text-sm text-[#717182]">{members.length} membre{members.length > 1 ? "s" : ""} au total</p>
        </div>
        {group?.can_manage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 transition">
            <Plus size={15} /> Ajouter
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#252931] px-3 py-2 flex-1 max-w-xs">
          <Search size={14} className="text-[#717182]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="bg-transparent text-sm outline-none text-[#17211f] dark:text-white placeholder:text-[#717182]" />
        </div>
      </div>

      {/* Stats par zone */}
      {zones.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {zones.map(z => <span key={z} className="rounded-full bg-blue-50 dark:bg-blue-800/10 px-3 py-1 text-xs font-bold text-blue-900 dark:text-blue-400">{z} ({members.filter(m => m.zone === z).length})</span>)}
        </div>
      )}

      {/* Liste membres — cartes sur mobile, table sur desktop */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />)}</div>
      ) : (
        <>
          {/* Mobile : cartes */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filtered.map(m => (
              <div key={m.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 text-white text-sm font-bold">
                      {m.full_name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-[#17211f] dark:text-white">{m.full_name}</p>
                      <p className="text-[11px] text-[#717182]">{m.phone || m.email || "—"}</p>
                      {m.zone && <p className="text-[11px] text-blue-800 dark:text-blue-400">{m.zone}</p>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-100 text-rose-700"}`}>
                    {m.is_active ? <UserCheck size={10} /> : <UserX size={10} />}
                    {m.status === "active" ? "Actif" : m.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.roles.map(r => <span key={r} className="rounded-full bg-sky-100 dark:bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">{r}</span>)}
                  {m.roles.length === 0 && <span className="text-[#717182] text-xs">Membre</span>}
                </div>
                {group?.can_manage && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => provision.mutate(m.id)}
                      disabled={provision.isPending}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-700/30 px-2 py-1.5 text-[11px] font-semibold text-blue-900 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-800/10 transition"
                    >
                      {provision.isPending ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                      Accès
                    </button>
                    <button
                      onClick={() => handleReset(m.id, m.full_name)}
                      disabled={resetAccess.isPending}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 px-2 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition"
                      title="Réinitialiser le mot de passe"
                    >
                      {resetAccess.isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Reset
                    </button>
                    <button
                      onClick={() => handleRemove(m.id, m.full_name)}
                      disabled={removeMember.isPending}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 px-2 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                    >
                      {removeMember.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      Retirer du groupe
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop : table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] dark:border-white/[0.06] bg-[#f6f7fb] dark:bg-[#161920]">
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Membre</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Zone</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Rôles</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Statut</th>
                  {group?.can_manage && <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Compte</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 text-white text-xs font-bold">
                          {m.full_name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[#17211f] dark:text-white">{m.full_name}</p>
                          <p className="text-[11px] text-[#717182]">{m.phone || m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#717182]">{m.zone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.roles.map(r => <span key={r} className="rounded-full bg-sky-100 dark:bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">{r}</span>)}
                        {m.roles.length === 0 && <span className="text-[#717182] text-xs">Membre</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-100 text-rose-700"}`}>
                        {m.is_active ? <UserCheck size={10} /> : <UserX size={10} />}
                        {m.status === "active" ? "Actif" : m.status}
                      </span>
                    </td>
                    {group?.can_manage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => provision.mutate(m.id)}
                          disabled={provision.isPending}
                          className="flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-700/30 px-2.5 py-1 text-xs font-semibold text-blue-900 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-800/10 transition"
                        >
                          {provision.isPending ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                          Accès
                        </button>
                        <button
                          onClick={() => handleReset(m.id, m.full_name)}
                          disabled={resetAccess.isPending}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition"
                          title="Réinitialiser le mot de passe"
                        >
                          {resetAccess.isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Reset
                        </button>
                        <button
                          onClick={() => handleRemove(m.id, m.full_name)}
                          disabled={removeMember.isPending}
                          className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                          title="Retirer du groupe"
                        >
                          {removeMember.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#717182]">Aucun membre trouvé.</p>}
          </div>
        </>
      )}

      {/* Résultat provisioning */}
      {provisionResult && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#17211f] dark:text-white flex items-center gap-2">
                <Key size={18} className="text-blue-800" />
                {provisionResult.created ? "Compte créé" : "Compte existant"}
              </h3>
              <button onClick={() => setProvisionResult(null)}><X size={16} className="text-[#717182]" /></button>
            </div>
            <p className="text-sm text-[#717182] mb-4">{provisionResult.message}</p>
            <div className="space-y-2">
              <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#252931] px-4 py-3">
                <p className="text-[11px] font-bold uppercase text-[#717182] mb-1.5">Identifiant de connexion</p>
                {/* Input cliquable pour copier l'identifiant sans ambiguïté */}
                <input
                  type="text"
                  readOnly
                  value={provisionResult.login_identifier}
                  onClick={(e) => { (e.target as HTMLInputElement).select(); copyToClipboard(provisionResult.login_identifier); }}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontVariantLigatures: "none" }}
                  className="w-full bg-transparent text-base font-bold text-[#17211f] dark:text-white border-0 outline-none cursor-pointer select-all"
                />
              </div>
              {provisionResult.temporary_password && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Mot de passe temporaire</p>
                    <button onClick={() => copyToClipboard(provisionResult.temporary_password!)} className="text-emerald-600 hover:text-emerald-700 transition flex items-center gap-1 text-xs font-semibold">
                      {copied ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
                    </button>
                  </div>
                  {/* Input readonly — copier-coller fiable, pas de transformation typographique */}
                  <input
                    type="text"
                    readOnly
                    value={provisionResult.temporary_password}
                    onClick={(e) => { (e.target as HTMLInputElement).select(); copyToClipboard(provisionResult.temporary_password!); }}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontVariantLigatures: "none", letterSpacing: "0.5px" }}
                    className="w-full bg-white dark:bg-[#1e2229] rounded-lg px-3 py-2 text-base font-bold text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500/40 outline-none cursor-pointer select-all"
                  />
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-[#717182]">⚠️ Transmets ce mot de passe via un canal sécurisé. Il sera changé à la première connexion. Le mot de passe contient des <strong>tirets simples (-)</strong>, pas des tirets longs.</p>
            <button onClick={() => setProvisionResult(null)} className="mt-4 w-full rounded-xl bg-blue-800 py-2.5 text-sm font-bold text-white hover:bg-blue-900 transition">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Modal ajout membre */}
      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#17211f] dark:text-white">Ajouter un membre</h3>
              <button onClick={() => setShowAdd(false)}><X size={16} className="text-[#717182]" /></button>
            </div>
            <div className="space-y-3">
              {[["full_name","Nom complet *","Amina Moussa"], ["phone","Téléphone","+242060000000"], ["email","Email","amina@example.com"], ["zone","Zone / Quartier","Bacongo"], ["profession","Profession","Commerçante"]].map(([field, label, placeholder]) => (
                <label key={field} className="block text-xs font-bold uppercase text-[#717182]">
                  {label}
                  <input value={(form as Record<string, string>)[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))} placeholder={placeholder}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700" />
                </label>
              ))}
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Date de naissance
                <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({...f, date_of_birth: e.target.value}))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
              </label>
            </div>
            {add.error && <p className="mt-2 text-sm text-rose-600">{(add.error as Error).message}</p>}
            <button disabled={!form.full_name.trim() || add.isPending} onClick={() => add.mutate()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 py-3 text-sm font-black text-white hover:bg-blue-900 disabled:bg-stone-300 transition">
              {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />} Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
