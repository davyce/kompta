import {
  Activity,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  CreditCard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { initials } from "../utils/format";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../hooks/useTheme";
import i18n from "../i18n";

// ── Nav structure ─────────────────────────────────────────────────────────────

type NavItem = { to: string; label: string; icon: React.ElementType; end?: boolean; badge?: boolean };
type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Gestion",
    items: [
      { to: "/admin/companies", label: "Entreprises", icon: Building2 },
      { to: "/admin/subscriptions", label: "Abonnements", icon: CreditCard },
      { to: "/admin/users", label: "Utilisateurs", icon: Users },
      { to: "/admin/onboarding", label: "Onboarding", icon: UserCog },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy, badge: true },
      { to: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
    ],
  },
  {
    label: "Système",
    items: [
      { to: "/admin/limule", label: "Grand Sage Limule", icon: BrainCircuit },
      { to: "/admin/system", label: "Flags & Santé", icon: Flag },
      { to: "/admin/logs", label: "Audit & Logs", icon: Activity },
    ],
  },
];

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function useBreadcrumb() {
  const location = useLocation();
  const path = location.pathname;
  const segments: { label: string; to?: string }[] = [{ label: "Admin", to: "/admin" }];
  if (path === "/admin") return [{ label: "Dashboard" }];
  const map: Record<string, string> = {
    companies: "Entreprises", users: "Utilisateurs", tickets: "Tickets",
    limule: "Grand Sage Limule", logs: "Audit & Logs", analytics: "Analytics",
    broadcast: "Broadcast", system: "Flags & Santé", onboarding: "Onboarding",
  };
  const parts = path.replace("/admin/", "").split("/");
  const first = parts[0];
  if (map[first]) segments.push({ label: map[first], to: `/admin/${first}` });
  if (parts[1]) segments.push({ label: `#${parts[1]}` });
  return segments;
}

// ── SideNavLink ───────────────────────────────────────────────────────────────

function SideNavLink({
  to, label, icon: Icon, end, collapsed, criticalCount, hasBadge,
}: {
  to: string; label: string; icon: React.ElementType;
  end?: boolean; collapsed: boolean; criticalCount?: number; hasBadge?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
          collapsed ? "justify-center" : "gap-3"
        } ${
          isActive
            ? "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {hasBadge && (criticalCount ?? 0) > 0 && (
        <span className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ${collapsed ? "absolute -top-1 -right-1" : ""}`}>
          {criticalCount}
        </span>
      )}
    </NavLink>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const actions = [
    { label: "Voir les entreprises", icon: Building2, onClick: () => navigate("/admin/companies") },
    { label: "Envoyer un broadcast", icon: Megaphone, onClick: () => navigate("/admin/broadcast") },
    { label: "Gérer les utilisateurs", icon: Users, onClick: () => navigate("/admin/users") },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 transition shadow-sm shadow-blue-700/20 dark:bg-blue-500 dark:hover:bg-blue-400"
      >
        <Zap size={13} />
        Actions
        <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => { a.onClick(); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Icon size={15} className="text-blue-700 dark:text-blue-400" />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── User Menu ─────────────────────────────────────────────────────────────────

function UserMenu({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-emerald-600 text-xs font-black text-white">
          {initials(name)}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-xs font-bold text-slate-900 leading-tight dark:text-white">{name}</p>
          <p className="text-[9px] font-bold uppercase text-blue-700 leading-tight dark:text-blue-400">Super Admin</p>
        </div>
        <ChevronDown size={11} className={`text-slate-500 transition dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-900 dark:text-white">{name}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{role}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <LogOut size={14} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────────────────────

export function AdminShell() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      return true;
    }
    return localStorage.getItem("kompta_admin_collapsed") === "true";
  });
  const [now, setNow] = useState(new Date());
  const [searchValue, setSearchValue] = useState("");

  const { theme, toggle: toggleTheme } = useTheme();

  const overview = useQuery({
    queryKey: ["adminOverview"],
    queryFn: api.adminOverview,
    refetchInterval: 30_000,
  });

  const criticalCount = overview.data?.tickets_critical ?? 0;
  const breadcrumb = useBreadcrumb();

  useEffect(() => {
    if (!user) {
      api.me().then(setUser).catch(() => { logout(); navigate("/login", { replace: true }); });
    }
  }, [logout, navigate, setUser, user]);

  useEffect(() => {
    if (user && user.role !== "super_admin") navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("kompta_admin_collapsed", String(next));
      return next;
    });
  }

  const dateStr = now.toLocaleDateString(i18n.language, { weekday: "short", day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const isDark = theme === "dark";

  return (
    <div className="admin-shell min-h-dvh overflow-x-hidden bg-[#f6f8fb] text-slate-900 dark:bg-slate-950 dark:text-white">

      {/* Mobile drawer overlay */}
      {!collapsed && (
        <button
          aria-label="Fermer le menu"
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden dark:bg-black/70"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-all duration-200
          border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900
          ${collapsed ? "-translate-x-full w-64 md:translate-x-0 md:w-16" : "translate-x-0 w-64"}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-4 dark:border-slate-800">
          {!collapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-700 to-emerald-600 shadow-sm shadow-blue-700/20">
                  <ShieldAlert size={17} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 leading-tight dark:text-white">KOMPTA</p>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-800 ring-1 ring-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:ring-blue-500/20">
                    Super Admin
                  </span>
                </div>
              </div>
              <button
                onClick={toggleCollapsed}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          ) : (
            <div className="mx-auto flex flex-col items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-700 to-emerald-600">
                <ShieldAlert size={17} className="text-white" />
              </div>
              <button onClick={toggleCollapsed} className="grid h-6 w-6 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white">
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SideNavLink
                    key={item.to} to={item.to} label={item.label}
                    icon={item.icon} end={item.end} collapsed={collapsed}
                    hasBadge={item.badge} criticalCount={item.badge ? criticalCount : 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-2 space-y-1 dark:border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 mb-2 border border-slate-200 dark:bg-slate-800 dark:border-transparent">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-400" />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">Système opérationnel</span>
            </div>
          )}
          <button
            onClick={() => { logout(); navigate("/login"); }}
            title={collapsed ? "Déconnexion" : undefined}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition border border-transparent hover:border-red-200 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:border-red-500/20 ${collapsed ? "justify-center" : "gap-3"}`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className={`relative min-w-0 overflow-x-hidden transition-all duration-200 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>

        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 md:px-6 py-3 backdrop-blur-xl border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
          {/* Hamburger mobile */}
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Ouvrir le menu"
            className="md:hidden grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
          >
            <ChevronRight size={16} />
          </button>

          {/* Breadcrumb */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold min-w-0">
            {breadcrumb.map((seg, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                {seg.to ? (
                  <button onClick={() => navigate(seg.to!)} className="text-blue-700 hover:text-blue-800 transition dark:text-blue-400 dark:hover:text-blue-300">
                    {seg.label}
                  </button>
                ) : (
                  <span className="text-slate-900 dark:text-white">{seg.label}</span>
                )}
              </span>
            ))}
          </div>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Search size={14} className="text-slate-400 shrink-0 dark:text-slate-500" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Rechercher entreprise, utilisateur…"
              className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          {/* Right */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Clock */}
            <div className="hidden lg:block text-right">
              <p className="text-xs font-black text-blue-700 tabular-nums dark:text-blue-400">{timeStr}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{dateStr}</p>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-blue-700 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-blue-400"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Alerts bell */}
            <button
              onClick={() => navigate("/admin/tickets")}
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <Bell size={16} />
              {criticalCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black text-white">
                  {criticalCount}
                </span>
              )}
            </button>

            <QuickActionsMenu />

            <UserMenu
              name={user?.full_name ?? "Super Admin"}
              role={user?.role ?? "super_admin"}
              onLogout={() => { logout(); navigate("/login"); }}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-7xl px-4 md:px-6 py-5 md:py-7 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
