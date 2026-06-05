import { Building2, ChevronRight, Loader2, Plus, Users2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { initials } from "../utils/format";
import { LimuleIcon } from "../components/LimuleAvatar";

export function WorkspaceSelectPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [entering, setEntering] = useState<"company" | "group" | null>(null);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: api.groups,
  });

  // Si super_admin → directement admin
  useEffect(() => {
    if (user?.role === "super_admin") navigate("/admin", { replace: true });
  }, [user, navigate]);

  // Membre de groupe (sans accès entreprise) → directement vers ses groupes.
  useEffect(() => {
    if (user?.role !== "membre_groupe") return;
    if (groups.length === 1) navigate(`/groups/${groups[0].id}/dashboard`, { replace: true });
    else if (!groupsLoading) navigate("/groups", { replace: true });
  }, [user, groups, groupsLoading, navigate]);

  const isGroupOnly = user?.role === "membre_groupe";

  function enterCompany() {
    setEntering("company");
    navigate("/");
  }

  function enterGroup(groupId?: number) {
    setEntering("group");
    if (groupId) navigate(`/groups/${groupId}/dashboard`);
    else navigate("/groups");
  }

  const typeLabel: Record<string, string> = {
    association: "Association",
    tontine: "Tontine",
    mutuelle: "Mutuelle",
    "ONG": "ONG",
    "église": "Église",
    "club sportif": "Club sportif",
    syndicat: "Syndicat",
    "coopérative": "Coopérative",
    "groupe familial": "Groupe familial",
    "groupe d'amis": "Groupe d'amis",
    "groupe d'épargne": "Épargne",
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:bg-[#0d1117] dark:bg-none flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur border-b border-black/[0.05] dark:bg-[#111827] dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-black text-white text-sm shadow-sm shadow-emerald-500/30">K</div>
          <div>
            <span className="text-sm font-black text-[#17211f] dark:text-white">KOMPTA</span>
            <LimuleIcon size={13} className="ml-1.5 text-emerald-500" />
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="text-xs text-[#717182] hover:text-red-500 transition font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Déconnexion
        </button>
      </header>

      {/* Contenu */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Avatar + salutation */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-black text-white shadow-lg shadow-emerald-500/25">
            {initials(user?.full_name ?? "?")}
          </div>
          <h1 className="text-2xl font-black text-[#17211f] dark:text-white">
            Bonjour, {user?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-[#717182]">Choisissez l'espace dans lequel vous souhaitez travailler.</p>
        </div>

        {/* Cards espaces */}
        <div className="w-full max-w-lg space-y-3">

          {/* Espace Entreprise — masqué pour les membres de groupe sans accès entreprise */}
          {!isGroupOnly && (
          <button
            onClick={enterCompany}
            disabled={entering !== null}
            className="group w-full flex items-center gap-4 rounded-2xl border border-emerald-100 bg-white px-5 py-5 text-left shadow-sm shadow-emerald-500/10 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-500/15 transition-all disabled:opacity-60 dark:border-[#1f2937] dark:bg-[#111827] dark:hover:border-emerald-500/50"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shadow-emerald-600/25">
              <Building2 size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base font-black text-[#17211f] dark:text-white">Espace Entreprise</p>
                <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Pro</span>
              </div>
              <p className="text-sm text-[#717182] mt-0.5">Clients · Ventes · POS · Inventaire · Paie · Comptabilité · Fiscalité</p>
              {user?.branch && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">{user.branch}</p>
              )}
            </div>
            {entering === "company" ? (
              <Loader2 size={18} className="shrink-0 text-emerald-500 animate-spin" />
            ) : (
              <ChevronRight size={18} className="shrink-0 text-emerald-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all dark:text-[#c4c4cf] dark:group-hover:text-emerald-500" />
            )}
          </button>
          )}

          {/* Groupes existants */}
          {groupsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="text-[#717182] animate-spin" />
            </div>
          ) : groups.length > 0 ? (
            <>
              <div className="px-1 pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#aaaabc]">Mes groupes & organisations</p>
              </div>
              {groups.map((group: { id: number; name: string; type?: string }) => (
                <button
                  key={group.id}
                  onClick={() => enterGroup(group.id)}
                  disabled={entering !== null}
                  className="group w-full flex items-center gap-4 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-left shadow-sm shadow-blue-700/8 hover:border-blue-500 hover:shadow-md hover:shadow-blue-700/12 transition-all disabled:opacity-60 dark:border-[#1f2937] dark:bg-[#111827] dark:hover:border-blue-700/50"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 text-white font-black text-lg shadow-sm shadow-blue-700/20">
                    {(group.name?.[0] ?? "G").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#17211f] dark:text-white truncate">{group.name}</p>
                    <p className="text-xs text-[#717182] capitalize mt-0.5">{typeLabel[group.type ?? ""] ?? group.type ?? "Organisation"}</p>
                  </div>
                  {entering === "group" ? (
                    <Loader2 size={16} className="shrink-0 text-blue-700 animate-spin" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-blue-400 group-hover:text-blue-700 group-hover:translate-x-0.5 transition-all dark:text-[#c4c4cf]" />
                  )}
                </button>
              ))}
            </>
          ) : null}

          {/* Actions groupes */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => navigate("/groups")}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 text-sm font-semibold text-blue-800 hover:border-blue-500 hover:bg-blue-50 transition dark:border-[#374151] dark:bg-transparent dark:text-blue-500 dark:hover:border-blue-700/50"
            >
              <Users2 size={16} />
              Voir tous mes groupes
            </button>
            <button
              onClick={() => navigate("/register-group")}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 text-sm font-semibold text-blue-800 hover:border-blue-500 hover:bg-blue-50 transition dark:border-[#374151] dark:bg-transparent dark:text-blue-500 dark:hover:border-blue-700/50"
            >
              <Plus size={16} />
              Créer un groupe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
