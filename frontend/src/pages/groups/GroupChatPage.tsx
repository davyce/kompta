import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Hash, Loader2, Smile, Trash2, Reply } from "lucide-react";
import { useAuth } from "../../app/AuthContext";
import { api } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
// WS absolu (ws://|wss://). API relative (/api) → dérive de l'origine (tunnel https → wss).
const WS_BASE = /^https?:/i.test(API_URL)
  ? API_URL.replace(/^http/i, "ws").replace(/\/api\/?$/, "")
  : `${window.location.origin.replace(/^http/i, "ws")}`;
const EMOJI_QUICK = ["👍","❤️","😂","🎉","👏","🙏"];

export function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: rooms = [] } = useQuery({ queryKey: ["group-chat-rooms", id], queryFn: () => api.groupChatRooms(id) });
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["group-chat-messages", id, activeRoomId],
    queryFn: () => api.groupChatMessages(id, activeRoomId!, 60),
    enabled: !!activeRoomId,
  });

  // Sélectionner le premier salon automatiquement
  useEffect(() => { if (rooms.length && !activeRoomId) setActiveRoomId(rooms[0].id); }, [rooms, activeRoomId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // WebSocket pour temps réel
  useEffect(() => {
    if (!activeRoomId || !token) return;
    const ws = new WebSocket(`${WS_BASE}/api/groups/${id}/chat/rooms/${activeRoomId}/ws?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = () => qc.invalidateQueries({ queryKey: ["group-chat-messages", id, activeRoomId] });
    ws.onerror = () => {};
    return () => { ws.close(); };
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

  const TYPE_BADGE: Record<string, string> = { general: "🏠", bureau: "👔", finance: "💰", event: "🎉", private: "🔒" };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Rooms sidebar */}
      <div className="w-44 shrink-0 border-r border-black/[0.05] dark:border-white/[0.05] bg-[#f6f7fb] dark:bg-[#161920] p-2 space-y-0.5 overflow-y-auto">
        <p className="px-2 py-1.5 text-[10px] font-bold uppercase text-[#717182]">Salons</p>
        {rooms.map(r => (
          <button key={r.id} onClick={() => setActiveRoomId(r.id)}
            className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm transition ${activeRoomId === r.id ? "bg-violet-100 dark:bg-violet-500/20 font-semibold text-violet-700 dark:text-violet-300" : "text-[#17211f] dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"}`}>
            <span className="text-[11px]">{TYPE_BADGE[r.type] ?? "#"}</span>
            <span className="truncate text-xs">{r.name}</span>
          </button>
        ))}
        {rooms.length === 0 && <p className="px-2 text-xs text-[#717182]">Aucun salon</p>}
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-4 py-3 bg-white dark:bg-[#1e2229]">
          <p className="font-bold text-[#17211f] dark:text-white text-sm">{rooms.find(r => r.id === activeRoomId)?.name ?? "Salon"}</p>
        </div>
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#fbfbfd] dark:bg-[#171a21]">
          {isLoading && <div className="flex h-32 items-center justify-center"><Loader2 size={20} className="animate-spin text-violet-500" /></div>}
          {messages.map(m => {
            const isMe = m.sender_name === user?.full_name;
            const deleted = !!m.deleted_at;
            return (
              <div key={m.id} className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white text-[10px] font-bold self-end`}>
                  {m.sender_name.split(" ").map((p: string) => p[0]).join("").slice(0, 2)}
                </div>
                <div className={`max-w-[70%] ${isMe ? "items-end" : ""}`}>
                  {!isMe && <p className="text-[10px] font-bold text-[#717182] mb-0.5 px-1">{m.sender_name}</p>}
                  <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white" : "bg-[#ececf2] dark:bg-white/[0.07] text-[#17211f] dark:text-white"} ${deleted ? "opacity-50 italic" : ""}`}>
                    {deleted ? "Message supprimé" : m.content}
                  </div>
                  {/* Reactions */}
                  {!deleted && Object.keys(m.reactions ?? {}).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5 px-1">
                      {Object.entries(m.reactions).map(([e, c]) => (
                        <button key={e} onClick={() => react.mutate({ msgId: m.id, emoji: e })}
                          className="flex items-center gap-0.5 rounded-full border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-1.5 py-0.5 text-[11px] hover:bg-violet-50 dark:hover:bg-violet-500/10">
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
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <div className="border-t border-black/[0.05] dark:border-white/[0.05] p-3 bg-white dark:bg-[#1e2229]">
          {replyTo && <div className="mb-1 flex items-center gap-2 text-xs text-[#717182]"><Reply size={10} />Réponse au message #{replyTo} <button onClick={() => setReplyTo(null)}><span className="text-rose-400 ml-1">✕</span></button></div>}
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2">
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && draft.trim()) { e.preventDefault(); send.mutate(); } }}
              placeholder={activeRoomId ? "Écrire un message…" : "Sélectionnez un salon"}
              disabled={!activeRoomId}
              className="flex-1 bg-transparent text-sm text-[#17211f] dark:text-white outline-none placeholder:text-[#717182] disabled:cursor-not-allowed" />
            <button onClick={() => send.mutate()} disabled={!draft.trim() || send.isPending || !activeRoomId}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white disabled:bg-black/10 dark:disabled:bg-white/10">
              {send.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
