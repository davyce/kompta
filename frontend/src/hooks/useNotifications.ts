import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../services/api";

export type SSENotification = {
  type: "alert" | "connected";
  id?: number;
  title?: string;
  severity?: string;
  module?: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<SSENotification[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!getToken()) return;
    let cancelled = false;

    function scheduleReconnect() {
      if (cancelled) return;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(openStream, 8000);
    }

    function openStream() {
      // Ticket éphémère (60s) au lieu du JWT long (8h) dans l'URL.
      // EventSource ne peut pas envoyer d'en-tête Authorization — on passe donc
      // un ticket à usage temps réel, qui ne fuit pas le jeton de session.
      api.realtimeTicket()
        .then(({ ticket }) => {
          if (cancelled) return;
          const url = `${API_URL}/notifications/stream?token=${encodeURIComponent(ticket)}`;
          const es = new EventSource(url);
          esRef.current = es;

          es.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data) as SSENotification;
              if (data.type === "connected") {
                setConnected(true);
                return;
              }
              if (data.type === "alert") {
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === data.id)) return prev;
                  return [data, ...prev].slice(0, 20);
                });
              }
            } catch { /* ignore parse errors */ }
          };

          es.onerror = () => {
            setConnected(false);
            es.close();
            esRef.current = null;
            scheduleReconnect();
          };
        })
        .catch(() => {
          setConnected(false);
          scheduleReconnect();
        });
    }

    openStream();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  function clearAll() { setNotifications([]); }

  return { notifications, connected, clearAll };
}

// Alternative: polling fallback using TERAS alerts API
export function useNotificationsPolling(enabled = true) {
  const [notifications, setNotifications] = useState<SSENotification[]>([]);
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    if (!enabled) return;

    // Poll TERAS alerts via regular API every 60 seconds
    async function poll() {
      try {
        const { api } = await import("../services/api");
        const alerts = await api.terasAlerts();
        const newAlerts = alerts.filter(a => a.status === "open" && !seenIds.current.has(a.id));
        if (newAlerts.length > 0) {
          newAlerts.forEach(a => seenIds.current.add(a.id));
          setNotifications(prev => [
            ...newAlerts.map(a => ({ type: "alert" as const, id: a.id, title: a.title, severity: a.severity, module: a.module })),
            ...prev
          ].slice(0, 20));
        }
      } catch { /* ignore */ }
    }

    poll(); // immediate
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [enabled]);

  function clearAll() { setNotifications([]); }
  return { notifications, clearAll };
}
