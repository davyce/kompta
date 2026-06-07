import {
  BarChart2,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  Calculator,
  ChartNoAxesCombined,
  TrendingUp,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderArchive,
  HandCoins,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PiggyBank,
  Plus,
  Sun,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Boxes,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { CommandPalette } from "../components/CommandPalette";
import { Copilot } from "../components/Copilot";
import { NotificationCenter } from "../components/NotificationCenter";
import { GuidedTour } from "../components/GuidedTour";
import { SubscriptionGate } from "../components/SubscriptionGate";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { ToastStack } from "../components/Toast";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";
import { useTheme } from "../hooks/useTheme";
import { useCompact } from "../contexts/CompactContext";
import { useNotificationsPolling } from "../hooks/useNotifications";
import { useWebSocketNotifications } from "../hooks/useWebSocketNotifications";
import { ApiError, api } from "../services/api";
import { useQuery } from "@tanstack/react-query";
import { initials } from "../utils/format";
import { useAuth } from "./AuthContext";

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Limule status chip shown in the topbar */
function LimuleStatus() {
  const { data } = useQuery({
    queryKey: ["ai-health"],
    queryFn: api.aiHealth,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const status = data?.status ?? "unknown";
  const label =
    status === "ok" ? `Limule · ${data?.latency_ms}ms` :
    status === "no_key" ? "Limule · clé manquante" :
    status === "offline" ? "Limule · hors-ligne" :
    "Limule…";
  const dot =
    status === "ok" ? "bg-emerald-400" :
    status === "no_key" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-stone-300";

  return (
    <div
      title={`Grand Sage 1.0 · ${label}`}
      className="hidden items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] md:flex cursor-default"
    >
      <LimuleIcon size={18} />
      <span className="text-xs font-semibold text-[#717182] dark:text-white/50">{label}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status !== "ok" ? "animate-pulse" : ""}`} />
    </div>
  );
}

/* ─── Role-based access control ──────────────────────────────────────────── */
const ROLE_ROUTES: Record<string, string[]> = {
  super_admin: ["*"],   // accès complet (mais redirigé vers /admin via AuthContext)
  admin_entreprise: ["*"],
  manager_entreprise: ["/", "/company", "/employees", "/documents", "/payroll", "/billing", "/clients", "/pos", "/inventory", "/chat", "/work", "/calendar", "/meetings", "/notes", "/reports", "/analytics", "/fiscal", "/reports-teras", "/assistants", "/declarations", "/legislation", "/accounting", "/projects", "/investments", "/budget", "/transactions", "/audit", "/settings", "/safe-mode", "/help"],
  comptable: ["/", "/accounting", "/billing", "/clients", "/reports", "/analytics", "/fiscal", "/reports-teras", "/declarations", "/legislation", "/assistants", "/documents", "/investments", "/budget", "/transactions", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  rh_entreprise: ["/", "/employees", "/documents", "/payroll", "/reports", "/assistants", "/declarations", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  responsable_pos: ["/", "/pos", "/inventory", "/billing", "/clients", "/work", "/reports", "/transactions", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  caissier_pos: ["/", "/pos", "/inventory", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  employe: ["/", "/work", "/chat", "/calendar", "/meetings", "/notes", "/settings", "/help"],
  // Membre de groupe/organisation : interface légère orientée collaboration & suivi
  membre_groupe: ["/", "/groups", "/chat", "/calendar", "/meetings", "/notes", "/documents", "/investments", "/projects", "/assistants", "/work", "/settings", "/help"],
};

function canAccess(role: string | undefined, path: string): boolean {
  const allowed = ROLE_ROUTES[role ?? "employe"] ?? ROLE_ROUTES.employe;
  return allowed.includes("*") || allowed.includes(path);
}

function roleLabel(role?: string) {
  const labels: Record<string, string> = {
    super_admin: "Super admin",
    admin_entreprise: "Admin entreprise",
    manager_entreprise: "DG",
    rh_entreprise: "RH entreprise",
    caissier_pos: "Caisse",
    comptable: "Comptable",
    employe: "Employé",
    membre_groupe: "Membre",
  };
  return role ? labels[role] ?? role : "session";
}

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon | React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { label: "Tableau de bord", to: "/", icon: LayoutDashboard },
      { label: "Entreprise", to: "/company", icon: Building2 },
    ],
  },
  {
    label: "Personnel",
    items: [
      { label: "RH", to: "/employees", icon: Users },
      { label: "Documents", to: "/documents", icon: FolderArchive },
      { label: "Paie", to: "/payroll", icon: HandCoins },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Comptabilité", to: "/accounting", icon: Calculator },
      { label: "Facturation", to: "/billing", icon: ReceiptText },
      { label: "Budget", to: "/budget", icon: PiggyBank },
      { label: "Transactions", to: "/transactions", icon: Landmark },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Clients", to: "/clients", icon: UserCheck },
      { label: "POS / Caisse", to: "/pos", icon: ShoppingCart },
      { label: "Inventaire", to: "/inventory", icon: Boxes },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { label: "Projets & boards", to: "/projects", icon: CheckSquare },
      { label: "Chat", to: "/chat", icon: MessageSquare },
      { label: "Agenda", to: "/calendar", icon: CalendarDays },
      { label: "Notes IA", to: "/notes", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Rapports", to: "/reports", icon: ChartNoAxesCombined },
      { label: "Analytics", to: "/analytics", icon: BarChart2 },
      { label: "Agenda fiscal", to: "/fiscal", icon: CalendarClock },
      { label: "Investissements", to: "/investments", icon: TrendingUp },
      { label: "Déclarations", to: "/declarations", icon: ClipboardList },
      { label: "Législation IA", to: "/legislation", icon: BookOpen },
      { label: "Rédaction IA", to: "/assistants", icon: LimuleIcon },
      { label: "TERAS Connect", to: "/reports-teras", icon: ShieldCheck, badge: "!" },
    ],
  },
  {
    label: "Système",
    items: [
      { label: "Journaux d'audit", to: "/audit", icon: FileText },
      { label: "Safe Mode", to: "/safe-mode", icon: ShieldCheck },
      { label: "Paramètres", to: "/settings", icon: Settings },
    ],
  },
];

const routeLabels: Record<string, { section: string; title: string }> = {
  "/": { section: "Pilotage", title: "Tableau de bord" },
  "/company": { section: "Entreprise", title: "Profil et structure" },
  "/employees": { section: "RH", title: "Dossiers du personnel" },
  "/documents": { section: "Documents", title: "Bibliothèque intelligente" },
  "/payroll": { section: "Paie", title: "Cycles et bulletins" },
  "/accounting": { section: "Comptabilité", title: "Finance et SYSCEMAC" },
  "/budget": { section: "Finance", title: "Gestion budgétaire" },
  "/transactions": { section: "Finance", title: "Relevés & transactions" },
  "/billing": { section: "Facturation", title: "Clients et encaissements" },
  "/clients": { section: "Commerce", title: "CRM & Clients" },
  "/pos": { section: "POS / Caisse", title: "Caisse et encaissement" },
  "/inventory": { section: "Inventaire", title: "Stock multi-sites" },
  "/projects": { section: "Projets", title: "Boards et budgets" },
  "/chat": { section: "Chat", title: "Messagerie d'équipe" },
  "/work": { section: "Collaboration", title: "Tâches et projets" },
  "/calendar": { section: "Agenda", title: "Calendrier & réunions" },
  "/notes": { section: "Notes IA", title: "Journal quotidien" },
  "/meetings": { section: "Agenda", title: "Calendrier & réunions" },
  "/reports": { section: "Rapports", title: "Hub d'analyse" },
  "/investments": { section: "Investissements", title: "Portefeuille boursier" },
  "/reports-teras": { section: "TERAS", title: "Conformité et risques" },
  "/assistants": { section: "Rédaction IA", title: "Studio rédactionnel" },
  "/declarations": { section: "Déclarations", title: "Obligations légales & fiscales" },
  "/legislation": { section: "Législation IA", title: "Base législative & réglementaire" },
  "/analytics": { section: "Intelligence", title: "Analytics & performances" },
  "/fiscal": { section: "Intelligence", title: "Agenda fiscal" },
  "/audit": { section: "Système", title: "Journaux d'audit" },
  "/settings": { section: "Paramètres", title: "Configuration" },
  "/safe-mode": { section: "Système", title: "Sauvegarde & Restauration" },
  "/help": { section: "Support", title: "Centre d'aide" },
  "/activation": { section: "Compte", title: "Activation sécurisée" },
};

export function Shell() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [terasScore, setTerasScore] = useState(87);
  const [terasModuleBadges, setTerasModuleBadges] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("kompta_sidebar_collapsed") === "true"
  );

  const { toasts, dismiss, liveAlertCount, history, markAllRead, clearHistory } = useWebSocketNotifications(user?.company_id);
  const { notifications: polledNotifications } = useNotificationsPolling(!!user);
  const unreadCount = history.filter((n) => n.unread).length;
  const bellCount = unreadCount + liveAlertCount + polledNotifications.length + Object.values(terasModuleBadges).reduce((s, n) => s + n, 0);
  const { theme, toggle: toggleTheme } = useTheme();
  const { compact, toggleCompact } = useCompact();
  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("kompta_sidebar_collapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    if (!user) {
      api.me().then(setUser).catch((error) => {
        if (isUnauthorized(error)) {
          logout();
          navigate("/login");
        }
      });
    }
  }, [logout, navigate, setUser, user]);

  useEffect(() => {
    if (user?.must_change_password && location.pathname !== "/activation") {
      navigate("/activation");
    }
  }, [location.pathname, navigate, user?.must_change_password]);

  // Super-admin → toujours sur l'AdminShell, quel que soit le point d'entrée
  // (reload, navigation directe, etc.). Sans cette redirection, le super-admin
  // restauré depuis le localStorage atterrit sur Shell normal et perd ses menus.
  useEffect(() => {
    if (user?.role === "super_admin" && !location.pathname.startsWith("/admin")) {
      navigate("/admin", { replace: true });
    }
  }, [user?.role, location.pathname, navigate]);

  useEffect(() => {
    if (user) {
      api
        .overview()
        .then((overview) => setTerasScore(overview.kpis.teras_score ?? 87))
        .catch(() => undefined);
      api
        .terasAlerts()
        .then((alerts) => {
          const MODULE_ROUTE: Record<string, string> = {
            DRH: "/employees",
            RH: "/employees",
            Paie: "/payroll",
            Payroll: "/payroll",
            Comptabilite: "/accounting",
            Comptabilité: "/accounting",
            Declaration: "/declarations",
            Déclaration: "/declarations",
            Documents: "/documents",
          };
          const counts: Record<string, number> = {};
          for (const a of alerts) {
            if (a.status !== "open") continue;
            const route = MODULE_ROUTE[a.module];
            if (route) counts[route] = (counts[route] ?? 0) + 1;
          }
          setTerasModuleBadges(counts);
        })
        .catch(() => undefined);
    }
  }, [user, location.pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs / textareas
      const tag = (event.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement)?.isContentEditable;

      // ⌘K / Ctrl+K — command palette
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Single-letter navigation shortcuts (only when not typing)
      if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcuts: Record<string, string> = {
          "g": "/",              // G → Dashboard (go home)
          "e": "/employees",     // E → Employés
          "b": "/billing",       // B → Facturation
          "p": "/pos",           // P → POS / Caisse
          "i": "/inventory",     // I → Inventaire
          "c": "/clients",       // C → Clients
          "r": "/reports",       // R → Rapports
          "t": "/transactions",  // T → Transactions
          "w": "/work",          // W → Work/Tâches
          "n": "/notes",         // N → Notes IA
          "m": "/meetings",      // M → Meetings
          "s": "/settings",      // S → Paramètres
        };
        const dest = shortcuts[event.key.toLowerCase()];
        if (dest) {
          event.preventDefault();
          navigate(dest);
        }
        // ? → show shortcuts help (palette)
        if (event.key === "?") {
          event.preventDefault();
          setPaletteOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const currentRoute = useMemo(
    () => routeLabels[location.pathname] ?? { section: "KOMPTA", title: "Espace local" },
    [location.pathname]
  );
  const firstName = user?.full_name.split(" ")[0] ?? "KOMPTA";

  // RBAC: filter nav sections to only show routes the current role can access
  const filteredSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => canAccess(user?.role, item.to)),
        }))
        .filter((section) => section.items.length > 0),
    [user?.role]
  );

  /* ─── Sidebar content ─────────────────────────────────────────────── */
  const sideNav = (
    <aside
      className={`flex h-full flex-col bg-[#071407] text-white transition-all duration-200 overflow-hidden ${
        collapsed ? "w-16" : "w-72"
      }`}
    >
      {/* Header */}
      <div className={`border-b border-white/[0.08] ${collapsed ? "flex flex-col items-center gap-2 p-3" : "p-4"}`}>
        {collapsed ? (
          <>
            {/* Collapsed : logo K */}
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-black text-white">
              K
            </div>
            <button
              onClick={toggleCollapsed}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              title="Étendre la barre"
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center gap-3 rounded-lg p-1.5 hover:bg-white/[0.06] transition"
          >
            {/* Expanded : logo K + nom entreprise */}
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 font-black text-white text-sm">
              K
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm text-white font-semibold">{user?.branch ? `KOMPTA · ${user.branch}` : "KOMPTA"}</p>
              <p className="truncate text-xs text-white/50">Plan local · {roleLabel(user?.role)}</p>
            </div>
            <ChevronLeft size={14} className="text-white/45 shrink-0" />
          </button>
        )}
      </div>

      {/* Search — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 py-2.5">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-left text-white/50 hover:bg-white/10 transition"
          >
            <Search size={15} />
            <span className="min-w-0 flex-1 truncate text-sm">Recherche globale…</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-emerald-100">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav data-tour="nav" className="scrollbar-thin flex-1 overflow-y-auto pb-4 px-3 space-y-5">
        {filteredSections.map((section) => (
          <div key={section.label} className={collapsed ? "mt-3 space-y-0.5" : ""}>
            {!collapsed && (
              <p className="mb-1 px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const terasCount = terasModuleBadges[item.to] ?? 0;
                const staticBadge = item.badge;
                return (
                  <NavLink
                    key={`${item.label}-${item.to}`}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `relative flex items-center rounded-lg px-2 py-2 text-sm transition ${
                        collapsed ? "justify-center" : "gap-3"
                      } ${
                        isActive
                          ? "bg-emerald-600/30 text-white"
                          : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !collapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-emerald-400 rounded-r" />
                        )}
                        <item.icon size={17} className="shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {staticBadge && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                staticBadge === "!" ? "bg-rose-500 text-white" : "bg-emerald-500/40 text-emerald-50"
                              }`}>
                                {staticBadge}
                              </span>
                            )}
                            {terasCount > 0 && (
                              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {terasCount}
                              </span>
                            )}
                          </>
                        )}
                        {collapsed && (staticBadge || terasCount > 0) && (
                          <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${terasCount > 0 ? "bg-amber-400" : "bg-rose-500"}`} />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-white/[0.08] ${collapsed ? "p-2" : "space-y-2 p-3"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-full rounded-lg bg-emerald-600/25 p-2 text-center" title={`Score TERAS : ${terasScore}/100`}>
              <p className="text-[9px] font-bold text-white/50 uppercase">TERAS</p>
              <p className="text-sm font-black text-white">{terasScore}</p>
            </div>
            <button onClick={() => navigate("/help")} className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" title="Centre d'aide">
              <HelpCircle size={17} />
            </button>
            <button onClick={() => { logout(); navigate("/login"); }} className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" title="Déconnexion">
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-gradient-to-br from-emerald-600/40 to-emerald-700/30 p-3">
              <div className="flex items-center gap-2 text-xs text-white/80">
                <ShieldCheck size={15} />
                <span className="font-semibold">Score TERAS</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-white text-xl font-black">{terasScore}</span>
                <span className="text-xs text-white/50">/ 100</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500" style={{ width: `${terasScore}%` }} />
              </div>
            </div>
            <button onClick={() => navigate("/groups")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 border border-violet-500/30 transition">
              <Users size={16} /> Mes Groupes & Orgs
            </button>
            <button onClick={() => navigate("/help")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white transition">
              <HelpCircle size={16} /> Centre d'aide
            </button>
            <button onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white transition">
              <LogOut size={16} /> Déconnexion
            </button>
          </>
        )}
      </div>
    </aside>
  );

  const sidebarWidth = collapsed ? "lg:w-16" : "lg:w-72";
  const mainPadding = collapsed ? "lg:pl-16" : "lg:pl-72";

  return (
    <div className="min-h-screen bg-[#f7f8fa] dark:bg-[#111318] dark:text-[#e2e8f0]">
      {/* Desktop sidebar — fixed */}
      <div
        className={`fixed inset-y-0 left-0 z-40 hidden lg:block transition-all duration-200 ${sidebarWidth}`}
      >
        {sideNav}
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative h-full w-80 max-w-[85vw]">{sideNav}</div>
        </div>
      ) : null}

      {/* Main */}
      <div className={`${mainPadding} transition-all duration-200`}>
        <header className="sticky top-0 z-30 h-14 border-b border-black/[0.08] bg-white/90 px-4 backdrop-blur dark:border-white/[0.08] dark:bg-[#111318]/90 flex items-center">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-black/[0.08] bg-white lg:hidden dark:border-white/10 dark:bg-white/5"
                onClick={() => setMobileOpen(true)}
                aria-label="Menu"
              >
                <Menu size={18} />
              </button>
              <div className="hidden min-w-0 items-center gap-1.5 text-sm text-[#717182] sm:flex">
                <span>KOMPTA</span>
                <ChevronRight size={14} className="opacity-50" />
                <span>{currentRoute.section}</span>
                <ChevronRight size={14} className="opacity-50" />
                <span className="max-w-[220px] truncate text-[#17211f] font-medium dark:text-white">{currentRoute.title}</span>
              </div>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden min-w-[260px] max-w-sm flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-left text-[#717182] shadow-sm hover:bg-[#f5f5fa] xl:flex dark:border-white/10 dark:bg-white/5 dark:text-white/50"
            >
              <Search size={16} />
              <span className="min-w-0 flex-1 truncate text-sm">Rechercher pages, actions, personnes…</span>
              <kbd className="rounded bg-[#ececf0] px-1.5 py-0.5 text-[10px] font-bold text-[#717182] dark:bg-white/10 dark:text-white/50">⌘K</kbd>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              <LimuleStatus />
              <button
                onClick={() => navigate("/billing")}
                className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 md:flex"
              >
                <Plus size={16} />
                Créer
              </button>
              <button
                onClick={toggleTheme}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
                title={theme === "dark" ? "Mode clair" : "Mode sombre"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                onClick={toggleCompact}
                className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition ${
                  compact ? "text-emerald-600 dark:text-emerald-400" : "text-[#717182] dark:text-white/60"
                }`}
                title={compact ? "Mode normal" : "Mode compact"}
              >
                <LayoutList size={17} />
              </button>
              <button
                onClick={() => navigate("/work")}
                title="Tâches"
                className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
              >
                <CheckSquare size={17} />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
              </button>
              <button
                onClick={() => navigate("/chat")}
                title="Messagerie"
                className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
              >
                <MessageSquare size={17} />
                {(terasModuleBadges["/chat"] ?? 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
                    {terasModuleBadges["/chat"] ?? 0}
                  </span>
                )}
              </button>
              <SyncStatusBadge onClick={() => navigate("/pos")} />
              <span className="md:hidden"><SyncStatusBadge compact onClick={() => navigate("/pos")} /></span>
              <button
                onClick={() => setNotificationsOpen(true)}
                className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
              >
                <Bell size={17} />
                {bellCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-600 px-0.5 text-[9px] font-bold text-white">
                    {bellCount > 9 ? "9+" : bellCount}
                  </span>
                )}
              </button>
              <div className="ml-1 hidden items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 md:flex dark:border-white/10 dark:bg-white/5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-xs font-bold text-white">
                  {initials(user?.full_name ?? "KOMPTA")}
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white">{user?.full_name ?? firstName}</p>
                  <p className="text-xs text-[#717182]">{roleLabel(user?.role)}</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        {/* pb-[calc(...)] = hauteur nav + safe-area iOS, garantit qu'aucun contenu n'est masqué */}
        <main className={`mx-auto w-full max-w-7xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-7 md:px-6 ${compact ? "py-3 md:py-4" : "py-5 md:py-7"}`}>
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom navigation bar — adapté au rôle (safe-area iPhone notch) ── */}
      <nav data-tour="nav" className="fixed bottom-0 inset-x-0 z-40 flex lg:hidden items-center justify-around border-t border-black/[0.08] bg-white/95 backdrop-blur dark:border-white/[0.08] dark:bg-[#111318]/95 h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {(user?.role === "membre_groupe"
          ? [
              { to: "/",        icon: LayoutDashboard, label: "Accueil"  },
              { to: "/groups",  icon: Users,            label: "Groupes"  },
              { to: "/chat",    icon: MessageSquare,    label: "Chat"     },
              { to: "/settings",icon: Settings,         label: "Profil"   },
            ]
          : [
              { to: "/",           icon: LayoutDashboard, label: "Accueil"  },
              { to: "/billing",    icon: ReceiptText,      label: "Factures" },
              { to: "/pos",        icon: ShoppingCart,     label: "Caisse"   },
              { to: "/chat",       icon: MessageSquare,    label: "Chat"     },
              { to: "/settings",   icon: Settings,         label: "Params"   },
            ]
        ).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl transition text-[10px] sm:text-xs font-semibold min-w-0 flex-1 ${
                isActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-[#717182] dark:text-white/50 hover:text-[#17211f] dark:hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="truncate w-full text-center">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] sm:text-xs font-semibold text-[#717182] dark:text-white/50 hover:text-[#17211f] dark:hover:text-white transition min-w-0 flex-1"
        >
          <Search size={20} strokeWidth={2} />
          <span className="truncate w-full text-center">Recherche</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={history}
        onMarkAllRead={markAllRead}
        onClear={clearHistory}
      />
      <GuidedTour />
      <SubscriptionGate />
      <Copilot />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
