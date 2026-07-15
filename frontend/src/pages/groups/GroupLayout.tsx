import { Link, Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutDashboard, Users, CreditCard, Wallet, ShoppingBag,
  Calendar, Cake, MessageCircle, FileText, Vote, Crown, BarChart3, Settings,
  ChevronRight, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { LimuleIcon } from "../../components/LimuleAvatar";

const NAV_ITEMS = [
  { key: "dashboard",      tk: "groupPages.layout.nav.dashboard",      icon: LayoutDashboard },
  { key: "members",        tk: "groupPages.layout.nav.members",        icon: Users },
  { key: "contributions",  tk: "groupPages.layout.nav.contributions",  icon: CreditCard },
  { key: "transactions",   tk: "groupPages.layout.nav.transactions",   icon: Wallet },
  { key: "expenses",       tk: "groupPages.layout.nav.expenses",       icon: ShoppingBag },
  { key: "calendar",       tk: "groupPages.layout.nav.calendar",       icon: Calendar },
  { key: "birthdays",      tk: "groupPages.layout.nav.birthdays",      icon: Cake },
  { key: "meetings",       tk: "groupPages.layout.nav.meetings",       icon: Calendar },
  { key: "chat",           tk: "groupPages.layout.nav.chat",           icon: MessageCircle },
  { key: "documents",      tk: "groupPages.layout.nav.documents",      icon: FileText },
  { key: "votes",          tk: "groupPages.layout.nav.votes",          icon: Vote },
  { key: "leadership",     tk: "groupPages.layout.nav.leadership",     icon: Crown },
  { key: "ai-assistant",   tk: "groupPages.layout.nav.aiAssistant",    icon: LimuleIcon },
  { key: "reports",        tk: "groupPages.layout.nav.reports",        icon: BarChart3 },
  { key: "settings",       tk: "groupPages.layout.nav.settings",       icon: Settings },
];

export function GroupLayout() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const location = useLocation();
  const navigate = useNavigate();
  // Fermé par défaut : sur mobile c'est un tiroir overlay, sur desktop (md+) la
  // sidebar est toujours affichée via `md:flex`.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: group } = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.group(id),
    enabled: !!id,
  });

  const currentKey = location.pathname.split("/")[3] || "dashboard";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-white dark:bg-[#1e2229]">
      {/* Backdrop mobile — ferme le tiroir au clic */}
      {sidebarOpen && (
        <button
          aria-label={tr("groupPages.layout.closeMenu")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      {/* Sidebar — tiroir overlay sur mobile, statique sur desktop */}
      <aside className={`${sidebarOpen ? "flex" : "hidden"} md:flex fixed md:static top-14 bottom-0 md:top-auto md:bottom-auto md:inset-y-0 left-0 z-40 w-64 shrink-0 flex-col overflow-hidden border-r border-black/[0.05] dark:border-white/[0.05] bg-[#f6f7fb] dark:bg-[#161920] shadow-xl md:shadow-none md:z-auto`}>
        {/* Group header */}
        <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.05]">
          <button onClick={() => navigate("/groups")} className="flex items-center gap-1.5 text-xs text-[#717182] hover:text-blue-800 mb-3 transition">
            <ArrowLeft size={12} /> {tr("groupPages.layout.allGroups")}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 text-white font-black text-base">
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
                  active ? "bg-blue-100 dark:bg-blue-800/15 font-semibold text-blue-900 dark:text-blue-400"
                         : "text-[#17211f] dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                }`}>
                <item.icon size={15} className={active ? "text-blue-700" : "text-[#717182]"} />
                <span className="flex-1">{tr(item.tk)}</span>
                {active && <ChevronRight size={12} className="text-blue-500" />}
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
