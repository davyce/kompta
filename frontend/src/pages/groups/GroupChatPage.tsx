import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, Send, Hash, Loader2, Trash2, Reply, Plus, X, MessageSquare, Wifi, WifiOff, Paperclip, Download, File as FileIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../../app/AuthContext";
import { LimuleIcon } from "../../components/LimuleAvatar";
import { api } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import i18n from "../../i18n";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
// WS absolu (ws://|wss://). API relative (/api) → dérive de l'origine (tunnel https → wss).
const WS_BASE = /^https?:/i.test(API_URL)
  ? API_URL.replace(/^http/i, "ws").replace(/\/api\/?$/, "")
  : `${window.location.origin.replace(/^http/i, "ws")}`;
const EMOJI_QUICK = ["👍","❤️","😂","🎉","👏","🙏"];

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

const IMAGE_MIME = /^image\//i;
function isImageMedia(m: { message_type?: string; media_url?: string }) {
  if (m.message_type === "image") return true;
  if (m.media_url && /\.(png|jpe?g|gif|webp|avif|heic|heif)$/i.test(m.media_url)) return true;
  return false;
}

export function GroupChatPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomType, setNewRoomType] = useState("general");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const { data: rooms = [] } = useQuery({ queryKey: ["group-chat-rooms", id], queryFn: () => api.groupChatRooms(id) });
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id), enabled: !!id });

  const createRoom = useMutation({
    mutationFn: () => api.createChatRoom(id, newRoomName.trim(), newRoomType),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ["group-chat-rooms", id] });
      setActiveRoomId(room.id);
      setShowCreateRoom(false);
      setNewRoomName("");
      setNewRoomType("general");
    },
  });
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["group-chat-messages", id, activeRoomId],
    queryFn: () => api.groupChatMessages(id, activeRoomId!, 60),
    enabled: !!activeRoomId,
  });
  const activeRoom = rooms.find(r => r.id === activeRoomId);
  const chatTranscript = messages
    .filter(m => !m.deleted_at && m.content?.trim())
    .slice(-40)
    .map(m => `${m.sender_name} (${formatMessageTime(m.created_at)}): ${m.content.trim()}`);

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
    mutationFn: () => api.sendGroupMessage(id, activeRoomId!, draft.trim(), "text", replyTo ?? undefined),
    onSuccess: () => { setDraft(""); setReplyTo(null); qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] }); },
  });
  const react = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: number; emoji: string }) => api.reactToGroupMessage(id, activeRoomId!, msgId, emoji),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] }),
  });
  const del = useMutation({
    mutationFn: (msgId: number) => api.deleteGroupMessage(id, activeRoomId!, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] }),
  });

  const uploadMedia = useMutation({
    mutationFn: (file: File) => {
      const messageType = file.type.startsWith("image/") ? "image"
        : file.type.startsWith("video/") ? "video"
        : file.type.startsWith("audio/") ? "audio"
        : "document";
      return api.uploadGroupChatMedia(id, activeRoomId!, file, {
        message_type: messageType,
        reply_to_id: replyTo ?? undefined,
      });
    },
    onSuccess: () => {
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tr("groupPages.chat.uploadFailed")),
  });

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && activeRoomId) uploadMedia.mutate(f);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && activeRoomId) uploadMedia.mutate(f);
  }
  const summarizeChat = useMutation({
    mutationFn: () => api.groupSummarizeChat(id, chatTranscript, true),
    onMutate: () => {
      setAssistantOpen(true);
      setAssistantError("");
      setAssistantAnswer("");
    },
    onSuccess: (data) => {
      setAssistantAnswer(data.summary || tr("groupPages.chat.notEnoughContent"));
    },
    onError: (err) => setAssistantError(err instanceof Error ? err.message : tr("groupPages.chat.summaryUnavailable")),
  });
  const askLimule = useMutation({
    mutationFn: () =>
      api.groupAskAI(
        id,
        [
          assistantQuestion.trim(),
          "",
          tr("groupPages.chat.roomContext", { room: activeRoom?.name ?? tr("groupPages.chat.groupFallback") }),
          ...chatTranscript,
        ].join("\n")
      ),
    onMutate: () => {
      setAssistantOpen(true);
      setAssistantError("");
      setAssistantAnswer("");
    },
    onSuccess: (data) => setAssistantAnswer(data.answer),
    onError: (err) => setAssistantError(err instanceof Error ? err.message : tr("groupPages.chat.limuleUnavailable")),
  });

  function handleSummarizeChat() {
    if (chatTranscript.length === 0) {
      setAssistantOpen(true);
      setAssistantAnswer("");
      setAssistantError(tr("groupPages.chat.noRealMessage"));
      return;
    }
    summarizeChat.mutate();
  }

  function handleAskLimule() {
    if (!assistantQuestion.trim()) {
      setAssistantError(tr("groupPages.chat.writeQuestion"));
      return;
    }
    askLimule.mutate();
  }

  const TYPE_BADGE: Record<string, string> = { general: "🏠", bureau: "👔", finance: "💰", event: "🎉", private: "🔒" };
  const assistantPending = summarizeChat.isPending || askLimule.isPending;

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
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
          {rooms.map(r => (
            <button key={r.id} onClick={() => setActiveRoomId(r.id)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left transition ${activeRoomId === r.id ? "bg-blue-100 dark:bg-blue-800/15 font-semibold text-blue-900 dark:text-blue-400" : "text-[#17211f] dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"}`}>
              <span className="text-[11px]">{TYPE_BADGE[r.type] ?? "#"}</span>
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleSummarizeChat}
                disabled={!activeRoomId || assistantPending}
                className="hidden items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 sm:flex"
              >
                <FileText size={13} />
                {tr("groupPages.chat.summarize")}
              </button>
              <button
                onClick={() => setAssistantOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-800 to-emerald-700 px-3 py-2 text-xs font-black text-white shadow-sm shadow-blue-900/15 transition hover:brightness-105"
              >
                <Bot size={13} />
                Limule
              </button>
            </div>
          </div>
        </div>
        {/* Messages area — drag&drop pour upload fichiers */}
        <div
          className={`flex-1 overflow-y-auto p-4 space-y-2 bg-[#fbfbfd] dark:bg-[#171a21] transition ${dragOver ? "ring-4 ring-inset ring-blue-500/40" : ""}`}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
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
            const mediaUrl = m.media_url ? api.groupChatMediaUrl(m.media_url) : null;
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
                  {/* Bulle texte ou média */}
                  {mediaUrl && isImageMedia(m) ? (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
                      <img src={mediaUrl} alt={m.content || tr("groupPages.chat.imageAlt")} className="max-h-72 w-auto max-w-full object-cover" loading="lazy" />
                    </a>
                  ) : mediaUrl ? (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 ${isMe ? "bg-gradient-to-r from-blue-800 to-blue-900 text-white" : "bg-[#ececf2] dark:bg-white/[0.07] text-[#17211f] dark:text-white"} hover:opacity-90 transition`}
                    >
                      <FileIcon size={18} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold">{m.content || tr("groupPages.chat.file")}</p>
                        <p className="text-[10px] opacity-70">{tr("groupPages.chat.clickToOpen")}</p>
                      </div>
                      <Download size={14} className="shrink-0 opacity-70" />
                    </a>
                  ) : (
                    <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-gradient-to-r from-blue-800 to-blue-900 text-white" : "bg-[#ececf2] dark:bg-white/[0.07] text-[#17211f] dark:text-white"} ${deleted ? "opacity-50 italic" : ""}`}>
                      {deleted ? tr("groupPages.chat.deletedMessage") : m.content}
                    </div>
                  )}
                  <p className={`mt-0.5 px-1 text-[10px] text-[#9a9aaa] ${isMe ? "text-right" : ""}`}>
                    {formatMessageTime(m.created_at)}
                    {m.edited_at && <span className="ml-1 italic opacity-70">· {tr("groupPages.chat.edited")}</span>}
                  </p>
                  {/* Reactions */}
                  {!deleted && Object.keys(m.reactions ?? {}).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5 px-1">
                      {Object.entries(m.reactions).map(([e, c]) => (
                        <button key={e} onClick={() => react.mutate({ msgId: m.id, emoji: e })}
                          className="flex items-center gap-0.5 rounded-full border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-1.5 py-0.5 text-[11px] hover:bg-blue-50 dark:hover:bg-blue-800/10">
                          {e} <span className="text-[#717182]">{c}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Actions hover */}
                  {!deleted && (
                    <div className={`mt-0.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? "justify-end" : "justify-start"}`}>
                      {EMOJI_QUICK.map(e => (
                        <button key={e} onClick={() => react.mutate({ msgId: m.id, emoji: e })} className="text-sm hover:scale-125 transition-transform">{e}</button>
                      ))}
                      <button onClick={() => setReplyTo(m.id)} className="rounded px-1.5 py-0.5 text-[10px] text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"><Reply size={10} /></button>
                      {isMe && <button onClick={() => del.mutate(m.id)} className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={10} /></button>}
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
          {replyTo && <div className="mb-1 flex items-center gap-2 text-xs text-[#717182]"><Reply size={10} />{tr("groupPages.chat.replyTo", { id: replyTo })} <button onClick={() => setReplyTo(null)}><span className="text-rose-400 ml-1">✕</span></button></div>}
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2">
            {/* Bouton pièce jointe */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeRoomId || uploadMedia.isPending}
              title={tr("groupPages.chat.attach")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#717182] hover:bg-blue-100 hover:text-blue-800 transition disabled:opacity-40"
            >
              {uploadMedia.isPending ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={16} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf,.docx,.xlsx,.txt"
              onChange={handleFilePick}
              className="hidden"
            />
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
          <p className="mt-1.5 hidden text-[10px] text-[#aaaabc] sm:block">
            {tr("groupPages.chat.dropHint")}
          </p>
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
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {assistantPending ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center">
                <Loader2 size={24} className="animate-spin text-blue-800 dark:text-blue-300" />
                <p className="text-sm font-semibold text-[#717182]">{tr("groupPages.chat.limuleAnalyzing")}</p>
              </div>
            ) : assistantError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {assistantError}
              </div>
            ) : assistantAnswer ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {tr("groupPages.chat.aiWarning")}
                </div>
                <div className="whitespace-pre-wrap rounded-xl border border-black/[0.06] bg-[#f8fafc] p-4 text-sm leading-relaxed text-[#17211f] dark:border-white/[0.06] dark:bg-[#161920] dark:text-white">
                  {assistantAnswer}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center">
                <LimuleIcon size={30} className="text-blue-300 dark:text-blue-500/60" />
                <div>
                  <p className="font-black text-[#17211f] dark:text-white">{tr("groupPages.chat.assistantConnected")}</p>
                  <p className="mt-1 text-sm text-[#717182]">{tr("groupPages.chat.assistantPrompt")}</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-black/[0.06] p-3 dark:border-white/[0.06]">
            <textarea
              value={assistantQuestion}
              onChange={(e) => setAssistantQuestion(e.target.value)}
              rows={3}
              placeholder={tr("groupPages.chat.assistantPlaceholder")}
              className="w-full resize-none rounded-xl border border-black/[0.08] bg-[#f6f7fb] px-3 py-2 text-sm text-[#17211f] outline-none placeholder:text-[#717182] focus:border-blue-700 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={handleSummarizeChat}
                disabled={!activeRoomId || assistantPending}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] px-3 py-2 text-xs font-black text-[#17211f] transition hover:bg-black/[0.04] disabled:opacity-50 dark:border-white/[0.08] dark:text-white dark:hover:bg-white/[0.05]"
              >
                <FileText size={13} />
                {tr("groupPages.chat.summary")}
              </button>
              <button
                onClick={handleAskLimule}
                disabled={assistantPending || !assistantQuestion.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-800 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-900 disabled:opacity-50"
              >
                <LimuleIcon size={13} />
                {tr("groupPages.chat.ask")}
              </button>
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
              <button onClick={() => { setShowCreateRoom(false); setNewRoomName(""); }} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white">
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
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("groupPages.meetings.form.type")}</label>
                <select
                  value={newRoomType}
                  onChange={e => setNewRoomType(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-blue-700"
                >
                  <option value="general">{tr("groupPages.chat.roomTypes.general")}</option>
                  <option value="bureau">{tr("groupPages.chat.roomTypes.office")}</option>
                  <option value="finance">{tr("groupPages.chat.roomTypes.finance")}</option>
                  <option value="event">{tr("groupPages.chat.roomTypes.event")}</option>
                </select>
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
