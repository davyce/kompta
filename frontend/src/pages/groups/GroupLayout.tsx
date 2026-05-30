import { Link, Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutDashboard, Users, CreditCard, Wallet, ShoppingBag,
  Calendar, MessageCircle, FileText, Vote, Crown, Bot, BarChart3, Settings,
  ChevronRight, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../services/api";

const NAV_ITEMS = [
  { key: "dashboard",      label: "Tableau de bord",  icon: LayoutDashboard },
  { key: "members",        label: "Membres",           icon: Users },
  { key: "contributions",  label: "Cotisations",       icon: CreditCard },
  { key: "transactions",   label: "Caisse",            icon: Wallet },
  { key: "expenses",       label: "Dépenses",          icon: ShoppingBag },
  { key: "calendar",       label: "Calendrier",        icon: Calendar },
  { key: "meetings",       label: "Réunions",          icon: Calendar },
  { key: "chat",           label: "Chat",              icon: MessageCircle },
  { key: "documents",      label: "Documents",         icon: FileText },
  { key: "votes",          label: "Votes",             icon: Vote },
  { key: "leadership",     label: "Bureau & Mandats",  icon: Crown },
  { key: "ai-assistant",   label: "Assistant IA",      icon: Bot },
  { key: "reports",        label: "Rapports",          icon: BarChart3 },
  { key: "settings",       label: "Paramètres",        icon: Settings },
];

export function GroupLayout() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: group } = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.group(id),
    enabled: !!id,
  });

  const currentKey = location.pathname.split("/")[3] || "dashboard";

  return (
    <div className="flex h-[calc(100vh-3.5rem-2rem)] overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1e2229]">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "flex" : "hidden"} md:flex w-64 shrink-0 flex-col border-r border-black/[0.05] dark:border-white/[0.05] bg-[#f6f7fb] dark:bg-[#161920]`}>
        {/* Group header */}
        <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.05]">
          <button onClick={() => navigate("/groups")} className="flex items-center gap-1.5 text-xs text-[#717182] hover:text-violet-600 mb-3 transition">
            <ArrowLeft size={12} /> Tous les groupes
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-black text-base">
              {group?.name?.[0]?.toUpperCase() ?? "G"}
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm text-[#17211f] dark:text-white truncate">{group?.name ?? "…"}</p>
              <p className="text-[11px] text-[#717182] capitalize">{group?.type}</p>
            </div>
          </div>
        </div>
        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const active = currentKey === item.key;
            return (
              <Link key={item.key} to={`/groups/${id}/${item.key}`}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-violet-100 dark:bg-violet-500/20 font-semibold text-violet-700 dark:text-violet-300"
                         : "text-[#17211f] dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                }`}>
                <item.icon size={15} className={active ? "text-violet-500" : "text-[#717182]"} />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight size={12} className="text-violet-400" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-black/[0.05] dark:border-white/[0.05] px-4 py-3 md:hidden">
          <button onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="font-bold text-sm text-[#17211f] dark:text-white">{group?.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
