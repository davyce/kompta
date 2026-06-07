import { useEffect, useState } from "react";
import { CloudOff, Cloud, CloudUpload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listPending } from "../lib/offlineQueue";

type Status = "online" | "pending" | "offline";

/**
 * SyncStatusBadge — affiche l'état de synchronisation POS hors-ligne.
 *  - 🟢 En ligne (file vide + navigator.onLine)
 *  - 🟡 X en attente (ventes IndexedDB en file)
 *  - 🔴 Hors-ligne (navigator.onLine === false)
 *
 * Polling toutes les 30 secondes + écoute des events online/offline.
 */
export function SyncStatusBadge({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const { t: tr } = useTranslation();
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const items = await listPending();
        if (!cancelled) setPending(items.length);
      } catch {
        if (!cancelled) setPending(0);
      }
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    function handleOnline() { setOnline(true); refresh(); }
    function handleOffline() { setOnline(false); refresh(); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Also refresh on visibility change (sync triggers from POS page)
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const status: Status = !online ? "offline" : pending > 0 ? "pending" : "online";

  const config = {
    online: {
      label: tr("components.sync.online"),
      icon: Cloud,
      dot: "bg-emerald-500",
      ring: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      title: tr("components.sync.upToDate"),
    },
    pending: {
      label: tr("components.sync.pending", { count: pending }),
      icon: CloudUpload,
      dot: "bg-amber-500",
      ring: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      title: tr("components.sync.pendingTitle", { count: pending }),
    },
    offline: {
      label: tr("components.sync.offline"),
      icon: CloudOff,
      dot: "bg-rose-500",
      ring: "border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      title: tr("components.sync.offlineTitle"),
    },
  }[status];

  const Icon = config.icon;
  const interactive = typeof onClick === "function";
  const hint = interactive
    ? `${config.title} — ${pending > 0 ? tr("components.sync.clickCashboxAndSync") : tr("components.sync.clickCashbox")}`
    : config.title;

  if (compact) {
    const Tag = interactive ? "button" : "span";
    return (
      <Tag
        type={interactive ? "button" : undefined}
        onClick={onClick}
        title={hint}
        aria-label={hint}
        className={`relative grid h-9 w-9 place-items-center rounded-lg text-[#717182] dark:text-white/60 ${interactive ? "hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition" : ""}`}
      >
        <Icon size={17} />
        <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${config.dot} ${status !== "online" ? "animate-pulse" : ""}`} />
      </Tag>
    );
  }

  const Tag = interactive ? "button" : "span";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      title={hint}
      aria-label={hint}
      className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${config.ring} ${interactive ? "cursor-pointer hover:brightness-95 transition" : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status !== "online" ? "animate-pulse" : ""}`} />
      <Icon size={13} />
      <span>{config.label}</span>
    </Tag>
  );
}
