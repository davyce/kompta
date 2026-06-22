import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export type AppToast = {
  id: number;
  message: string;
  detail?: string;
  tone: "info" | "warning" | "error" | "success";
};

export type NotificationRecord = {
  id: number;
  title: string;
  detail: string;
  tone: AppToast["tone"];
  createdAt: string;
  unread: boolean;
  /** Identifiant backend d'une diffusion admin persistée (dédoublonnage). */
  broadcastId?: number;
};

type WSNotification = {
  type: "teras_alert" | "business_alert" | "sync" | "info";
  title: string;
  detail?: string;
  count?: number;
  severity?: "critical" | "warning" | "info";
};

// WS_BASE doit être ABSOLU (ws://|wss://). Si l'API est en chemin relatif (/api),
// on dérive de l'origine courante → fonctionne en local ET derrière un tunnel https (wss).
const _API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
const WS_BASE = /^https?:/i.test(_API_URL)
  ? _API_URL.replace(/^http/i, "ws").replace(/\/api\/?$/, "")
  : `${window.location.origin.replace(/^http/i, "ws")}`;

const STORE_KEY = "kompta_notifications";
const MAX_HISTORY = 50;

let toastSeq = 0;
let recordSeq = 0;

function loadHistory(): NotificationRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationRecord[];
    if (Array.isArray(parsed)) {
      recordSeq = parsed.reduce((max, r) => Math.max(max, r.id), 0);
      return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(records: NotificationRecord[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}

/**
 * @param companyId      L'ID entreprise pour ouvrir la connexion WS.
 * @param onDisplay      Callback appelé pour chaque notification à afficher (toast UI).
 *                       Si absent, les notifications ne s'affichent pas mais sont bien
 *                       persistées en historique.
 */
export function useWebSocketNotifications(
  companyId: number | undefined,
  onDisplay?: (msg: string, tone: AppToast["tone"], detail?: string) => void,
) {
  const [liveAlertCount, setLiveAlertCount] = useState(0);
  const [history, setHistory] = useState<NotificationRecord[]>(() => loadHistory());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDisplayRef = useRef(onDisplay);
  onDisplayRef.current = onDisplay;

  const push = useCallback((msg: string, detail?: string, tone: AppToast["tone"] = "info") => {
    // Délègue l'affichage au système de toast unique de l'application
    onDisplayRef.current?.(msg, tone, detail);

    /* Persist to history */
    const record: NotificationRecord = {
      id: ++recordSeq,
      title: msg,
      detail: detail ?? "",
      tone,
      createdAt: new Date().toISOString(),
      unread: true,
    };
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((prev) => {
      const next = prev.map((r) => ({ ...r, unread: false }));
      saveHistory(next);
      return next;
    });
    setLiveAlertCount(0);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      try {
        const { ticket } = await api.realtimeTicket();
        if (cancelled) return;
        const ws = new WebSocket(`${WS_BASE}/api/ws/notifications/${companyId}?token=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;

        ws.onmessage = (e) => {
          try {
            const data: WSNotification = JSON.parse(e.data);
            if (data.type === "teras_alert") {
              setLiveAlertCount((n) => n + (data.count ?? 1));
              push(data.title, data.detail, "warning");
            } else if (data.type === "business_alert") {
              setLiveAlertCount((n) => n + (data.count ?? 1));
              const tone = data.severity === "critical" ? "error" : data.severity === "warning" ? "warning" : "info";
              push(data.title, data.detail, tone);
            } else if (data.type === "sync") {
              push(data.title, data.detail, "success");
            } else {
              push(data.title, data.detail, "info");
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (!cancelled) reconnectTimer.current = setTimeout(connect, 8000);
        };
      } catch {
        if (!cancelled) reconnectTimer.current = setTimeout(connect, 8000);
      }
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [companyId, push]);

  // Récupère les diffusions admin persistées (GET /notifications) et les fusionne
  // dans l'historique. Indispensable pour les utilisateurs hors-ligne au moment
  // de l'envoi : le WebSocket ne couvre que les clients connectés.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const broadcasts = await api.notifications();
        if (cancelled || broadcasts.length === 0) return;
        setHistory((prev) => {
          const seen = new Set(prev.map((r) => r.broadcastId).filter((x): x is number => x != null));
          const fresh = broadcasts
            .filter((b) => !seen.has(b.id))
            .map<NotificationRecord>((b) => ({
              id: ++recordSeq,
              title: b.title,
              detail: b.message,
              tone: b.type === "critical" ? "error" : b.type === "warning" ? "warning" : "info",
              createdAt: b.created_at ?? new Date().toISOString(),
              unread: true,
              broadcastId: b.id,
            }));
          if (fresh.length === 0) return prev;
          const next = [...fresh, ...prev]
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .slice(0, MAX_HISTORY);
          saveHistory(next);
          return next;
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { liveAlertCount, push, history, markAllRead, clearHistory };
}
