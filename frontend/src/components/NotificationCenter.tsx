import { useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, Sparkles, Trash2, X, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { NotificationRecord } from "../hooks/useWebSocketNotifications";

const toneIcon: Record<NotificationRecord["tone"], LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
};

const toneClasses: Record<NotificationRecord["tone"], string> = {
  info: "bg-blue-50 text-blue-600",
  warning: "bg-amber-50 text-amber-600",
  error: "bg-red-50 text-red-600",
  success: "bg-emerald-50 text-emerald-600",
};

function timeAgo(iso: string, tr: TFunction) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return tr("components.notifications.now");
  if (diff < 3600) return tr("components.notifications.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return tr("components.notifications.hoursAgo", { count: Math.floor(diff / 3600) });
  return tr("components.notifications.daysAgo", { count: Math.floor(diff / 86400) });
}

type Props = {
  open: boolean;
  onClose: () => void;
  notifications: NotificationRecord[];
  onMarkAllRead: () => void;
  onClear: () => void;
};

export function NotificationCenter({ open, onClose, notifications, onMarkAllRead, onClear }: Props) {
  const { t: tr } = useTranslation();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const items = filter === "unread" ? notifications.filter((n) => n.unread) : notifications;
  const unreadCount = notifications.filter((n) => n.unread).length;

  if (!open) return null;

  return (
    <>
      <button className="fixed inset-0 z-40 bg-ink/25" onClick={onClose} aria-label={tr("components.notifications.close")} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-black/[0.06] bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-black/[0.05] px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
            <Bell size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-ink">{tr("components.notifications.title")}</h2>
            <p className="text-xs font-medium text-[#717182]">
              {tr("components.notifications.summary", { unread: unreadCount, total: notifications.length })}
            </p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-stone-50" aria-label={tr("common.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-5 py-3">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === "all" ? "bg-emerald-600 text-white" : "bg-black/[0.04] text-[#17211f]"}`}
          >
            {tr("components.notifications.all")}
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === "unread" ? "bg-emerald-600 text-white" : "bg-black/[0.04] text-[#17211f]"}`}
          >
            {tr("components.notifications.unread")}
          </button>
          <button onClick={onMarkAllRead} className="ml-auto text-xs font-bold text-emerald-600 hover:underline">
            {tr("components.notifications.markAllRead")}
          </button>
          <button onClick={onClear} className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-black/[0.04] hover:text-[#17211f]" title={tr("components.notifications.clearHistory")}>
            <Trash2 size={14} />
          </button>
        </div>
        <div className="flex-1 divide-y divide-stone-100 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles size={32} className="mb-3 text-stone-300" />
              <p className="text-sm font-semibold text-[#717182]">
                {filter === "unread" ? tr("components.notifications.noUnread") : tr("components.notifications.empty")}
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-stone-400">
                {tr("components.notifications.emptyHint")}
              </p>
            </div>
          ) : (
            items.map((n) => {
              const Icon = toneIcon[n.tone];
              return (
                <article key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.unread ? "bg-emerald-50/35" : ""}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClasses[n.tone]}`}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{n.title}</p>
                    {n.detail && <p className="mt-0.5 text-xs text-[#17211f]">{n.detail}</p>}
                    <p className="mt-1 text-xs font-medium text-stone-400">{timeAgo(n.createdAt, tr)}</p>
                  </div>
                  {n.unread && <span className="mt-3 h-2 w-2 rounded-full bg-emerald-600" />}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
