import {
  Activity,
  Bell,
  BrainCircuit,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { initials } from "../utils/format";

const NAV = [
  { to: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, end: true },
  { to: "/admin/companies", label: "Entreprises", icon: Building2 },
  { to: "/admin/users", label: "Utilisateurs", icon: Users },
  { to: "/admin/tickets", label: "Tickets de support", icon: LifeBuoy },
  { to: "/admin/limule", label: "Base Limule", icon: BrainCircuit },
  { to: "/admin/logs", label: "Audit & logs", icon: Activity },
];

export function AdminShell() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("kompta_admin_collapsed") === "true"
  );

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

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("kompta_admin_collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 text-white">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-black/30 backdrop-blur transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-4">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black">
                <ShieldAlert size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">KOMPTA</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Super Admin</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    collapsed ? "justify-center" : "gap-3"
                  } ${
                    isActive
                      ? "bg-gradient-to-r from-violet-600/40 to-fuchsia-600/30 text-white shadow"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            title={collapsed ? "Déconnexion" : undefined}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white ${
              collapsed ? "justify-center" : "gap-3"
            }`}
          >
            <LogOut size={17} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={`transition-all duration-200 ${collapsed ? "pl-16" : "pl-64"}`}>
        <header className="sticky top-0 z-30 border-b border-white/10 bg-black/40 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
              <span>KOMPTA Platform</span>
              <span>/</span>
              <span className="text-white">Super Admin Console</span>
            </div>
            <div className="flex flex-1 max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <Search size={14} className="text-white/40" />
              <input
                placeholder="Rechercher entreprise, utilisateur, ticket…"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10">
                <Bell size={16} />
              </button>
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-black">
                  {initials(user?.full_name ?? "SA")}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-bold">{user?.full_name ?? "Super Admin"}</p>
                  <p className="text-[10px] font-bold uppercase text-violet-300">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
