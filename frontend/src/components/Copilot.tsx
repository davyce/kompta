import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Clock3, FileText, Maximize2, Minimize2,
  Plus, Send, ShieldCheck, Sparkles, TrendingUp, Wallet, X,
} from "lucide-react";
import { api, type LimuleChatHistoryItem } from "../services/api";
import { LimuleAvatar, LimuleIcon } from "./LimuleAvatar";

type Message = {
  author: "user" | "ai";
  text: string;
  interactionId?: number;
  sources?: string[];
  signals?: Array<{ label: string; severity: string; module: string }>;
  createdAt?: string | null;
};

/* ─── Message d'intro premium ─────────────────────────────────────────────── */
const INTRO_TEXT = `**Bonjour. Je suis Limule — votre conseiller stratégique IA.**

Connecté en temps réel à toutes les données de votre entreprise, je peux :

**🔮 Prédictions économiques** — prévisions de CA, trésorerie, tendances sur 30/60/90 jours
**💰 Conseils d'investissement** — embauche, stock, expansion : je chiffre l'impact et le retour
**📊 Analyse sectorielle** — benchmarks PME, conjoncture CEMAC, risques de marché
**⚠️ Risques & conformité TERAS** — alertes, score, actions correctives prioritaires
**👥 RH & masse salariale** — coûts, conformité CNPS, prévisions de paie
**📄 Rédaction professionnelle** — emails, notes, clauses, courriers prêts à envoyer

Posez votre question — j'analyse vos données réelles pour vous répondre.`;

const introMessage: Message = {
  author: "ai",
  text: INTRO_TEXT,
};

/* ─── Suggestions enrichies ───────────────────────────────────────────────── */
const suggestions = [
  { label: "Prévisions trésorerie 30 jours", icon: TrendingUp },
  { label: "Devrais-je investir ou embaucher ?", icon: Wallet },
  { label: "Analyse sectorielle et positionnement", icon: BarChart3 },
  { label: "Quels sont les risques prioritaires ?", icon: AlertTriangle },
  { label: "Score TERAS et actions urgentes", icon: ShieldCheck },
  { label: "Résumé direction du jour", icon: FileText },
];

/* ─── Rendu markdown léger ────────────────────────────────────────────────── */
function MarkdownLine({ text }: { text: string }) {
  // Gras **texte**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function MessageContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else if (/^#{1,3}\s/.test(line)) {
      elements.push(
        <p key={i} className="font-black text-sm mt-1">
          <MarkdownLine text={line.replace(/^#{1,3}\s/, "")} />
        </p>
      );
    } else if (/^[-•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 text-sm leading-5">
          <span className="mt-1 text-violet-400 text-xs shrink-0">▸</span>
          <span><MarkdownLine text={line.replace(/^[-•]\s|^\d+\.\s/, "")} /></span>
        </div>
      );
    } else {
      elements.push(
        <p key={i} className="text-sm leading-[1.65]">
          <MarkdownLine text={line} />
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function historyToMessages(item: LimuleChatHistoryItem): Message[] {
  return [
    { author: "user", text: item.prompt, createdAt: item.created_at },
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
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

/* ─── Composant principal ─────────────────────────────────────────────────── */
export function Copilot() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([introMessage]);
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; key_configured: boolean } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<LimuleChatHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    await api.limuleChatHistory(30)
      .then((h) => setHistoryItems(h))
      .catch(() => undefined)
      .finally(() => { setHistoryLoaded(true); setHistoryLoading(false); });
  }

  useEffect(() => {
    if (open && !historyLoaded) void loadHistory();
  }, [open, historyLoaded]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, historyLoading, open]);

  // Focus input quand on ouvre
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Escape pour fermer/quitter fullscreen
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMessage = text.trim();
    setMessages((c) => [...c, { author: "user", text: userMessage }]);
    setInput("");
    setLoading(true);
    try {
      const generation = await api.limuleChat({
        prompt: userMessage,
        page_path: location.pathname,
      });
      const savedAt = new Date().toISOString();
      setMessages((c) => [
        ...c,
        {
          author: "ai",
          text: generation.answer,
          interactionId: generation.interaction_id,
          sources: generation.sources,
          signals: generation.signals,
          createdAt: savedAt,
        },
      ]);
      setHistoryItems((c) => [
        ...c,
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
      setMessages((c) => [
        ...c,
        {
          author: "ai",
          text: "Je n'arrive pas à joindre le serveur IA. Vérifie que le backend est lancé, puis réessaie.",
        },
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

  /* ─── Styles selon mode ──────────────────────────────────────────────────── */
  const panelCls = fullscreen
    ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
    : "fixed bottom-24 right-5 z-40 flex h-[36rem] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]";

  const SEVERITY_COLOR: Record<string, string> = {
    critical: "text-red-500",
    high: "text-orange-500",
    medium: "text-amber-500",
    low: "text-sky-500",
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 rounded-full p-0 transition hover:scale-[1.06] focus:outline-none"
        aria-label="Ouvrir Limule"
        style={{ background: "none", border: "none" }}
      >
        <LimuleAvatar state={loading ? "thinking" : "idle"} size={56} />
      </button>

      {open && (
        <section className={panelCls}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-[#0b1f3a] to-[#1a3a5c] px-5 py-3.5 text-white">
            <LimuleAvatar state={loading ? "thinking" : "speaking"} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-lg font-black tracking-tight">Limule</p>
                {aiStatus?.key_configured && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    IA active
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60">
                Conseiller stratégique · {aiStatus ? aiStatus.provider : "KOMPTA"}
              </p>
            </div>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setFullscreen((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
              aria-label={fullscreen ? "Réduire" : "Plein écran"}
              title={fullscreen ? "Réduire" : "Plein écran"}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={() => { setOpen(false); setFullscreen(false); }}
              className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
              aria-label="Fermer"
            >
              <X size={17} />
            </button>
          </div>

          {/* ── Barre d'outils ──────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.05] bg-white px-4 py-2 dark:border-white/10 dark:bg-[#1e2229]">
            <button
              type="button"
              onClick={startNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] px-2.5 py-1.5 text-xs font-bold text-[#17211f] transition hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"
            >
              <Plus size={13} /> Nouveau
            </button>
            <button
              type="button"
              onClick={() => { setShowHistory((v) => !v); if (!historyLoaded) void loadHistory(); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                showHistory
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
                  : "border-black/[0.06] text-[#17211f] hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"
              }`}
            >
              <Clock3 size={13} /> Historique{historyItems.length ? ` (${historyItems.length})` : ""}
            </button>
            <div className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-stone-400">
              <Sparkles size={11} className="text-violet-400" />
              Données temps réel
            </div>
          </div>

          {/* ── Historique ──────────────────────────────────────────────── */}
          {showHistory && (
            <div className="max-h-52 shrink-0 overflow-y-auto border-b border-black/[0.05] bg-[#fbfbfd] p-3 dark:border-white/10 dark:bg-[#171a21]">
              {historyLoading ? (
                <p className="text-center text-xs font-semibold text-[#717182]">Chargement…</p>
              ) : historyItems.length === 0 ? (
                <p className="text-center text-xs font-semibold text-[#717182]">Aucun échange enregistré.</p>
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
          )}

          {/* ── Messages ────────────────────────────────────────────────── */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfbfd] p-5 dark:bg-[#171a21]">
            {messages.map((msg, idx) => (
              <div key={`${msg.author}-${idx}`} className={`flex ${msg.author === "user" ? "justify-end" : "justify-start"}`}>
                {msg.author === "ai" && (
                  <div className="mr-2.5 mt-1 shrink-0">
                    <LimuleIcon size={22} className="opacity-70" />
                  </div>
                )}
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.author === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm leading-[1.65]"
                    : "bg-white text-[#17211f] dark:bg-white/[0.08] dark:text-white"
                }`}>
                  {msg.author === "user" ? (
                    msg.text
                  ) : (
                    <MessageContent text={msg.text} />
                  )}

                  {/* Sources & signaux */}
                  {msg.author === "ai" && (msg.sources?.length || msg.signals?.length) ? (
                    <div className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-2 dark:border-white/10">
                      {msg.signals?.slice(0, 3).map((s, i) => (
                        <p key={i} className={`text-[10px] font-semibold ${SEVERITY_COLOR[s.severity] ?? "text-stone-400"}`}>
                          ⚡ {s.label} · {s.module}
                        </p>
                      ))}
                      {msg.sources?.length ? (
                        <p className="text-[10px] text-stone-400">
                          Sources: {msg.sources.slice(0, 6).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Note de rating */}
                  {msg.author === "ai" && msg.interactionId ? (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[9px] text-stone-300 mr-1">Utile ?</span>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          onClick={() => rate(msg.interactionId!, v)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-stone-400 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/20 dark:hover:text-violet-300"
                          type="button"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2.5 py-1">
                <LimuleAvatar state="thinking" size={28} />
                <div>
                  <p className="text-xs font-semibold text-[#17211f] dark:text-white">Limule analyse…</p>
                  <p className="text-[10px] text-stone-400">Croisement des données en cours</p>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* ── Suggestions ─────────────────────────────────────────────── */}
          <div className={`shrink-0 flex flex-wrap gap-1.5 border-t border-black/[0.05] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1e2229] ${fullscreen ? "" : ""}`}>
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.label)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10"
              >
                <s.icon size={12} className="text-violet-500" />
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Saisie ──────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-black/[0.05] p-3 dark:border-white/10">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm focus-within:border-violet-400 transition dark:border-white/10 dark:bg-white/5">
              <LimuleIcon size={18} className="opacity-60 shrink-0" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Posez votre question à Limule…"
                disabled={loading}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white placeholder:text-stone-400 disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition"
                aria-label="Envoyer"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

        </section>
      )}
    </>
  );
}
