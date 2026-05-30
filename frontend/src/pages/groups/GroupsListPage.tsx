import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Users, X, Loader2, ChevronRight, MapPin } from "lucide-react";
import { api } from "../../services/api";
import type { OrganizationGroup } from "../../types/domain";

const GROUP_TYPES = [
  "association", "tontine", "mutuelle", "église", "ONG", "club sportif",
  "syndicat", "coopérative", "groupe familial", "groupe d'amis",
  "association étudiante", "comité de quartier", "organisation professionnelle",
  "groupe d'épargne", "groupe de solidarité", "bureau d'entreprise",
];

const TYPE_COLORS: Record<string, string> = {
  tontine: "bg-amber-100 text-amber-700",
  mutuelle: "bg-sky-100 text-sky-700",
  "ONG": "bg-emerald-100 text-emerald-700",
  association: "bg-violet-100 text-violet-700",
  "église": "bg-rose-100 text-rose-700",
  "club sportif": "bg-orange-100 text-orange-700",
};

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700";
}

export function GroupsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "association", city: "", currency: "XAF", description: "" });

  const { data: groups = [], isLoading } = useQuery({ queryKey: ["groups"], queryFn: api.groups });

  const create = useMutation({
    mutationFn: () => api.createGroup(form),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      setShowCreate(false);
      setForm({ name: "", type: "association", city: "", currency: "XAF", description: "" });
      navigate(`/groups/${g.id}/dashboard`);
    },
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#17211f] dark:text-white">Groupes & Organisations</h1>
          <p className="text-sm text-[#717182]">Gérez vos associations, tontines, mutuelles, ONG et collectifs</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 transition">
          <Plus size={16} /> Créer un groupe
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Groupes actifs", value: groups.filter(g => g.is_active).length, color: "text-violet-600" },
          { label: "Total membres", value: groups.reduce((s, g) => s + (g.member_count || 0), 0), color: "text-sky-600" },
          { label: "Types différents", value: new Set(groups.map(g => g.type)).size, color: "text-amber-600" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
            <p className="text-xs text-[#717182] font-medium">{stat.label}</p>
            <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-violet-50 dark:bg-violet-500/10 text-violet-600">
            <Building2 size={28} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#17211f] dark:text-white">Aucun groupe</h3>
          <p className="mt-1 text-sm text-[#717182] max-w-sm">Créez votre premier groupe pour gérer cotisations, membres et activités.</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700">
            <Plus size={14} /> Créer un groupe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(g => (
            <button key={g.id} onClick={() => navigate(`/groups/${g.id}/dashboard`)}
              className="group flex items-center gap-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 text-left hover:border-violet-300 dark:hover:border-violet-500/40 hover:shadow-md transition-all">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-black text-lg">
                {g.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#17211f] dark:text-white truncate">{g.name}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeColor(g.type)}`}>{g.type}</span>
                  {g.city && <span className="flex items-center gap-0.5 text-[11px] text-[#717182]"><MapPin size={10} />{g.city}</span>}
                  <span className="flex items-center gap-0.5 text-[11px] text-[#717182]"><Users size={10} />{g.member_count || 0} membres</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#717182] group-hover:text-violet-600 transition shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-[#17211f] dark:text-white">Créer un groupe</h2>
              <button onClick={() => setShowCreate(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06]">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Nom du groupe *
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Ex: Tontine des femmes de Bacongo"
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-violet-500 normal-case" />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Type d'organisation
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">
                  {GROUP_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  Ville
                  <input value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} placeholder="Brazzaville"
                    className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
                </label>
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  Devise
                  <select value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case">
                    {["XAF","USD","EUR","XOF","CDF"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Description
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={2}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
              </label>
            </div>
            {create.error && <p className="mt-2 text-sm text-rose-600">{(create.error as Error).message}</p>}
            <button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:bg-stone-300 transition">
              {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Créer et ouvrir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
