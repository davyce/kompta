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
  Lock,
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
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { CommandPalette } from "../components/CommandPalette";
import { Copilot } from "../components/Copilot";
import { NotificationCenter } from "../components/NotificationCenter";
import { GuidedTour } from "../components/GuidedTour";
import { SubscriptionGate } from "../components/SubscriptionGate";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { useToast } from "../components/ToastProvider";
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
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["ai-health"],
    queryFn: api.aiHealth,
    // Ne recharge pas au montage si les données sont fraîches (< 5 min),
    // et ne sonde que toutes les 5 min en arrière-plan pour limiter les appels externes.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const status = data?.status ?? "unknown";
  const label =
    status === "ok" ? t("nav.limule.ok", { latency: data?.latency_ms }) :
    status === "no_key" ? t("nav.limule.noKey") :
    status === "offline" ? t("nav.limule.offline") :
    t("nav.limule.loading");
  const dot =
    status === "ok" ? "bg-emerald-400" :
    status === "no_key" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-stone-300";

  return (
    <div
      title={t("nav.limule.title", { label })}
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
  manager_entreprise: ["/", "/company", "/employees", "/documents", "/payroll", "/billing", "/clients", "/pos", "/inventory", "/chat", "/work", "/calendar", "/meetings", "/notes", "/reports", "/analytics", "/fiscal", "/reports-teras", "/assistants", "/declarations", "/legislation", "/accounting", "/projects", "/kanban", "/investments", "/budget", "/transactions", "/audit", "/settings", "/safe-mode", "/help"],
  comptable: ["/", "/accounting", "/billing", "/clients", "/reports", "/analytics", "/fiscal", "/reports-teras", "/declarations", "/legislation", "/assistants", "/documents", "/investments", "/budget", "/transactions", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  rh_entreprise: ["/", "/employees", "/documents", "/payroll", "/reports", "/assistants", "/declarations", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  responsable_pos: ["/", "/pos", "/inventory", "/billing", "/clients", "/work", "/reports", "/transactions", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  caissier_pos: ["/", "/pos", "/inventory", "/chat", "/calendar", "/meetings", "/notes", "/help"],
  employe: ["/", "/work", "/kanban", "/chat", "/calendar", "/meetings", "/notes", "/settings", "/help"],
  // Membre de groupe/organisation : interface légère orientée collaboration & suivi
  membre_groupe: ["/", "/groups", "/chat", "/calendar", "/meetings", "/notes", "/documents", "/investments", "/projects", "/kanban", "/assistants", "/work", "/settings", "/help"],
};

function canAccess(role: string | undefined, path: string): boolean {
  const allowed = ROLE_ROUTES[role ?? "employe"] ?? ROLE_ROUTES.employe;
  return allowed.includes("*") || allowed.includes(path);
}

function roleLabel(role?: string) {
  return role ?? "session";
}

type NavItem = {
  to: string;
  icon: LucideIcon | React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
};

type NavSection = {
  sectionKey: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    sectionKey: "Pilotage",
    items: [
      { to: "/", icon: LayoutDashboard },
      { to: "/company", icon: Building2 },
    ],
  },
  {
    sectionKey: "Personnel",
    items: [
      { to: "/employees", icon: Users },
      { to: "/documents", icon: FolderArchive },
      { to: "/payroll", icon: HandCoins },
    ],
  },
  {
    sectionKey: "Finance",
    items: [
      { to: "/accounting", icon: Calculator },
      { to: "/billing", icon: ReceiptText },
      { to: "/budget", icon: PiggyBank },
      { to: "/transactions", icon: Landmark },
    ],
  },
  {
    sectionKey: "Commerce",
    items: [
      { to: "/clients", icon: UserCheck },
      { to: "/pos", icon: ShoppingCart },
      { to: "/inventory", icon: Boxes },
    ],
  },
  {
    sectionKey: "Collaboration",
    items: [
      { to: "/projects", icon: CheckSquare },
      { to: "/kanban", icon: LayoutList },
      { to: "/chat", icon: MessageSquare },
      { to: "/calendar", icon: CalendarDays },
      { to: "/notes", icon: FileText },
    ],
  },
  {
    sectionKey: "Intelligence",
    items: [
      { to: "/reports", icon: ChartNoAxesCombined },
      { to: "/analytics", icon: BarChart2 },
      { to: "/fiscal", icon: CalendarClock },
      { to: "/investments", icon: TrendingUp },
      { to: "/declarations", icon: ClipboardList },
      { to: "/legislation", icon: BookOpen },
      { to: "/assistants", icon: LimuleIcon },
      { to: "/reports-teras", icon: ShieldCheck, badge: "!" },
    ],
  },
  {
    sectionKey: "Système",
    items: [
      { to: "/audit", icon: FileText },
      { to: "/safe-mode", icon: ShieldCheck },
      { to: "/settings", icon: Settings },
    ],
  },
];

// Modules premium gateables par plan (miroir du backend _PREMIUM_PATH_MODULES).
// Le reste = modules « cœur », toujours accessibles.
const PREMIUM_ROUTES = new Set<string>([
  "employees", "payroll", "accounting", "declarations", "fiscal", "assistants",
  "limule", "projects", "kanban", "meetings", "reports", "reports-teras",
  "teras", "investments", "groups",
]);

function routeSeg(to: string): string {
  return to.replace(/^\//, "").split("/")[0];
}

export function isRouteLocked(to: string, allowedModules: string[] | null | undefined): boolean {
  if (allowedModules == null) return false;          // essai → tout permis
  const seg = routeSeg(to);
  if (!PREMIUM_ROUTES.has(seg)) return false;        // module cœur
  return !allowedModules.includes(seg);
}

const routeLabels: Record<string, { sectionKey: string; titleTk: string }> = {
  "/": { sectionKey: "Pilotage", titleTk: "nav.titles./" },
  "/company": { sectionKey: "Entreprise", titleTk: "nav.titles./company" },
  "/employees": { sectionKey: "RH", titleTk: "nav.titles./employees" },
  "/documents": { sectionKey: "Documents", titleTk: "nav.titles./documents" },
  "/payroll": { sectionKey: "Paie", titleTk: "nav.titles./payroll" },
  "/accounting": { sectionKey: "Comptabilité", titleTk: "nav.titles./accounting" },
  "/budget": { sectionKey: "Finance", titleTk: "nav.titles./budget" },
  "/transactions": { sectionKey: "Finance", titleTk: "nav.titles./transactions" },
  "/billing": { sectionKey: "Facturation", titleTk: "nav.titles./billing" },
  "/clients": { sectionKey: "Commerce", titleTk: "nav.titles./clients" },
  "/pos": { sectionKey: "POS / Caisse", titleTk: "nav.titles./pos" },
  "/inventory": { sectionKey: "Inventaire", titleTk: "nav.titles./inventory" },
  "/projects": { sectionKey: "Projets", titleTk: "nav.titles./projects" },
  "/kanban": { sectionKey: "Kanban", titleTk: "nav.titles./kanban" },
  "/chat": { sectionKey: "Chat", titleTk: "nav.titles./chat" },
  "/work": { sectionKey: "Collaboration", titleTk: "nav.titles./work" },
  "/calendar": { sectionKey: "Agenda", titleTk: "nav.titles./calendar" },
  "/notes": { sectionKey: "Notes IA", titleTk: "nav.titles./notes" },
  "/meetings": { sectionKey: "Agenda", titleTk: "nav.titles./meetings" },
  "/reports": { sectionKey: "Rapports", titleTk: "nav.titles./reports" },
  "/investments": { sectionKey: "Investissements", titleTk: "nav.titles./investments" },
  "/reports-teras": { sectionKey: "TERAS", titleTk: "nav.titles./reports-teras" },
  "/assistants": { sectionKey: "Rédaction IA", titleTk: "nav.titles./assistants" },
  "/declarations": { sectionKey: "Déclarations", titleTk: "nav.titles./declarations" },
  "/legislation": { sectionKey: "Législation IA", titleTk: "nav.titles./legislation" },
  "/analytics": { sectionKey: "Intelligence", titleTk: "nav.titles./analytics" },
  "/fiscal": { sectionKey: "Intelligence", titleTk: "nav.titles./fiscal" },
  "/audit": { sectionKey: "Système", titleTk: "nav.titles./audit" },
  "/settings": { sectionKey: "Paramètres", titleTk: "nav.titles./settings" },
  "/safe-mode": { sectionKey: "Système", titleTk: "nav.titles./safe-mode" },
  "/help": { sectionKey: "Support", titleTk: "nav.titles./help" },
  "/activation": { sectionKey: "Compte", titleTk: "nav.titles./activation" },
};

export function Shell() {
  const { t } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const roleText = (role?: string) => (role ? t(`roles.${role}`, { defaultValue: roleLabel(role) }) : t("roles.session"));
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

  const { toast: showToast } = useToast();
  const { liveAlertCount, history, markAllRead, clearHistory } = useWebSocketNotifications(
    user?.company_id,
    // Toutes les notifications WS passent par le ToastProvider unique
    (msg, tone, detail) => showToast(msg, tone, tone === "error" ? 8000 : 5000, detail),
  );
  const { notifications: polledNotifications } = useNotificationsPolling(!!user);
  const unreadCount = history.filter((n) => n.unread).length;
  const bellCount = unreadCount + liveAlertCount + polledNotifications.length + Object.values(terasModuleBadges).reduce((s, n) => s + n, 0);
  const { theme, toggle: toggleTheme } = useTheme();

  // Abonnement + entitlements (pour verrouiller les modules hors plan).
  const subQ = useQuery({
    queryKey: ["mySubscription"],
    queryFn: () => api.mySubscription(),
    enabled: !!user && user.role !== "super_admin",
    staleTime: 60_000,
  });
  const entitlements = subQ.data?.entitlements;
  const allowedModules = entitlements?.allowed_modules;
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
    () => routeLabels[location.pathname] ?? { sectionKey: "KOMPTA", titleTk: "nav.titles.localSpace" },
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
              title={t("nav.expandSidebar")}
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
              <p className="truncate text-xs text-white/50">{t("nav.localPlan")} · {roleText(user?.role)}</p>
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
            <span className="min-w-0 flex-1 truncate text-sm">{t("nav.globalSearch")}</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-emerald-100">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav data-tour="nav" className="scrollbar-thin flex-1 overflow-y-auto pb-4 px-3 space-y-5">
        {filteredSections.map((section) => (
          <div key={section.sectionKey} className={collapsed ? "mt-3 space-y-0.5" : ""}>
            {!collapsed && (
              <p className="mb-1 px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                {t(`nav.sections.${section.sectionKey}`, { defaultValue: section.sectionKey })}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const terasCount = terasModuleBadges[item.to] ?? 0;
                const staticBadge = item.badge;
                const itemLabel = t(`nav.items.${item.to}`, { defaultValue: item.to });
                const locked = isRouteLocked(item.to, allowedModules);
                if (locked) {
                  return (
                    <button
                      key={item.to}
                      onClick={() => { setMobileOpen(false); navigate("/settings?tab=subscription"); }}
                      title={collapsed ? `${itemLabel} — offre supérieure` : undefined}
                      className={`relative flex w-full items-center rounded-lg px-2 py-2 text-sm text-white/35 transition hover:bg-white/[0.04] hover:text-white/55 ${collapsed ? "justify-center" : "gap-3"}`}
                    >
                      <item.icon size={17} className="shrink-0 opacity-60" />
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
                          <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                            <Lock size={9} /> Pro
                          </span>
                        </>
                      )}
                      {collapsed && <Lock size={9} className="absolute right-1.5 top-1.5 text-amber-300" />}
                    </button>
                  );
                }
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? itemLabel : undefined}
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
                            <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
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
            <button onClick={() => navigate("/help")} className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" title={t("nav.helpCenter")}>
              <HelpCircle size={17} />
            </button>
            <button onClick={() => { logout(); navigate("/login"); }} className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" title={t("nav.logout")}>
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-gradient-to-br from-emerald-600/40 to-emerald-700/30 p-3">
              <div className="flex items-center gap-2 text-xs text-white/80">
                <ShieldCheck size={15} />
                <span className="font-semibold">{t("nav.terasScore")}</span>
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
              <Users size={16} /> {t("nav.myGroups")}
            </button>
            <button onClick={() => navigate("/help")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white transition">
              <HelpCircle size={16} /> {t("nav.helpCenter")}
            </button>
            <button onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white transition">
              <LogOut size={16} /> {t("nav.logout")}
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
            aria-label={t("common.close")}
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
                <span>{t(`nav.items.${location.pathname}`, { defaultValue: t(`nav.sections.${currentRoute.sectionKey}`, { defaultValue: currentRoute.sectionKey }) })}</span>
                <ChevronRight size={14} className="opacity-50" />
                <span className="max-w-[220px] truncate text-[#17211f] font-medium dark:text-white">{t(currentRoute.titleTk)}</span>
              </div>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden min-w-[260px] max-w-sm flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-left text-[#717182] shadow-sm hover:bg-[#f5f5fa] xl:flex dark:border-white/10 dark:bg-white/5 dark:text-white/50"
            >
              <Search size={16} />
              <span className="min-w-0 flex-1 truncate text-sm">{t("nav.searchPlaceholder")}</span>
              <kbd className="rounded bg-[#ececf0] px-1.5 py-0.5 text-[10px] font-bold text-[#717182] dark:bg-white/10 dark:text-white/50">⌘K</kbd>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              <LimuleStatus />
              <button
                onClick={() => navigate("/billing")}
                className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 md:flex"
              >
                <Plus size={16} />
                {t("nav.createButton")}
              </button>
              <button
                onClick={toggleTheme}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
                title={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                onClick={toggleCompact}
                className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition ${
                  compact ? "text-emerald-600 dark:text-emerald-400" : "text-[#717182] dark:text-white/60"
                }`}
                title={compact ? t("nav.normalMode") : t("nav.compactMode")}
              >
                <LayoutList size={17} />
              </button>
              <button
                onClick={() => navigate("/work")}
                title={t("nav.tasks")}
                className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182] dark:hover:bg-white/[0.06] dark:text-white/60"
              >
                <CheckSquare size={17} />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
              </button>
              <button
                onClick={() => navigate("/chat")}
                title={t("nav.messaging")}
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
                  <p className="text-xs text-[#717182]">{roleText(user?.role)}</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        {/* pb-[calc(...)] = hauteur nav + safe-area iOS, garantit qu'aucun contenu n'est masqué */}
        <main className={`mx-auto w-full max-w-7xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-7 md:px-6 ${compact ? "py-3 md:py-4" : "py-5 md:py-7"}`}>
          {entitlements && (entitlements.soft_warning || (entitlements.locked && !entitlements.trialing)) && (
            <button
              onClick={() => navigate("/settings?tab=subscription")}
              className={`mb-4 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                entitlements.locked
                  ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
              }`}
            >
              <Lock size={16} className="shrink-0" />
              <span className="flex-1">
                {entitlements.trialing
                  ? `Votre essai gratuit se termine dans ${entitlements.trial_days_left} jour(s). Choisissez une offre pour ne rien perdre.`
                  : "Votre essai est terminé. Certaines fonctionnalités sont limitées — passez à une offre pour tout débloquer."}
              </span>
              <span className="shrink-0 rounded-lg bg-black/5 px-3 py-1.5 text-xs font-black dark:bg-white/10">Voir les offres →</span>
            </button>
          )}
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom navigation bar — adapté au rôle (safe-area iPhone notch) ── */}
      <nav data-tour="nav" className="fixed bottom-0 inset-x-0 z-40 flex lg:hidden items-center justify-around border-t border-black/[0.08] bg-white/95 backdrop-blur dark:border-white/[0.08] dark:bg-[#111318]/95 h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {(user?.role === "membre_groupe"
          ? [
              { to: "/",        icon: LayoutDashboard, label: t("nav.mobile.home")    },
              { to: "/groups",  icon: Users,            label: t("nav.mobile.groups")  },
              { to: "/chat",    icon: MessageSquare,    label: t("nav.mobile.chat")    },
              { to: "/settings",icon: Settings,         label: t("nav.mobile.profile") },
            ]
          : [
              { to: "/",           icon: LayoutDashboard, label: t("nav.mobile.home")     },
              { to: "/billing",    icon: ReceiptText,      label: t("nav.mobile.invoices") },
              { to: "/pos",        icon: ShoppingCart,     label: t("nav.mobile.pos")      },
              { to: "/chat",       icon: MessageSquare,    label: t("nav.mobile.chat")     },
              { to: "/settings",   icon: Settings,         label: t("nav.mobile.params")   },
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
          <span className="truncate w-full text-center">{t("nav.mobile.search")}</span>
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
    </div>
  );
}
