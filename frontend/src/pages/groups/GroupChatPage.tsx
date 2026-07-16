import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Send, Hash, Loader2, Trash2, Plus, X, MessageSquare, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../../app/AuthContext";
import { LimuleIcon } from "../../components/LimuleAvatar";
import { api } from "../../services/api";
import i18n from "../../i18n";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
// WS absolu (ws://|wss://). API relative (/api) → dérive de l'origine (tunnel https → wss).
const WS_BASE = /^https?:/i.test(API_URL)
  ? API_URL.replace(/^http/i, "ws").replace(/\/api\/?$/, "")
  : `${window.location.origin.replace(/^http/i, "ws")}`;

function formatMessageTime(value: string) {
  try {
    return new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatDateSeparator(value: string, tr: TFunction) {
  try {
    const d = new Date(value);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) =>
      a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (same(d, today)) return tr("groupPages.chat.today");
    if (same(d, yest)) return tr("groupPages.chat.yesterday");
    return new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(d);
  } catch {
    return "";
  }
}

function dateKey(value: string) {
  try {
    return new Date(value).toDateString();
  } catch {
    return value;
  }
}

/* Mise en évidence des @mentions dans le corps du message, comme sur ChatPage. */
function renderContentWithMentions(content: string) {
  const parts = content.split(/(@[\wÀ-ÿ]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-semibold text-blue-700 dark:text-blue-300">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function GroupChatPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: rooms = [] } = useQuery({ queryKey: ["group-chat-rooms", id], queryFn: () => api.groupChatRooms(id) });
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id), enabled: !!id });

  const createRoom = useMutation({
    mutationFn: () => api.createChatRoom(id, newRoomName.trim()),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ["group-chat-rooms", id] });
      setActiveRoomId(room.id);
      setShowCreateRoom(false);
      setNewRoomName("");
    },
  });
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["group-chat-messages", id, activeRoomId],
    queryFn: () => api.groupChatMessages(id, activeRoomId!, 60),
    enabled: !!activeRoomId,
  });
  const activeRoom = rooms.find(r => r.id === activeRoomId);

  // Sélectionner le premier salon automatiquement
  useEffect(() => { if (rooms.length && !activeRoomId) setActiveRoomId(rooms[0].id); }, [rooms, activeRoomId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // WebSocket pour temps réel
  useEffect(() => {
    if (!activeRoomId || !token) return;
    let cancelled = false;
    api.realtimeTicket()
      .then(({ ticket }) => {
        if (cancelled) return;
        const ws = new WebSocket(`${WS_BASE}/api/groups/${id}/chat/rooms/${activeRoomId}/ws?token=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;
        ws.onopen = () => setWsConnected(true);
        ws.onmessage = () => qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] });
        ws.onerror = () => setWsConnected(false);
        ws.onclose = () => setWsConnected(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      setWsConnected(false);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [activeRoomId, id, token, qc]);

  const send = useMutation({
    mutationFn: () => api.sendGroupMessage(id, activeRoomId!, draft.trim()),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] }); },
  });
  const del = useMutation({
    mutationFn: (msgId: number) => api.deleteGroupMessage(id, activeRoomId!, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] }),
  });

  return (
    <>
    <div className="flex h-full min-h-[560px] overflow-hidden">
      {/* Rooms sidebar */}
      <div className="w-28 shrink-0 border-r border-black/[0.05] bg-[#f6f7fb] dark:border-white/[0.05] dark:bg-[#161920] sm:w-44 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-[10px] font-bold uppercase text-[#717182]">{tr("groupPages.chat.rooms")}</p>
          {group?.can_manage && (
            <button
              onClick={() => setShowCreateRoom(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#717182] hover:bg-blue-100 hover:text-blue-800 dark:hover:bg-blue-800/15 dark:hover:text-blue-400 transition"
              title={tr("groupPages.chat.createRoom")}
              aria-label={tr("groupPages.chat.createRoom")}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
          {rooms.map(r => (
            <button key={r.id} onClick={() => setActiveRoomId(r.id)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left transition ${activeRoomId === r.id ? "bg-blue-100 dark:bg-blue-800/15 font-semibold text-blue-900 dark:text-blue-400" : "text-[#17211f] dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"}`}>
              <Hash size={11} />
              <span className="truncate text-xs">{r.name}</span>
            </button>
          ))}
          {rooms.length === 0 && (
            <div className="px-2 py-4 text-center">
              <Hash size={20} className="mx-auto text-[#c4c4cf] mb-1.5" />
              <p className="text-[11px] text-[#717182]">{tr("groupPages.chat.noRoom")}</p>
              {group?.can_manage && (
                <button onClick={() => setShowCreateRoom(true)} className="mt-2 text-[11px] font-semibold text-blue-800 hover:underline">
                  {tr("groupPages.chat.createFirst")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-black/[0.05] bg-white px-3 py-3 dark:border-white/[0.05] dark:bg-[#1e2229] sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-[#17211f] dark:text-white">{activeRoom?.name ?? tr("groupPages.chat.roomFallback")}</p>
                <span className="hidden rounded-full border border-black/[0.08] px-2 py-0.5 text-[10px] font-bold text-[#717182] dark:border-white/[0.08] sm:inline-flex">
                  {tr("groupPages.chat.messageCount", { count: messages.length })}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#717182]">
                {wsConnected ? <Wifi size={11} className="text-emerald-600" /> : <WifiOff size={11} className="text-amber-500" />}
                <span>{wsConnected ? tr("groupPages.chat.realtimeConnected") : tr("groupPages.chat.refreshSync")}</span>
              </div>
            </div>
            <button
              onClick={() => setAssistantOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-800 to-emerald-700 px-3 py-2 text-xs font-black text-white shadow-sm shadow-blue-900/15 transition hover:brightness-105"
            >
              <Bot size={13} />
              Limule
            </button>
          </div>
        </div>
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#fbfbfd] dark:bg-[#171a21]">
          {!activeRoomId && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center py-10">
              <MessageSquare size={36} className="text-blue-200 dark:text-blue-700/40" />
              <p className="text-sm text-[#717182]">
                {rooms.length === 0 ? tr("groupPages.chat.createFirstPrompt") : tr("groupPages.chat.selectRoom")}
              </p>
              {rooms.length === 0 && group?.can_manage && (
                <button onClick={() => setShowCreateRoom(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white hover:bg-blue-900 transition">
                  <Plus size={14} /> {tr("groupPages.chat.createRoom")}
                </button>
              )}
            </div>
          )}
          {isLoading && <div className="flex h-32 items-center justify-center"><Loader2 size={20} className="animate-spin text-blue-700" /></div>}
          {messages.map((m, idx) => {
            const isMe = m.sender_name === user?.full_name;
            const deleted = !!m.deleted_at;
            const prev = messages[idx - 1];
            const showDateSep = !prev || dateKey(prev.created_at) !== dateKey(m.created_at);
            const showSenderName = !isMe && (!prev || prev.sender_name !== m.sender_name || dateKey(prev.created_at) !== dateKey(m.created_at));
            return (
              <div key={m.id}>
                {showDateSep && (
                  <div className="flex items-center justify-center my-3">
                    <span className="rounded-full bg-black/[0.05] dark:bg-white/[0.07] px-3 py-1 text-[10px] font-bold text-[#717182] uppercase tracking-wide">
                      {formatDateSeparator(m.created_at, tr)}
                    </span>
                  </div>
                )}
                <div className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 text-white text-[10px] font-bold self-end ${!showSenderName && !isMe ? "invisible" : ""}`}>
                    {m.sender_name.split(" ").map((p: string) => p[0]).join("").slice(0, 2)}
                  </div>
                <div className={`max-w-[82%] sm:max-w-[70%] ${isMe ? "items-end" : ""}`}>
                  {showSenderName && <p className="text-[10px] font-bold text-[#717182] mb-0.5 px-1">{m.sender_name}</p>}
                  <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-gradient-to-r from-blue-800 to-blue-900 text-white" : "bg-[#ececf2] dark:bg-white/[0.07] text-[#17211f] dark:text-white"} ${deleted ? "opacity-50 italic" : ""}`}>
                    {deleted ? tr("groupPages.chat.deletedMessage") : renderContentWithMentions(m.content)}
                  </div>
                  {/* Carte d'action Limule */}
                  {!deleted && m.ai_action?.detected && (
                    <div className="mt-1 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      <LimuleIcon size={11} className="inline mr-1" />
                      {m.ai_action.title}
                    </div>
                  )}
                  <p className={`mt-0.5 px-1 text-[10px] text-[#9a9aaa] ${isMe ? "text-right" : ""}`}>
                    {formatMessageTime(m.created_at)}
                  </p>
                  {isMe && !deleted && (
                    <div className="mt-0.5 flex justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => del.mutate(m.id)} aria-label={tr("groupPages.chat.deleteMessage")} className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={10} /></button>
                    </div>
                  )}
                </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <div className="border-t border-black/[0.05] dark:border-white/[0.05] p-3 bg-white dark:bg-[#1e2229]">
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2">
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && draft.trim()) { e.preventDefault(); send.mutate(); } }}
              placeholder={activeRoomId ? tr("groupPages.chat.writeMessage") : tr("groupPages.chat.selectRoom")}
              disabled={!activeRoomId}
              className="flex-1 bg-transparent text-sm text-[#17211f] dark:text-white outline-none placeholder:text-[#717182] disabled:cursor-not-allowed" />
            <button onClick={() => send.mutate()} disabled={!draft.trim() || send.isPending || !activeRoomId}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-800 text-white disabled:bg-black/10 dark:disabled:bg-white/10">
              {send.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

      {assistantOpen && (
        <aside className="fixed inset-x-3 bottom-4 top-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-2xl shadow-slate-950/20 dark:border-white/[0.08] dark:bg-[#1e2229] xl:static xl:inset-auto xl:z-auto xl:w-80 xl:shrink-0 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-800 text-white">
                <Bot size={16} />
              </div>
              <div>
                <p className="text-sm font-black text-[#17211f] dark:text-white">{tr("groupPages.chat.limuleTitle")}</p>
                <p className="text-[10px] font-semibold text-[#717182]">{tr("groupPages.chat.limuleSubtitle")}</p>
              </div>
            </div>
            <button
              onClick={() => setAssistantOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
              title={tr("groupPages.chat.closeLimule")}
              aria-label={tr("groupPages.chat.closeLimule")}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center">
              <LimuleIcon size={30} className="text-blue-300 dark:text-blue-500/60" />
              <div>
                <p className="font-black text-[#17211f] dark:text-white">{tr("groupPages.chat.assistantConnected")}</p>
                <p className="mt-1 text-sm text-[#717182]">{tr("groupPages.chat.assistantPrompt")}</p>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>

      {/* Modal création de salon */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("groupPages.chat.newRoom")}</h3>
              <button onClick={() => { setShowCreateRoom(false); setNewRoomName(""); }} aria-label={tr("common.close")} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("groupPages.chat.roomName")}</label>
                <input
                  autoFocus
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && newRoomName.trim() && createRoom.mutate()}
                  placeholder={tr("groupPages.chat.roomNamePlaceholder")}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-blue-700"
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.06]">
              <button
                onClick={() => { setShowCreateRoom(false); setNewRoomName(""); }}
                className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
              >
                {tr("common.cancel")}
              </button>
              <button
                onClick={() => createRoom.mutate()}
                disabled={!newRoomName.trim() || createRoom.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-800 hover:bg-blue-900 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
              >
                {createRoom.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {tr("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
