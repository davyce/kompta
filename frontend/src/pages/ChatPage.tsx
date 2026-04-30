import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Hash, Paperclip, Plus, Search,
  Send, Sparkles, X, Info,
  CheckSquare, Loader2,
} from "lucide-react";

import { api } from "../services/api";
import { useAuth } from "../app/AuthContext";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
const WS_BASE = API_URL.replace(/^http/, "ws").replace(/\/api$/, "");

/* ── Avatar ───────────────────────────────────────────────────────── */
const GRADS = [
  "from-sky-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-indigo-500",
];
function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return h;
}
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const grad = GRADS[hashName(name || "?") % GRADS.length];
  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {ini}
    </div>
  );
}

function shortTime(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/* ── Inline message renderer (mentions + links) ───────────────────── */
function MessageBody({ text, isMe }: { text: string; isMe: boolean }) {
  const parts = useMemo(() => {
    const out: Array<{ kind: "text" | "mention" | "link"; value: string }> = [];
    const re = /(@[\wÀ-ÿ]+|https?:\/\/\S+)/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) out.push({ kind: "text", value: text.slice(lastIndex, m.index) });
      const v = m[0];
      out.push({ kind: v.startsWith("@") ? "mention" : "link", value: v });
      lastIndex = m.index + v.length;
    }
    if (lastIndex < text.length) out.push({ kind: "text", value: text.slice(lastIndex) });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "mention")
          return <span key={i} className={`rounded px-1 font-bold ${isMe ? "bg-white/20" : "bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"}`}>{p.value}</span>;
        if (p.kind === "link")
          return <a key={i} href={p.value} target="_blank" rel="noreferrer" className={`underline ${isMe ? "text-white/90" : "text-violet-600"}`}>{p.value}</a>;
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}


/* ── Main ─────────────────────────────────────────────────────────── */
export function ChatPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showChannelCreate, setShowChannelCreate] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", topic: "" });
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingClearTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const channels = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const dms = useMemo(() => {
    const list = employees.data ?? [];
    return list.slice(0, 6).map((e) => ({
      id: `dm-${e.id}`,
      name: `${e.first_name} ${e.last_name}`.trim(),
      preview: e.job_title || e.department || "Collègue",
      unread: 0,
    }));
  }, [employees.data]);
  const messages = useQuery({
    queryKey: ["messages", activeChannelId],
    queryFn: () => api.messages(activeChannelId!),
    enabled: activeChannelId !== null,
  });
  const channelDetail = useQuery({
    queryKey: ["channelDetail", activeChannelId],
    queryFn: () => api.channelDetail(activeChannelId!),
    enabled: activeChannelId !== null,
  });

  const send = useMutation({
    mutationFn: ({ channelId, body }: { channelId: number; body: string }) =>
      api.sendMessage(channelId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadDocument({ title: file.name, file }),
    onSuccess: (doc) => {
      if (activeChannelId !== null) send.mutate({ channelId: activeChannelId, body: `📎 ${doc.title}` });
    },
  });

  const createChannel = useMutation({
    mutationFn: api.createChannel,
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      setActiveChannelId(channel.id);
      setShowChannelCreate(false);
      setChannelForm({ name: "", topic: "" });
      setShowSidebar(false);
    },
  });

  const summarizeChannel = useMutation({
    mutationFn: async () => {
      if (!activeChannelId || !activeChannel) throw new Error("Selectionne un canal avant de lancer Limule.");
      const recentMessages = (messages.data ?? [])
        .slice(-12)
        .map((m) => `${m.author_name || `Utilisateur ${m.author_id}`}: ${m.body}`)
        .join("\n");
      const generation = await api.aiGenerate({
        kind: "chat_summary",
        title: `Resume #${activeChannel.name}`,
        prompt: `Resume le canal #${activeChannel.name}, liste les decisions, risques et prochaines actions.`,
        context: recentMessages || "Le canal ne contient pas encore de messages. Propose un message d'accueil operationnel.",
      });
      await api.sendMessage(
        activeChannelId,
        `Resume Limule\n\n${generation.content}`,
      );
      return generation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
      queryClient.invalidateQueries({ queryKey: ["aiHistory"] });
    },
  });

  useEffect(() => {
    if (channels.data?.length && activeChannelId === null) setActiveChannelId(channels.data[0].id);
  }, [channels.data, activeChannelId]);

  useEffect(() => {
    if (activeChannelId === null) return;
    let cancelled = false;
    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(`${WS_BASE}/api/ws/chat/${activeChannelId}`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "message") {
            queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
          } else if (data.type === "ephemeral" && data.event === "typing" && data.user && data.user !== user?.full_name) {
            setTypingUsers((p) => p.includes(data.user) ? p : [...p, data.user]);
            if (typingClearTimer.current[data.user]) clearTimeout(typingClearTimer.current[data.user]);
            typingClearTimer.current[data.user] = setTimeout(() =>
              setTypingUsers((p) => p.filter((u) => u !== data.user)), 3000);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!cancelled) reconnectTimer.current = setTimeout(connect, 4000); };
    }
    connect();
    return () => { cancelled = true; if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [activeChannelId, queryClient, user?.full_name]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data, typingUsers.length]);

  const activeChannel = channels.data?.find((c) => c.id === activeChannelId);

  function broadcastTyping() {
    if (wsRef.current?.readyState === WebSocket.OPEN && user?.full_name)
      wsRef.current.send(JSON.stringify({ event: "typing", user: user.full_name }));
  }

  function submitMessage(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeChannelId === null) return;
    send.mutate({ channelId: activeChannelId, body: draft.trim() });
    setDraft("");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submitChannel(e: FormEvent) {
    e.preventDefault();
    if (!channelForm.name.trim()) return;
    createChannel.mutate(channelForm);
  }

  function openDirectConversation(name: string) {
    createChannel.mutate({
      name: `direct-${name}`,
      topic: `Conversation directe avec ${name}`,
    });
  }

  const displayMessages = (() => {
    const msgs = messages.data ?? [];
    if (!msgs.length) return [];
    return msgs;
  })();

  return (
    <div className="flex h-[calc(100vh-3.5rem-2rem)] overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1e2229]">

      {/* ── LEFT: Channels sidebar ── */}
      <aside className={`${showSidebar ? "flex" : "hidden"} md:flex w-72 shrink-0 flex-col border-r border-black/[0.05] bg-[#f6f7fb] dark:border-white/[0.05] dark:bg-[#161920]`}>
        {/* Search */}
        <div className="border-b border-black/[0.05] dark:border-white/[0.05] p-3">
          <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white dark:bg-[#252931] dark:border-white/[0.06] px-3 py-2">
            <Search size={14} className="text-[#717182]" />
            <input placeholder="Rechercher…" className="w-full bg-transparent text-sm text-[#17211f] dark:text-white outline-none placeholder:text-[#717182]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Channels section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#717182]">Canaux</span>
              <button
                onClick={() => setShowChannelCreate(true)}
                className="grid h-5 w-5 place-items-center rounded text-[#717182] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                aria-label="Créer un canal"
              >
                <Plus size={12} />
              </button>
            </div>
            {channels.data?.map((c) => {
              const unread = c.id === activeChannelId ? 0 : c.id % 4;
              return (
                <button
                  key={c.id}
                  onClick={() => { setActiveChannelId(c.id); setShowSidebar(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                    c.id === activeChannelId
                      ? "bg-violet-100 font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
                      : "text-[#17211f] hover:bg-black/[0.04] dark:text-white/80 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Hash size={14} className={c.id === activeChannelId ? "text-violet-500" : "text-[#717182]"} />
                  <span className="flex-1 truncate">{c.name}</span>
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
            {!channels.data?.length && (
              <p className="px-2 py-4 text-xs text-[#717182]">Aucun canal.</p>
            )}
          </div>

          {/* DMs section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#717182]">Messages directs</span>
            </div>
            {dms.length === 0 && (
              <p className="px-2 py-3 text-xs text-[#717182]">Aucun collègue à contacter pour l'instant.</p>
            )}
            {dms.map((dm) => (
              <button
                key={dm.id}
                onClick={() => openDirectConversation(dm.name)}
                disabled={createChannel.isPending}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                <div className="relative">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${GRADS[hashName(dm.name) % GRADS.length]} text-[11px] font-bold text-white`}>
                    {dm.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#111318] bg-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{dm.name}</p>
                  <p className="truncate text-xs text-[#717182]">{dm.preview}</p>
                </div>
                {dm.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white px-1">{dm.unread}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── CENTER: Messages ── */}
      <div className={`${showSidebar ? "hidden" : "flex"} md:flex flex-1 flex-col min-w-0`}>
        {/* Channel header */}
        <div className="flex items-center justify-between border-b border-black/[0.05] bg-white px-5 py-3 dark:border-white/[0.05] dark:bg-[#1e2229]">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setShowSidebar(true)} className="md:hidden grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Retour">
              <ArrowLeft size={16} />
            </button>
            <Hash size={17} className="text-[#717182]" />
            <div className="min-w-0">
              <p className="truncate font-bold text-[#17211f] dark:text-white">
                {activeChannel?.name ?? "Sélectionner un canal"}
              </p>
              {activeChannel && (
                <p className="text-xs text-[#717182]">
                  {channelDetail.data?.member_count ?? 0} membres · {channelDetail.data?.online_count ?? 0} actifs
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => summarizeChannel.mutate()}
              disabled={!activeChannelId || summarizeChannel.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              title="Generer un resume IA du canal"
            >
              {summarizeChannel.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Limule
            </button>
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="hidden lg:grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition"
            >
              <Info size={16} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 space-y-1 overflow-y-auto bg-[#fbfbfd] p-5 dark:bg-[#171a21]">
          {messages.isLoading && (
            <div className="flex flex-col gap-3 pt-4">
              {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />)}
            </div>
          )}

          {/* No messages yet */}
          {!messages.isLoading && displayMessages.length === 0 && (
            <div className="grid h-full min-h-[360px] place-items-center">
              <div className="max-w-md rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-sm dark:border-violet-500/20 dark:bg-white/[0.03]">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  <Sparkles size={20} />
                </div>
                <h3 className="mt-4 text-lg font-black text-[#17211f] dark:text-white">
                  Nouveau fil connecté au backend
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#717182]">
                  Aucun message enregistré pour ce canal. Écrivez le premier message, mentionnez un collègue ou joignez un document.
                </p>
              </div>
            </div>
          )}

          {/* Real messages */}
          {displayMessages.map((m) => {
            const isMe = m.author_id === user?.id;
            const name = m.author_name || `Utilisateur ${m.author_id}`;
            return (
              <div key={m.id} className={`flex gap-3 py-1 ${isMe ? "flex-row-reverse" : ""}`}>
                <Avatar name={name} size={36} />
                <div className={`max-w-[75%] ${isMe ? "items-end text-right" : ""}`}>
                  <div className={`mb-1 flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                    <span className="text-sm font-semibold text-[#17211f] dark:text-white">{name}</span>
                    <span className="text-xs text-[#717182]">{shortTime(m.created_at)}</span>
                  </div>
                  <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isMe ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white" : "bg-[#ececf2] dark:bg-white/[0.06] text-[#17211f] dark:text-white"}`}>
                    <MessageBody text={m.body} isMe={isMe} />
                  </div>
                  {m.ai_suggestion && (
                    <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left text-sm dark:border-violet-500/30 dark:bg-violet-500/10">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-violet-600 dark:text-violet-300">
                        <Sparkles size={10}/> Suggestion Limule
                      </div>
                      <p className="text-[#17211f] dark:text-white">{m.ai_suggestion}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <p className="text-xs italic text-[#717182] px-2">
              {typingUsers.join(", ")} {typingUsers.length === 1 ? "est en train d'écrire" : "sont en train d'écrire"}…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Upload status */}
        {upload.isPending && (
          <div className="flex items-center gap-2 border-t border-black/[0.05] dark:border-white/[0.05] bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Paperclip size={12} /> Téléversement en cours…
          </div>
        )}
        {upload.error && (
          <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] dark:border-white/[0.05] bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <span>Échec : {upload.error.message}</span>
            <button onClick={() => upload.reset()} className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-500/20"><X size={12} /></button>
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={submitMessage} className="border-t border-black/[0.05] dark:border-white/[0.05] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2.5">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending || activeChannelId === null}
              className="text-[#717182] transition hover:text-violet-600 disabled:opacity-40"
              title="Joindre un fichier"
            >
              <Paperclip size={16} />
            </button>
            <input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); broadcastTyping(); }}
              placeholder={activeChannel ? `Écrire à #${activeChannel.name}…` : "Sélectionner un canal…"}
              disabled={activeChannelId === null}
              className="flex-1 bg-transparent text-sm text-[#17211f] dark:text-white outline-none disabled:cursor-not-allowed placeholder:text-[#717182]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || send.isPending || activeChannelId === null}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700 disabled:bg-black/10 dark:disabled:bg-white/10"
            >
              <Send size={14} />
            </button>
          </div>
        {send.error && <p className="mt-1 text-xs text-rose-600">{send.error.message}</p>}
          {summarizeChannel.error && <p className="mt-1 text-xs text-rose-600">{summarizeChannel.error.message}</p>}
        </form>
      </div>

      {/* ── RIGHT: Channel details panel ── */}
      {showDetails && (
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-black/[0.05] dark:border-white/[0.05] bg-[#f5f6f8] dark:bg-[#161920]">
          <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">Détails</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Description */}
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#717182]">Description</p>
              <p className="text-sm text-[#17211f] dark:text-white">
                {activeChannel?.topic || "Aucune description pour ce canal."}
              </p>
            </div>

            {/* Members */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#717182]">
                Membres ({channelDetail.data?.member_count ?? 0})
              </p>
              <div className="flex flex-wrap gap-1">
                {(channelDetail.data?.members ?? []).slice(0, 8).map((member) => (
                  <div key={member.id} title={`${member.name} · ${member.role || member.department}`}>
                    <Avatar name={member.name} size={32} />
                  </div>
                ))}
                {(channelDetail.data?.member_count ?? 0) > 8 && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-xs font-bold text-[#717182]">
                    +{(channelDetail.data?.member_count ?? 0) - 8}
                  </span>
                )}
                {!channelDetail.isLoading && (channelDetail.data?.members.length ?? 0) === 0 && (
                  <span className="text-sm text-[#717182]">Aucun membre actif.</span>
                )}
              </div>
            </div>

            {/* Linked tasks */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#717182]">Tâches liées</p>
              <div className="space-y-2">
                {(channelDetail.data?.tasks ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#252931] px-3 py-2 text-sm">
                    <CheckSquare size={15} className="text-violet-500" />
                    <div>
                      <p className="font-medium text-[#17211f] dark:text-white">{t.title}</p>
                      <p className="text-xs text-[#717182]">{t.status}</p>
                    </div>
                  </div>
                ))}
                {!channelDetail.isLoading && (channelDetail.data?.tasks.length ?? 0) === 0 && (
                  <p className="rounded-lg border border-dashed border-black/[0.08] px-3 py-3 text-sm text-[#717182] dark:border-white/[0.08]">
                    Aucune tâche ouverte.
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}

      {showChannelCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 backdrop-blur-sm">
          <form onSubmit={submitChannel} className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl dark:border-white/[0.08] dark:bg-[#1e2229]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-[#17211f] dark:text-white">Créer un canal</h3>
                <p className="text-sm text-[#717182]">Le canal sera enregistré dans le backend KOMPTA.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChannelCreate(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#717182]">
              Nom du canal
              <input
                value={channelForm.name}
                onChange={(e) => setChannelForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="operations"
                className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none transition focus:border-violet-500 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
              />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[#717182]">
              Description
              <input
                value={channelForm.topic}
                onChange={(e) => setChannelForm((current) => ({ ...current, topic: e.target.value }))}
                placeholder="Coordination quotidienne, paie, terrain..."
                className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none transition focus:border-violet-500 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
              />
            </label>
            {createChannel.error && <p className="mt-3 text-sm font-semibold text-rose-600">{createChannel.error.message}</p>}
            <button
              type="submit"
              disabled={!channelForm.name.trim() || createChannel.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:bg-stone-300"
            >
              {createChannel.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Créer et ouvrir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
