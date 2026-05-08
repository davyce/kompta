import {
  Activity,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
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

// ── Breadcrumb mapping ────────────────────────────────────────────────────────

function useBreadcrumb() {
  const location = useLocation();
  const path = location.pathname;
  const segments: { label: string; to?: string }[] = [{ label: "Admin", to: "/admin" }];

  if (path === "/admin") return [{ label: "Dashboard" }];

  const map: Record<string, string> = {
    companies: "Entreprises",
    users: "Utilisateurs",
    tickets: "Tickets",
    limule: "Grand Sage Limule",
    logs: "Audit & Logs",
    analytics: "Analytics",
    broadcast: "Broadcast",
    system: "Flags & Santé",
    onboarding: "Onboarding",
  };

  const parts = path.replace("/admin/", "").split("/");
  const first = parts[0];
  if (map[first]) {
    segments.push({ label: map[first], to: `/admin/${first}` });
  }
  if (parts[1]) {
    segments.push({ label: `#${parts[1]}` });
  }
  return segments;
}

// ── Sidebar NavLink ───────────────────────────────────────────────────────────

function SideNavLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  criticalCount,
  hasBadge,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  collapsed: boolean;
  criticalCount?: number;
  hasBadge?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 ${
          collapsed ? "justify-center" : "gap-3"
        } ${
          isActive
            ? "bg-gradient-to-r from-violet-600/40 to-fuchsia-600/30 text-white shadow"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {hasBadge && (criticalCount ?? 0) > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ${collapsed ? "absolute -top-1 -right-1" : ""}`}
        >
          {criticalCount}
        </span>
      )}
    </NavLink>
  );
}

// ── Quick Actions dropdown ────────────────────────────────────────────────────

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
    { label: "Créer une entreprise", icon: Building2, onClick: () => navigate("/admin/companies") },
    { label: "Envoyer un broadcast", icon: Megaphone, onClick: () => navigate("/admin/broadcast") },
    { label: "Réinitialiser un mot de passe", icon: RefreshCw, onClick: () => navigate("/admin/users") },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 transition"
      >
        <Zap size={13} />
        Actions
        <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => { a.onClick(); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
              >
                <Icon size={15} className="text-violet-300" />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────────

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
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10 transition"
      >
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-black">
          {initials(name)}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-xs font-bold leading-tight">{name}</p>
          <p className="text-[9px] font-bold uppercase text-violet-300">{role}</p>
        </div>
        <ChevronDown size={11} className={`text-white/40 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-xs font-bold text-white">{name}</p>
            <p className="text-[10px] text-white/50">{role}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-rose-300 hover:bg-white/10 transition"
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
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("kompta_admin_collapsed") === "true"
  );
  const [now, setNow] = useState(new Date());
  const [searchValue, setSearchValue] = useState("");

  // Fetch critical tickets count for badge (polling every 30s)
  const overview = useQuery({
    queryKey: ["adminOverview"],
    queryFn: api.adminOverview,
    refetchInterval: 30_000,
  });

  const criticalCount = overview.data?.tickets_critical ?? 0;
  const limuleStatus = "online"; // could be fetched from health endpoint

  const breadcrumb = useBreadcrumb();

  useEffect(() => {
    if (!user) {
      api.me().then(setUser).catch(() => {
        logout();
        navigate("/login", { replace: true });
      });
    }
  }, [logout, navigate, setUser, user]);

  useEffect(() => {
    if (user && user.role !== "super_admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Live clock
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

  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 text-white">
      {/* Animated gradient overlay */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_20%_20%,_#7c3aed_0%,_transparent_60%),radial-gradient(ellipse_at_80%_80%,_#4f46e5_0%,_transparent_60%)]" />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-4">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black shadow-lg shadow-violet-500/30">
                <ShieldAlert size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">KOMPTA</p>
                <div className="flex items-center gap-1">
                  <span className="rounded bg-fuchsia-500/30 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-200">
                    SUPER ADMIN v2.0
                  </span>
                </div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black">
              <ShieldAlert size={16} />
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className={`grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white ${collapsed ? "absolute -right-4 top-5 border border-white/10 bg-slate-900" : ""}`}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="mb-1 px-3 text-[9px] font-black uppercase tracking-widest text-white/30">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SideNavLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    end={item.end}
                    collapsed={collapsed}
                    hasBadge={item.badge}
                    criticalCount={item.badge ? criticalCount : 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: Limule status */}
        <div className="border-t border-white/10 p-3 space-y-2">
          {!collapsed && (
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <span className={`h-2 w-2 rounded-full ${limuleStatus === "online" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
              <span className="text-[10px] font-bold text-white/60">
                Limule {limuleStatus === "online" ? "en ligne" : "hors ligne"}
              </span>
            </div>
          )}
          <button
            onClick={() => { logout(); navigate("/login"); }}
            title={collapsed ? "Déconnexion" : undefined}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition ${
              collapsed ? "justify-center" : "gap-3"
            }`}
          >
            <LogOut size={17} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`relative z-10 transition-all duration-200 ${collapsed ? "pl-16" : "pl-64"}`}>
        {/* Sticky header */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-black/50 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {breadcrumb.map((seg, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-white/30">/</span>}
                  {seg.to ? (
                    <button
                      onClick={() => navigate(seg.to!)}
                      className="text-violet-300 hover:text-white transition"
                    >
                      {seg.label}
                    </button>
                  ) : (
                    <span className="text-white">{seg.label}</span>
                  )}
                </span>
              ))}
            </div>

            {/* Search */}
            <div className="flex flex-1 max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <Search size={14} className="text-white/40 shrink-0" />
              <input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Rechercher entreprise, utilisateur…"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Live clock */}
              <div className="hidden lg:block text-right">
                <p className="text-xs font-black text-white">{timeStr}</p>
                <p className="text-[10px] text-white/40">{dateStr}</p>
              </div>

              {/* Notifications bell */}
              <button
                onClick={() => navigate("/admin/tickets")}
                title="Tickets critiques"
                className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition"
              >
                <Bell size={16} />
                {criticalCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-black text-white">
                    {criticalCount}
                  </span>
                )}
              </button>

              {/* Quick actions */}
              <QuickActionsMenu />

              {/* User */}
              <UserMenu
                name={user?.full_name ?? "Super Admin"}
                role={user?.role ?? "super_admin"}
                onLogout={() => { logout(); navigate("/login"); }}
              />
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="mx-auto w-full max-w-7xl px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
