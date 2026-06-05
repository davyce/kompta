import { Bell, Building2, LogOut, Moon, Sun, Users2 } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { initials } from "../../utils/format";
import { useTheme } from "../../hooks/useTheme";
import { useState } from "react";
import { useWebSocketNotifications } from "../../hooks/useWebSocketNotifications";

export function GroupsShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { history: notifications, markAllRead, clearHistory } = useWebSocketNotifications(user?.company_id);
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="min-h-dvh bg-[#f7f8fe] dark:bg-[#0f1117] flex flex-col">
      {/* ── Topbar ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-black/[0.08] bg-white shadow-sm backdrop-blur px-4 dark:border-white/[0.06] dark:bg-[#111318]/95 dark:shadow-none">
        {/* Brand */}
        <button
          onClick={() => navigate("/groups")}
          className="flex items-center gap-2 shrink-0"
        >
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 text-white font-black text-sm shadow-sm">
            G
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-black text-[#17211f] dark:text-white leading-tight">KOMPTA</p>
            <p className="text-[10px] text-blue-800 font-bold leading-tight">Groupes & Organisations</p>
          </div>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Workspace switcher — masqué pour les membres de groupe sans accès entreprise */}
        {user?.role !== "membre_groupe" && (
          <button
            onClick={() => navigate("/")}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 hover:border-blue-400 transition dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            <Building2 size={14} />
            Espace Entreprise
          </button>
        )}

        {/* Theme */}
        <button
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-blue-50 hover:text-blue-800 text-[#717182] transition dark:hover:bg-white/[0.06] dark:text-white/60"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications réelles */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markAllRead(); }}
            className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-blue-50 hover:text-blue-800 text-[#717182] transition dark:hover:bg-white/[0.06] dark:text-white/60"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-800 text-[9px] font-bold text-white ring-2 ring-white dark:ring-[#111318]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-black/[0.08] bg-white shadow-lg dark:border-white/10 dark:bg-[#1e2229] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <p className="text-sm font-bold text-[#17211f] dark:text-white">Notifications</p>
                  {notifications.length > 0 && (
                    <button onClick={clearHistory} className="text-xs text-[#717182] hover:text-rose-500 transition">Tout effacer</button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[#717182]">Aucune notification</p>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <div key={n.id} className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#17211f] dark:text-white">{n.title}</p>
                        {n.detail && <p className="text-xs text-[#717182] mt-0.5 line-clamp-2">{n.detail}</p>}
                        <p className="text-[10px] text-[#aaaabc] mt-1">{new Date(n.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1.5 hover:border-blue-400 transition dark:border-white/10 dark:bg-white/5"
          >
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 text-[11px] font-bold text-white">
              {initials(user?.full_name ?? "?")}
            </div>
            <span className="hidden text-sm font-semibold text-[#17211f] dark:text-white lg:block">
              {user?.full_name?.split(" ")[0]}
            </span>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-50 w-52 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#1e2229]">
                <div className="px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06] mb-1">
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white">{user?.full_name}</p>
                  <p className="text-xs text-[#717182]">{user?.email}</p>
                </div>
                {user?.role !== "membre_groupe" && (
                  <button
                    onClick={() => { navigate("/"); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#17211f] hover:bg-black/[0.04] dark:text-white dark:hover:bg-white/[0.05]"
                  >
                    <Building2 size={14} className="text-[#717182]" />
                    Espace Entreprise
                  </button>
                )}
                <button
                  onClick={() => { logout(); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <LogOut size={14} />
                  Déconnexion
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Outlet />
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex lg:hidden items-center justify-around border-t border-black/[0.08] bg-white/95 backdrop-blur dark:border-white/[0.08] dark:bg-[#111318]/95 h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => navigate("/groups")}
          className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-blue-800 dark:text-blue-500"
        >
          <Users2 size={20} />
          <span>Groupes</span>
        </button>
        {user?.role !== "membre_groupe" && (
          <button
            onClick={() => navigate("/")}
            className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-[#717182]"
          >
            <Building2 size={20} />
            <span>Entreprise</span>
          </button>
        )}
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-[#717182]"
        >
          <div className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-blue-700 to-blue-900 text-[9px] font-bold text-white">
            {initials(user?.full_name ?? "?")}
          </div>
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}
