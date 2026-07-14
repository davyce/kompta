import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Users, X, Loader2, ChevronRight, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  association: "bg-blue-100 text-blue-900",
  "église": "bg-rose-100 text-rose-700",
  "club sportif": "bg-orange-100 text-orange-700",
};

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700";
}

export function GroupsListPage() {
  const { t: tr } = useTranslation();
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
    <div className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-black text-[#17211f] dark:text-white truncate">{tr("groupPages.list.title")}</h1>
          <p className="text-xs sm:text-sm text-[#717182] truncate">{tr("groupPages.list.subtitle")}</p>
        </div>
        <button
          onClick={() => navigate("/register-group")}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-800 px-3 sm:px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 transition whitespace-nowrap"
        >
          <Plus size={15} /> <span className="hidden sm:inline">{tr("common.create")}</span><span className="sm:hidden">+</span>
        </button>
      </div>

      {/* Stats */}
      {groups.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: tr("groupPages.list.stats.groups"), value: groups.filter(g => g.is_active).length, color: "text-blue-800" },
            { label: tr("groupPages.list.stats.members"), value: groups.reduce((s, g) => s + (g.member_count || 0), 0), color: "text-sky-600" },
            { label: tr("groupPages.list.stats.types"), value: new Set(groups.map(g => g.type)).size, color: "text-amber-600" },
          ].map(stat => (
            <div key={stat.label} className="min-w-0 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3 sm:p-4">
              <p className="truncate text-[10px] sm:text-xs text-[#717182] font-medium">{stat.label}</p>
              <p className={`text-xl sm:text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 dark:bg-blue-800/10 text-blue-800">
            <Building2 size={28} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#17211f] dark:text-white">{tr("groupPages.list.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-[#717182] max-w-xs px-4">{tr("groupPages.list.emptyBody")}</p>
          <button
            onClick={() => navigate("/register-group")}
            className="mt-5 flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900"
          >
            <Plus size={14} /> {tr("groupPages.list.createGroup")}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          {groups.map(g => (
            <button key={g.id} onClick={() => navigate(`/groups/${g.id}/dashboard`)}
              className="group w-full flex items-center gap-3 sm:gap-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3.5 sm:p-4 text-left hover:border-blue-400 dark:hover:border-blue-700/40 hover:shadow-md transition-all active:scale-[0.98]">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 text-white font-black text-base sm:text-lg">
                {g.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#17211f] dark:text-white truncate text-sm sm:text-base">{g.name}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeColor(g.type)}`}>{g.type}</span>
                  {g.city && <span className="flex items-center gap-0.5 text-[11px] text-[#717182]"><MapPin size={9} />{g.city}</span>}
                  <span className="flex items-center gap-0.5 text-[11px] text-[#717182]"><Users size={9} />{g.member_count || 0}</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#717182] group-hover:text-blue-800 transition shrink-0" />
            </button>
          ))}
        </div>
      )}


      {/* CTA bannière si aucun groupe */}
      {!isLoading && groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-blue-400 dark:border-blue-700/30 bg-blue-50 dark:bg-blue-700/5 p-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <div className="text-sm text-blue-900 dark:text-blue-400">
            <p className="font-bold">{tr("groupPages.list.tipTitle")}</p>
            <p className="text-xs mt-0.5">{tr("groupPages.list.tipBody")}</p>
          </div>
          <button
            onClick={() => navigate("/register-group")}
            className="shrink-0 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 transition"
          >
            {tr("groupPages.list.start")}
          </button>
        </div>
      )}
    </div>
  );
}
