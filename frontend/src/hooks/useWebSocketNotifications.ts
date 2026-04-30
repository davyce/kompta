import { useCallback, useEffect, useRef, useState } from "react";

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
};

type WSNotification = {
  type: "teras_alert" | "sync" | "info";
  title: string;
  detail?: string;
  count?: number;
};

const WS_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api")
  .replace(/^http/, "ws")
  .replace(/\/api$/, "");

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

export function useWebSocketNotifications(companyId: number | undefined) {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [liveAlertCount, setLiveAlertCount] = useState(0);
  const [history, setHistory] = useState<NotificationRecord[]>(() => loadHistory());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((msg: string, detail?: string, tone: AppToast["tone"] = "info") => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-4), { id, message: msg, detail, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);

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

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      const ws = new WebSocket(`${WS_BASE}/api/ws/notifications/${companyId}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data: WSNotification = JSON.parse(e.data);
          if (data.type === "teras_alert") {
            setLiveAlertCount((n) => n + (data.count ?? 1));
            push(data.title, data.detail, "warning");
          } else if (data.type === "sync") {
            push(data.title, data.detail, "success");
          } else {
            push(data.title, data.detail, "info");
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        reconnectTimer.current = setTimeout(connect, 8000);
      };
    }

    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [companyId, push]);

  return { toasts, dismiss, liveAlertCount, push, history, markAllRead, clearHistory };
}
