import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Bot, Clock3, FileText, ListChecks, Plus, Send, Sparkles, Wand2, X } from "lucide-react";
import { api, type LimuleChatHistoryItem } from "../services/api";

type Message = {
  author: "user" | "ai";
  text: string;
  interactionId?: number;
  sources?: string[];
  signals?: Array<{ label: string; severity: string; module: string }>;
  createdAt?: string | null;
};

const introMessage: Message = {
  author: "ai",
  text: "Je suis Limule. Pose une question, demande un résumé, un risque ou un brouillon: je génère une réponse depuis le backend IA."
};

const suggestions = [
  { label: "Resume cette page", icon: FileText },
  { label: "Quels sont les risques ?", icon: AlertTriangle },
  { label: "Cree une tache depuis ce contenu", icon: ListChecks },
  { label: "Redige un email de relance", icon: Wand2 }
];

function historyToMessages(item: LimuleChatHistoryItem): Message[] {
  return [
    {
      author: "user",
      text: item.prompt,
      createdAt: item.created_at,
    },
    {
      author: "ai",
      text: item.response,
      interactionId: item.id,
      sources: item.sources,
      signals: item.signals,
      createdAt: item.created_at,
    },
  ];
}

function historyDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Copilot() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([introMessage]);
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; key_configured: boolean } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<LimuleChatHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  async function loadHistory() {
    if (historyLoading) {
      return;
    }
    setHistoryLoading(true);
    await api.limuleChatHistory(30)
      .then((history) => {
        setHistoryItems(history);
      })
      .catch(() => undefined)
      .finally(() => {
        setHistoryLoaded(true);
        setHistoryLoading(false);
      });
  }

  useEffect(() => {
    if (open && !historyLoaded) {
      void loadHistory();
    }
  }, [open, historyLoaded]);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, historyLoading, open]);

  async function send(text: string) {
    if (!text.trim() || loading) {
      return;
    }
    const userMessage = text.trim();
    setMessages((current) => [...current, { author: "user", text: userMessage }]);
    setInput("");
    setLoading(true);
    try {
      const generation = await api.limuleChat({
        prompt: userMessage,
        page_path: location.pathname,
      });
      const savedAt = new Date().toISOString();
      setMessages((current) => [
        ...current,
        {
          author: "ai",
          text: generation.answer,
          interactionId: generation.interaction_id,
          sources: generation.sources,
          signals: generation.signals,
          createdAt: savedAt,
        }
      ]);
      setHistoryItems((current) => [
        ...current,
        {
          id: generation.interaction_id,
          prompt: userMessage,
          response: generation.answer,
          module: generation.module,
          intent: generation.intent,
          page_path: location.pathname,
          sources: generation.sources,
          signals: generation.signals,
          rating: null,
          created_at: savedAt,
        },
      ].slice(-30));
    } catch {
      setMessages((current) => [
        ...current,
        {
          author: "ai",
          text: "Je n'arrive pas à joindre Limule pour l'instant. Vérifie que le backend est lancé, puis réessaie depuis cette fenêtre."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function rate(interactionId: number, rating: number) {
    await api.limuleFeedback(interactionId, { rating }).catch(() => undefined);
  }

  function startNewChat() {
    setMessages([introMessage]);
    setInput("");
    setShowHistory(false);
  }

  function openHistoryItem(item: LimuleChatHistoryItem) {
    setMessages([introMessage, ...historyToMessages(item)]);
    setShowHistory(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_18px_50px_rgba(124,58,237,0.35)] transition hover:scale-[1.03]"
        aria-label="Ouvrir Limule"
      >
        <Sparkles size={25} />
      </button>
      {open ? (
        <section className="fixed bottom-24 right-5 z-40 flex h-[36rem] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-white">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
              <Bot size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black">Limule</p>
              <p className="text-sm font-semibold text-white/75">
                {aiStatus
                  ? `Grand Sage 1.0 · ${aiStatus.key_configured ? "Limule actif" : "mode secours"}`
                  : "Grand Sage 1.0"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-black/[0.05] bg-white px-4 py-2 dark:border-white/10 dark:bg-[#1e2229]">
            <button
              type="button"
              onClick={startNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] px-2.5 py-1.5 text-xs font-bold text-[#17211f] transition hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"
            >
              <Plus size={13} /> Nouveau chat
            </button>
            <button
              type="button"
              onClick={() => {
                setShowHistory((value) => !value);
                if (!historyLoaded) void loadHistory();
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                showHistory
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
                  : "border-black/[0.06] text-[#17211f] hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"
              }`}
            >
              <Clock3 size={13} /> Historique{historyItems.length ? ` (${historyItems.length})` : ""}
            </button>
          </div>
          {showHistory ? (
            <div className="max-h-48 overflow-y-auto border-b border-black/[0.05] bg-[#fbfbfd] p-3 dark:border-white/10 dark:bg-[#171a21]">
              {historyLoading ? (
                <p className="text-center text-xs font-semibold text-[#717182]">Chargement de l'historique...</p>
              ) : historyItems.length === 0 ? (
                <p className="text-center text-xs font-semibold text-[#717182]">Aucun échange Limule pour le moment.</p>
              ) : (
                <div className="space-y-2">
                  {[...historyItems].reverse().map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openHistoryItem(item)}
                      className="block w-full rounded-xl border border-black/[0.05] bg-white px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-violet-500/10"
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-violet-500">
                        {historyDate(item.created_at)} · {item.module}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-bold text-[#17211f] dark:text-white">
                        {item.prompt}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#717182]">
                        {item.response}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfbfd] p-5 dark:bg-[#171a21]">
            {messages.map((message, index) => (
              <div key={`${message.author}-${index}`} className={`flex ${message.author === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.author === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    : "bg-white text-ink dark:bg-white/[0.08] dark:text-white"
                }`}>
                  {message.text}
                  {message.author === "ai" && (message.sources?.length || message.signals?.length) ? (
                    <span className="mt-3 block space-y-2 border-t border-black/[0.05] pt-2 text-[11px] leading-5 opacity-80 dark:border-white/10">
                      {message.signals?.length ? (
                        <span className="block">
                          Signaux: {message.signals.slice(0, 2).map((signal) => `${signal.label} · ${signal.module}`).join(" | ")}
                        </span>
                      ) : null}
                      {message.sources?.length ? (
                        <span className="block">
                          Sources: {message.sources.slice(0, 6).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {message.author === "ai" && message.interactionId ? (
                    <span className="mt-2 flex gap-1">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          onClick={() => rate(message.interactionId!, value)}
                          className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-[#717182] hover:bg-violet-100 hover:text-violet-700 dark:bg-white/10 dark:text-white/70 dark:hover:bg-violet-500/20"
                          type="button"
                        >
                          {value}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? <p className="text-xs font-semibold text-[#717182]">Analyse en cours...</p> : null}
            <div ref={endRef} />
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-black/[0.05] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1e2229]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                onClick={() => send(suggestion.label)}
                className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10"
              >
                <suggestion.icon size={13} className="text-violet-600" />
                {suggestion.label}
              </button>
            ))}
          </div>
          <div className="border-t border-black/[0.05] p-3">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <Sparkles size={16} className="text-violet-600" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    send(input);
                  }
                }}
                placeholder="Demande a Limule..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
              />
              <button onClick={() => send(input)} className="grid h-9 w-9 place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-700" aria-label="Envoyer">
                <Send size={15} />
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
