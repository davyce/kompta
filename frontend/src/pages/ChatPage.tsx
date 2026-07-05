import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Hash, Paperclip, Plus, Search,
  Send, Sparkles, X, Info, Lock,
  CheckSquare, Loader2, Zap, Calendar, User, FileText, CreditCard, Bell, Users2,
} from "lucide-react";

import { api } from "../services/api";
import { LimuleIcon } from "../components/LimuleAvatar";
import { useAuth } from "../app/AuthContext";
import i18n from "../i18n";
import type { LimuleAction } from "../types/domain";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
// WS_BASE doit être ABSOLU (ws://|wss://). Si l'API est en chemin relatif (/api),
// on dérive de l'origine courante → fonctionne en local ET derrière un tunnel https (wss).
const WS_BASE = /^https?:/i.test(API_URL)
  ? API_URL.replace(/^http/i, "ws").replace(/\/api\/?$/, "")
  : `${window.location.origin.replace(/^http/i, "ws")}`;

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
  return new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/* ── Limule action type helpers ──────────────────────────────────── */
function actionTypeIcon(type: LimuleAction["type"]) {
  const icons: Record<string, React.ReactElement> = {
    task:     <CheckSquare size={10} />,
    meeting:  <Users2 size={10} />,
    document: <FileText size={10} />,
    approval: <CheckSquare size={10} />,
    payment:  <CreditCard size={10} />,
    reminder: <Bell size={10} />,
  };
  return icons[type] ?? <Zap size={10} />;
}
function actionTypeLabel(type: LimuleAction["type"], tr: TFunction) {
  const map: Record<string, string> = {
    task: "chat.actionTypes.task",
    meeting: "chat.actionTypes.meeting",
    document: "chat.actionTypes.document",
    approval: "chat.actionTypes.approval",
    payment: "chat.actionTypes.payment",
    reminder: "chat.actionTypes.reminder",
  };
  return map[type] ? tr(map[type]) : type;
}
function actionTypeStyle(type: LimuleAction["type"]) {
  const map: Record<string, string> = {
    task:     "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    meeting:  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
    document: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    approval: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    payment:  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    reminder: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  };
  return map[type] ?? "bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300";
}

function taskStatusLabel(status: string, tr: TFunction) {
  const map: Record<string, string> = {
    todo: "chat.taskStatus.todo",
    doing: "chat.taskStatus.doing",
    done: "chat.taskStatus.done",
  };
  return map[status] ? tr(map[status]) : status;
}

/* ── Couleur de mention par personne ──────────────────────────────────
   Chaque @mention garde une couleur stable (dérivée d'un hash de son nom),
   distincte du violet des cartes "Action Limule" et lisible en clair/sombre
   ET sur les bulles colorées (isMe) comme neutres — d'où le pill avec fond
   teinté + texte de la même teinte, saturé assez pour rester visible sur
   fond blanc translucide (bulle "moi") ou fond neutre (bulle "autre"). */
const MENTION_PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200",
  "bg-purple-100 text-purple-700 dark:bg-purple-500/25 dark:text-purple-200",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-200",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/25 dark:text-pink-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/25 dark:text-teal-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/25 dark:text-amber-200",
];

function mentionClasses(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash + ch.charCodeAt(0)) | 0;
  return MENTION_PALETTE[Math.abs(hash) % MENTION_PALETTE.length];
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
          return <span key={i} className={`rounded px-1 font-bold ${mentionClasses(p.value)}`}>{p.value}</span>;
        if (p.kind === "link")
          return <a key={i} href={p.value} target="_blank" rel="noreferrer" className={`underline ${isMe ? "text-white/90" : "text-violet-600"}`}>{p.value}</a>;
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}


/* ── Main ─────────────────────────────────────────────────────────── */
export function ChatPage() {
  const { t: tr } = useTranslation();
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const canManageTasks = Boolean(user && (user.role.startsWith("admin") || ["rh_entreprise", "manager_entreprise", "super_admin"].includes(user.role)));
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showChannelCreate, setShowChannelCreate] = useState(false);
  const [channelForm, setChannelForm] = useState<{ name: string; topic: string; member_user_ids: number[] }>({ name: "", topic: "", member_user_ids: [] });
  const isCompanyAdmin = Boolean(user && ["admin_entreprise", "manager_entreprise", "super_admin"].includes(user.role));
  const [taskComposer, setTaskComposer] = useState({
    open: false,
    title: "",
    description: "",
    assignee_name: "",
    priority: "normal",
    due_date: "",
    due_time: "",
    source: "chat",
  });
  const [quickTaskDone, setQuickTaskDone] = useState<number | null>(null); // messageId après succès
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const typingClearTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const channels = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const companyUsers = useQuery({
    queryKey: ["chatCompanyUsers"],
    queryFn: api.chatCompanyUsers,
    enabled: isCompanyAdmin && showChannelCreate,
  });
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (employees.data ?? [])
      .filter((e) => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, employees.data]);

  const dms = useMemo(() => {
    const list = employees.data ?? [];
    return list.slice(0, 6).map((e) => ({
      id: `dm-${e.id}`,
      name: `${e.first_name} ${e.last_name}`.trim(),
      preview: e.job_title || e.department || tr("chat.directs.colleague"),
      unread: 0,
    }));
  }, [employees.data, tr]);
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
      setChannelForm({ name: "", topic: "", member_user_ids: [] });
      setShowSidebar(false);
    },
  });
  const createTask = useMutation({
    mutationFn: () => api.createTask({
      title: taskComposer.title,
      description: taskComposer.description || undefined,
      assignee_name: taskComposer.assignee_name,
      priority: taskComposer.priority,
      due_date: taskComposer.due_date || null,
      source: taskComposer.source,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["channelDetail", activeChannelId] });
      setTaskComposer({ open: false, title: "", description: "", assignee_name: "", priority: "normal", due_date: "", due_time: "", source: "chat" });
    },
  });

  const quickTask = useMutation({
    mutationFn: (messageId: number) => api.quickTaskFromMessage(messageId),
    onSuccess: (_, messageId) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["channelDetail", activeChannelId] });
      setQuickTaskDone(messageId);
      setTimeout(() => setQuickTaskDone(null), 3000);
    },
  });

  const summarizeChannel = useMutation({
    mutationFn: async () => {
      if (!activeChannelId || !activeChannel) throw new Error(tr("chat.errors.selectChannelForLimule"));
      const recentMessages = (messages.data ?? [])
        .slice(-12)
        .map((m) => `${m.author_name || tr("chat.messages.userFallback", { id: m.author_id })}: ${m.body}`)
        .join("\n");
      const generation = await api.aiGenerate({
        kind: "chat_summary",
        title: tr("chat.limule.summaryTitle", { channel: activeChannel.name }),
        prompt: tr("chat.limule.summaryPrompt", { channel: activeChannel.name }),
        context: recentMessages || tr("chat.limule.emptyContext"),
      });
      await api.sendMessage(
        activeChannelId,
        `${tr("chat.limule.summaryHeading")}\n\n${generation.content}`,
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
    if (activeChannelId === null || !token) return;
    let cancelled = false;
    async function connect() {
      if (cancelled) return;
      try {
        const { ticket } = await api.realtimeTicket();
        if (cancelled) return;
        const ws = new WebSocket(`${WS_BASE}/api/ws/chat/${activeChannelId}?token=${encodeURIComponent(ticket)}`);
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
      } catch {
        if (!cancelled) reconnectTimer.current = setTimeout(connect, 4000);
      }
    }
    connect();
    return () => { cancelled = true; if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [activeChannelId, queryClient, token, user?.full_name]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data, typingUsers.length]);

  const activeChannel = channels.data?.find((c) => c.id === activeChannelId);

  function broadcastTyping() {
    if (wsRef.current?.readyState === WebSocket.OPEN && user?.full_name)
      wsRef.current.send(JSON.stringify({ event: "typing", user: user.full_name }));
  }

  function insertMention(first: string, last: string) {
    const name = `${first} ${last}`.trim();
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const next = `${before}@${name} ${after}`;
    setDraft(next);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = before.length + name.length + 2; // after "@Name "
      draftInputRef.current?.setSelectionRange(pos, pos);
      draftInputRef.current?.focus();
    }, 0);
  }

  function handleDraftChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDraft(val);
    broadcastTyping();
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([\wÀ-ÿ]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function handleDraftKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (mentionSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const emp = mentionSuggestions[mentionIndex];
      if (emp) { e.preventDefault(); insertMention(emp.first_name, emp.last_name); }
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  }

  function submitMessage(e: FormEvent) {
    e.preventDefault();
    if (mentionSuggestions.length > 0) return; // let Enter close the mention dropdown first
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
      topic: tr("chat.directs.topic", { name }),
    });
  }

  function suggestAssignee(text: string) {
    const mention = text.match(/@([\wÀ-ÿ]+)/)?.[1]?.toLowerCase();
    const list = employees.data ?? [];
    const match = list.find((employee) => {
      const full = `${employee.first_name} ${employee.last_name}`.toLowerCase();
      return mention ? full.includes(mention) : text.toLowerCase().includes(employee.first_name.toLowerCase());
    });
    return match ? `${match.first_name} ${match.last_name}`.trim() : "";
  }

  function openTaskComposer(title: string, source: string, action?: LimuleAction | null) {
    const truncated = title.length > 140 ? `${title.slice(0, 137)}...` : title;
    setTaskComposer({
      open: true,
      title: action?.title || truncated,
      description: action?.description || "",
      assignee_name: action?.assignee || suggestAssignee(title),
      priority: action?.priority || (/urgent|priorit|bloqu|avant vendredi|critique/i.test(title) ? "high" : "normal"),
      due_date: action?.due_date || "",
      due_time: action?.due_time || "",
      source,
    });
  }

  const displayMessages = (() => {
    const msgs = messages.data ?? [];
    if (!msgs.length) return [];
    return msgs;
  })();

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem-2.5rem-env(safe-area-inset-bottom))] min-h-[30rem] overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1e2229] lg:h-[calc(100vh-3.5rem-2rem)]" role="main" aria-label={tr("chat.pageTitle", { defaultValue: "Messagerie interne" })}>
    {/* Titre sémantique pour les lecteurs d'écran */}
    <h1 className="sr-only">{tr("chat.pageTitle", { defaultValue: "Messagerie interne" })}</h1>

      {/* ── LEFT: Channels sidebar ── */}
      <aside className={`${showSidebar ? "flex" : "hidden"} md:flex w-72 shrink-0 flex-col border-r border-black/[0.05] bg-[#f6f7fb] dark:border-white/[0.05] dark:bg-[#161920]`}>
        {/* Search */}
        <div className="border-b border-black/[0.05] dark:border-white/[0.05] p-3">
          <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white dark:bg-[#252931] dark:border-white/[0.06] px-3 py-2">
            <Search size={14} className="text-[#717182]" />
            <input placeholder={tr("chat.search.placeholder")} className="w-full bg-transparent text-sm text-[#17211f] dark:text-white outline-none placeholder:text-[#717182]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Channels section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("chat.channels.title")}</span>
              {isCompanyAdmin && (
                <button
                  onClick={() => setShowChannelCreate(true)}
                  className="grid h-5 w-5 place-items-center rounded text-[#717182] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                  aria-label={tr("chat.channels.create")}
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
            {channels.data?.map((c) => {
              const unread = 0; // badges calculés côté backend (pas encore exposés)
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
                  {c.is_restricted && <Lock size={11} className="text-[#717182]" />}
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
            {!channels.data?.length && (
              <p className="px-2 py-4 text-xs text-[#717182]">{tr("chat.channels.empty")}</p>
            )}
          </div>

          {/* DMs section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("chat.directs.title")}</span>
            </div>
            {dms.length === 0 && (
              <p className="px-2 py-3 text-xs text-[#717182]">{tr("chat.directs.empty")}</p>
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
            <button onClick={() => setShowSidebar(true)} className="md:hidden grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label={tr("common.back")}>
              <ArrowLeft size={16} />
            </button>
            <Hash size={17} className="text-[#717182]" />
            <div className="min-w-0">
              <p className="truncate font-bold text-[#17211f] dark:text-white">
                {activeChannel?.name ?? tr("chat.channels.select")}
              </p>
              {activeChannel && (
                <p className="text-xs text-[#717182]">
                  {tr("chat.channels.memberStats", { members: channelDetail.data?.member_count ?? 0, online: channelDetail.data?.online_count ?? 0 })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => summarizeChannel.mutate()}
              disabled={!activeChannelId || summarizeChannel.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              title={tr("chat.limule.generateSummary")}
            >
              {summarizeChannel.isPending ? <Loader2 size={12} className="animate-spin" /> : <LimuleIcon size={12} />} Limule
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
                  {tr("chat.emptyThread.title")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#717182]">
                  {tr("chat.emptyThread.subtitle")}
                </p>
              </div>
            </div>
          )}

          {/* Real messages */}
          {displayMessages.map((m) => {
            const isMe = m.author_id === user?.id;
            const name = m.author_name || tr("chat.messages.userFallback", { id: m.author_id });
            // Only show Limule suggestion when it contains a real action (not "no action" noise)
            const hasRealSuggestion = m.ai_suggestion &&
              !/aucune action|no action|message archive|message archivé/i.test(m.ai_suggestion);
            return (
              <div key={m.id} className={`group flex gap-3 py-1 ${isMe ? "flex-row-reverse" : ""}`}>
                <Avatar name={name} size={36} />
                <div className={`max-w-[75%] ${isMe ? "items-end text-right" : ""}`}>
                  <div className={`mb-1 flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                    <span className="text-sm font-semibold text-[#17211f] dark:text-white">{name}</span>
                    <span className="text-xs text-[#717182]">{shortTime(m.created_at)}</span>
                  </div>
                  <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isMe ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white" : "bg-[#ececf2] dark:bg-white/[0.06] text-[#17211f] dark:text-white"}`}>
                    <MessageBody text={m.body} isMe={isMe} />
                  </div>
                  {/* "Créer tâche" — visible only on hover */}
                  <div className={`mt-1 flex opacity-0 transition-opacity group-hover:opacity-100 ${isMe ? "justify-end" : "justify-start"}`}>
                    <button
                      onClick={() => openTaskComposer(m.body, `chat:${activeChannelId}:message:${m.id}`)}
                      className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-[11px] font-bold text-[#717182] transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-violet-500/10"
                    >
                      <CheckSquare size={11} />
                      {tr("chat.actions.toTask")}
                    </button>
                  </div>
                  {/* Limule action card — rich if structured ai_action, fallback to plain suggestion */}
                  {(m.ai_action?.detected || hasRealSuggestion) && (
                    <div className="mt-2 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50/60 px-3 py-2.5 text-left dark:border-violet-500/30 dark:from-violet-500/10 dark:to-indigo-500/5">
                      {/* Header */}
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                        <LimuleIcon size={13} />
                        {tr("chat.limule.actionDetected")}
                        {m.ai_action?.detected && (
                          <span className="ml-auto rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                            {Math.round(m.ai_action.confidence * 100)}%
                          </span>
                        )}
                      </div>

                      {m.ai_action?.detected ? (
                        <>
                          {/* Type badge + title */}
                          <div className="mb-1.5 flex items-start gap-2">
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${actionTypeStyle(m.ai_action.type)}`}>
                              {actionTypeIcon(m.ai_action.type)}
                              {actionTypeLabel(m.ai_action.type, tr)}
                            </span>
                          </div>
                          <p className="text-sm font-semibold leading-5 text-[#17211f] dark:text-white">
                            {m.ai_action.title}
                          </p>

                          {/* Info chips */}
                          {(m.ai_action.due_date || m.ai_action.assignee || m.ai_action.priority === "high") && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.ai_action.due_date && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-white px-2 py-0.5 text-[11px] text-[#717182] dark:border-white/[0.08] dark:bg-white/[0.06]">
                                  <Calendar size={10} />
                                  {m.ai_action.due_date}{m.ai_action.due_time ? tr("chat.actions.atTime", { time: m.ai_action.due_time }) : ""}
                                </span>
                              )}
                              {m.ai_action.assignee && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-white px-2 py-0.5 text-[11px] text-[#717182] dark:border-white/[0.08] dark:bg-white/[0.06]">
                                  <User size={10} />
                                  {m.ai_action.assignee}
                                </span>
                              )}
                              {m.ai_action.priority === "high" && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10">
                                  {tr("chat.actions.urgent")}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Confidence bar */}
                          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                            <div
                              className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
                              style={{ width: `${Math.round(m.ai_action.confidence * 100)}%` }}
                            />
                          </div>

                          {/* Action buttons */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              disabled={quickTask.isPending || quickTaskDone === m.id}
                              onClick={() => quickTask.mutate(m.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
                                quickTaskDone === m.id
                                  ? "bg-emerald-500"
                                  : "bg-violet-600 hover:bg-violet-700 active:scale-95"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {quickTask.isPending && quickTask.variables === m.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : quickTaskDone === m.id ? (
                                <CheckSquare size={11} />
                              ) : (
                                <Zap size={11} />
                              )}
                              {quickTaskDone === m.id ? tr("chat.actions.taskCreated") : tr("chat.actions.createDirectly")}
                            </button>
                            <button
                              onClick={() => openTaskComposer(
                                m.ai_action!.title,
                                `chat:${activeChannelId}:action:${m.id}`,
                                m.ai_action,
                              )}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-50 active:scale-95 dark:border-violet-500/30 dark:bg-transparent dark:text-violet-300 dark:hover:bg-violet-500/10"
                            >
                              {tr("chat.actions.customize")}
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Fallback: plain suggestion for old messages without structured ai_action */
                        <>
                          <p className="text-sm leading-5 text-[#17211f] dark:text-white">{m.ai_suggestion}</p>
                          <button
                            onClick={() => openTaskComposer(m.ai_suggestion || m.body, `chat:${activeChannelId}:suggestion:${m.id}`)}
                            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-700"
                          >
                            <CheckSquare size={12} />
                            {tr("chat.actions.createThisTask")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <p className="text-xs italic text-[#717182] px-2">
              {tr(typingUsers.length === 1 ? "chat.typing.one" : "chat.typing.other", { users: typingUsers.join(", ") })}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Upload status */}
        {upload.isPending && (
          <div className="flex items-center gap-2 border-t border-black/[0.05] dark:border-white/[0.05] bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Paperclip size={12} /> {tr("chat.upload.pending")}
          </div>
        )}
        {upload.error && (
          <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] dark:border-white/[0.05] bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <span>{tr("chat.upload.failed", { message: upload.error.message })}</span>
            <button onClick={() => upload.reset()} className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-500/20"><X size={12} /></button>
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={submitMessage} className="border-t border-black/[0.05] dark:border-white/[0.05] p-4">
          <div className="relative">
            {/* @mention autocomplete dropdown */}
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 z-40 w-72 rounded-xl border border-black/[0.08] bg-white shadow-xl dark:border-white/[0.1] dark:bg-[#252931] overflow-hidden">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b border-black/[0.05] dark:border-white/[0.05]">
                  {tr("chat.mentions.title")}
                </p>
                {mentionSuggestions.map((emp, idx) => {
                  const name = `${emp.first_name} ${emp.last_name}`.trim();
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(emp.first_name, emp.last_name); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                        idx === mentionIndex
                          ? "bg-violet-50 dark:bg-violet-500/15"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${GRADS[hashName(name) % GRADS.length]} text-[11px] font-bold text-white`}>
                        {name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-[#17211f] dark:text-white">{name}</p>
                        <p className="text-xs text-[#717182]">{emp.job_title || emp.department || tr("chat.mentions.employee")}</p>
                      </div>
                      {idx === mentionIndex && (
                        <span className="ml-auto text-[10px] text-[#717182]">↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2.5">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending || activeChannelId === null}
                className="text-[#717182] transition hover:text-violet-600 disabled:opacity-40"
                title={tr("chat.input.attachFile")}
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={draftInputRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleDraftKeyDown}
                placeholder={activeChannel ? tr("chat.input.placeholder", { channel: activeChannel.name }) : tr("chat.channels.select")}
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
          </div>
          {send.error && <p className="mt-1 text-xs text-rose-600">{send.error.message}</p>}
          {summarizeChannel.error && <p className="mt-1 text-xs text-rose-600">{summarizeChannel.error.message}</p>}
        </form>
      </div>

      {/* ── RIGHT: Channel details panel ── */}
      {showDetails && (
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-black/[0.05] dark:border-white/[0.05] bg-[#f5f6f8] dark:bg-[#161920]">
          <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("chat.details.title")}</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Description */}
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("chat.details.description")}</p>
              <p className="text-sm text-[#17211f] dark:text-white">
                {activeChannel?.topic || tr("chat.details.noDescription")}
              </p>
            </div>

            {/* Members */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#717182]">
                {tr("chat.details.members", { count: channelDetail.data?.member_count ?? 0 })}
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
                  <span className="text-sm text-[#717182]">{tr("chat.details.noActiveMember")}</span>
                )}
              </div>
            </div>

            {/* Linked tasks */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("chat.details.linkedTasks")}</p>
                <button
                  onClick={() => openTaskComposer(`Action #${activeChannel?.name ?? "chat"}`, `chat:${activeChannelId}:channel`)}
                  className="rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-bold text-white"
                >
                  {tr("chat.details.addTask")}
                </button>
              </div>
              <div className="space-y-2">
                {(channelDetail.data?.tasks ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#252931] px-3 py-2 text-sm">
                    <CheckSquare size={15} className="text-violet-500" />
                    <div>
                      <p className="font-medium text-[#17211f] dark:text-white">{t.title}</p>
                      <p className="text-xs text-[#717182]">{taskStatusLabel(t.status, tr)}</p>
                    </div>
                  </div>
                ))}
                {!channelDetail.isLoading && (channelDetail.data?.tasks.length ?? 0) === 0 && (
                  <p className="rounded-lg border border-dashed border-black/[0.08] px-3 py-3 text-sm text-[#717182] dark:border-white/[0.08]">
                    {tr("chat.details.noOpenTask")}
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
                <h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("chat.createChannel.title")}</h3>
                <p className="text-sm text-[#717182]">{tr("chat.createChannel.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChannelCreate(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                aria-label={tr("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#717182]">
              {tr("chat.createChannel.name")}
              <input
                value={channelForm.name}
                onChange={(e) => setChannelForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="operations"
                className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none transition focus:border-violet-500 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
              />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[#717182]">
              {tr("chat.createChannel.description")}
              <input
                value={channelForm.topic}
                onChange={(e) => setChannelForm((current) => ({ ...current, topic: e.target.value }))}
                placeholder="Coordination quotidienne, paie, terrain..."
                className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none transition focus:border-violet-500 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
              />
            </label>
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[#717182]">
                {tr("chat.createChannel.members", { defaultValue: "Membres (laisser vide = canal ouvert à tous)" })}
              </p>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08] p-2 space-y-1">
                {(companyUsers.data ?? []).map((u) => {
                  const checked = channelForm.member_user_ids.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setChannelForm((current) => ({
                          ...current,
                          member_user_ids: checked
                            ? current.member_user_ids.filter((id) => id !== u.id)
                            : [...current.member_user_ids, u.id],
                        }))}
                      />
                      <span className="truncate">{u.full_name}</span>
                      <span className="ml-auto text-xs text-[#717182]">{u.role}</span>
                    </label>
                  );
                })}
                {!companyUsers.data?.length && (
                  <p className="px-2 py-2 text-xs text-[#717182]">{tr("chat.createChannel.noUsers", { defaultValue: "Aucun utilisateur trouvé" })}</p>
                )}
              </div>
            </div>
            {createChannel.error && <p className="mt-3 text-sm font-semibold text-rose-600">{createChannel.error.message}</p>}
            <button
              type="submit"
              disabled={!channelForm.name.trim() || createChannel.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:bg-stone-300"
            >
              {createChannel.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              {tr("chat.createChannel.submit")}
            </button>
          </form>
        </div>
      )}
      {taskComposer.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (taskComposer.title.trim()) createTask.mutate();
            }}
            className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl dark:border-white/[0.08] dark:bg-[#1e2229]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("chat.taskComposer.title")}</h3>
                <p className="text-sm text-[#717182]">{tr("chat.taskComposer.subtitle")}</p>
              </div>
              <button type="button" onClick={() => setTaskComposer((current) => ({ ...current, open: false }))} className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05]">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("chat.taskComposer.taskTitle")}
                <textarea
                  required
                  rows={2}
                  value={taskComposer.title}
                  onChange={(event) => setTaskComposer({ ...taskComposer, title: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                />
              </label>
              {taskComposer.description && (
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  {tr("chat.createChannel.description")}
                  <textarea
                    rows={2}
                    value={taskComposer.description}
                    onChange={(event) => setTaskComposer({ ...taskComposer, description: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                  />
                </label>
              )}
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("chat.taskComposer.assignee")}
                <select
                  value={taskComposer.assignee_name}
                  onChange={(event) => setTaskComposer({ ...taskComposer, assignee_name: event.target.value })}
                  disabled={!canManageTasks}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                >
                  <option value="">{canManageTasks ? tr("chat.taskComposer.unassigned") : tr("chat.taskComposer.assignedToMeAuto")}</option>
                  {(employees.data ?? []).map((employee) => {
                    const name = `${employee.first_name} ${employee.last_name}`.trim();
                    return <option key={employee.id} value={name}>{name}</option>;
                  })}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  {tr("chat.taskComposer.priority")}
                  <select value={taskComposer.priority} onChange={(event) => setTaskComposer({ ...taskComposer, priority: event.target.value })} className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                    <option value="low">{tr("chat.priorities.low")}</option>
                    <option value="normal">{tr("chat.priorities.normal")}</option>
                    <option value="high">{tr("chat.priorities.high")}</option>
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  {tr("chat.taskComposer.dueDate")}
                  <input type="date" value={taskComposer.due_date} onChange={(event) => setTaskComposer({ ...taskComposer, due_date: event.target.value })} className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                </label>
              </div>
              {taskComposer.due_date && (
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  {tr("chat.taskComposer.timeOptional")}
                  <input
                    type="time"
                    value={taskComposer.due_time}
                    onChange={(event) => setTaskComposer({ ...taskComposer, due_time: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                  />
                </label>
              )}
              {createTask.error && <p className="text-sm font-semibold text-rose-600">{createTask.error.message}</p>}
              <button disabled={!taskComposer.title.trim() || createTask.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:bg-stone-300">
                {createTask.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckSquare size={16} />}
                {tr("chat.taskComposer.submit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
