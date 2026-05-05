/**
 * Copilot Limule — chat IA intégré avec 12 améliorations :
 * 1. Streaming SSE        7. Quick replies contextuels
 * 2. Copier message       8. Branchement de conversation
 * 3. Suggestions/page     9. Mémoire semaine
 * 4. Indicateur durée    10. Mode rapport plein écran
 * 5. Messages épinglés   11. Alertes proactives (badge FAB)
 * 6. Actions rapides     12. Multi-tour (historique injecté)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Bell, Check, CheckCircle2,
  Clock3, Copy, Download, FileText, GitBranch, Maximize2, Minimize2,
  Pin, PinOff, Plus, Send, ShieldCheck, Sparkles, TrendingUp, Wallet,
  Wand2, X, ZoomIn,
} from "lucide-react";
import { api, type LimuleChatHistoryItem, type LimuleSignal } from "../services/api";
import { LimuleAvatar, LimuleIcon } from "./LimuleAvatar";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Signal = LimuleSignal;

type Message = {
  id: string;
  author: "user" | "ai";
  text: string;
  intent?: string;
  interactionId?: number;
  sources?: string[];
  signals?: Signal[];
  createdAt?: string | null;
  pinned?: boolean;
  isStreaming?: boolean;
};

type ConvEntry = { role: "user" | "assistant"; content: string };

/* ─── Message d'intro ─────────────────────────────────────────────────────── */
function mkIntro(): Message {
  return {
    id: "intro",
    author: "ai",
    text: `**Bonjour. Je suis Limule — votre conseiller stratégique IA.**

Connecté en temps réel à toutes les données de votre entreprise, je peux :

**🔮 Prédictions économiques** — prévisions de CA, trésorerie, tendances 30/60/90 jours
**💰 Conseils d'investissement** — embauche, stock, expansion : je chiffre l'impact et le retour
**📊 Analyse sectorielle** — benchmarks PME, conjoncture CEMAC, risques de marché
**⚠️ Risques & conformité TERAS** — alertes, score, actions correctives prioritaires
**👥 RH & masse salariale** — coûts, conformité CNPS, prévisions de paie
**📄 Rédaction professionnelle** — emails, notes, clauses, courriers prêts à envoyer

Posez votre question — j'analyse vos données réelles pour vous répondre.`,
  };
}

/* ─── Suggestions contextuelles (#3) ─────────────────────────────────────── */
type Chip = { label: string; icon: React.ElementType };
const PAGE_SUGGESTIONS: Record<string, Chip[]> = {
  "/":            [{ label: "Résumé direction du jour", icon: FileText }, { label: "Prévisions trésorerie 30 jours", icon: TrendingUp }, { label: "Score TERAS et actions urgentes", icon: ShieldCheck }],
  "/dashboard":   [{ label: "Résumé direction du jour", icon: FileText }, { label: "Prévisions trésorerie 30 jours", icon: TrendingUp }, { label: "Score TERAS et actions urgentes", icon: ShieldCheck }],
  "/payroll":     [{ label: "État des bulletins de ce mois", icon: FileText }, { label: "Vérifier la conformité CNPS", icon: ShieldCheck }, { label: "Prévisions masse salariale", icon: TrendingUp }],
  "/employees":   [{ label: "Analyser la masse salariale", icon: TrendingUp }, { label: "Quels employés sont à risque ?", icon: AlertTriangle }, { label: "Résumé RH complet", icon: FileText }],
  "/pos":         [{ label: "Meilleure heure de vente ?", icon: BarChart3 }, { label: "Produits à réassortir ?", icon: AlertTriangle }, { label: "CA POS vs objectif", icon: TrendingUp }],
  "/inventory":   [{ label: "Produits sous seuil critique", icon: AlertTriangle }, { label: "Valeur du stock actuel", icon: Wallet }, { label: "Recommandations réassort", icon: FileText }],
  "/reports-teras": [{ label: "Que corriger en urgence ?", icon: ShieldCheck }, { label: "Plan d'action conformité", icon: FileText }, { label: "Risques fiscaux identifiés", icon: AlertTriangle }],
  "/accounting":  [{ label: "Analyse du cash-flow", icon: TrendingUp }, { label: "Risques de trésorerie ?", icon: AlertTriangle }, { label: "Rapprochement SYSCEMAC", icon: FileText }],
  "/billing":     [{ label: "Factures en retard ?", icon: AlertTriangle }, { label: "Prévisions encaissements", icon: TrendingUp }, { label: "Relances à envoyer", icon: Wand2 }],
  "/work":        [{ label: "Tâches en retard urgentes", icon: AlertTriangle }, { label: "Résumé des projets", icon: FileText }, { label: "Priorisation de la semaine", icon: TrendingUp }],
  "/declarations":[{ label: "Pièces manquantes ?", icon: AlertTriangle }, { label: "Risques de déclaration", icon: ShieldCheck }, { label: "Checklist déclarative", icon: FileText }],
  "/documents":   [{ label: "Documents à confiance faible", icon: AlertTriangle }, { label: "Analyser les contrats", icon: FileText }, { label: "Pièces manquantes", icon: ShieldCheck }],
};
const DEFAULT_CHIPS: Chip[] = [
  { label: "Prévisions trésorerie 30 jours", icon: TrendingUp },
  { label: "Devrais-je investir ou embaucher ?", icon: Wallet },
  { label: "Analyse sectorielle et positionnement", icon: BarChart3 },
  { label: "Quels sont les risques prioritaires ?", icon: AlertTriangle },
  { label: "Score TERAS et actions urgentes", icon: ShieldCheck },
  { label: "Résumé direction du jour", icon: FileText },
];

/* ─── Quick replies par intention (#7) ───────────────────────────────────── */
const QUICK_REPLIES: Record<string, string[]> = {
  prediction_economique:  ["Détaille le scénario pessimiste", "Et si les ventes augmentent de 20% ?", "Quels indicateurs surveiller ?"],
  conseil_investissement: ["Quel est le délai de retour ?", "Quels sont les risques de ce choix ?", "Montre les alternatives comparées"],
  analyse_secteur:        ["Quels sont mes concurrents directs ?", "Comment me différencier ?", "Opportunités à saisir maintenant ?"],
  tresorerie:             ["Que faire pour améliorer le solde ?", "Prévision sur 60 jours", "Risques de rupture ?"],
  risk_analysis:          ["Quel risque est le plus urgent ?", "Comment corriger en priorité ?", "Créer les tâches correctives"],
  payroll_support:        ["Quels bulletins sont bloquants ?", "Vérifier la conformité CNPS", "État des virements"],
  summary:                ["Approfondis un point", "Quelles actions en priorité ?", "Générer un rapport complet"],
  question:               ["Donne plus de détails", "Quelles actions recommandes-tu ?", "Résumé en 3 points"],
};

/* ─── Indicateur de durée attendue (#4) ──────────────────────────────────── */
const HEAVY_INTENTS = new Set(["prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie", "risk_analysis"]);
function detectHeavy(text: string): boolean {
  const t = text.toLowerCase();
  return ["prévision", "investir", "secteur", "trésorerie", "risque", "analyse", "prédiction", "tendance"].some((w) => t.includes(w));
}

/* ─── Markdown léger ─────────────────────────────────────────────────────── */
function MarkdownLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function MsgContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split("\n");
  const elems: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { elems.push(<div key={i} className="h-1.5" />); }
    else if (/^#{1,3}\s/.test(l)) elems.push(<p key={i} className="font-black text-sm mt-1"><MarkdownLine text={l.replace(/^#{1,3}\s/, "")} /></p>);
    else if (/^[-•]\s/.test(l) || /^\d+\.\s/.test(l)) elems.push(
      <div key={i} className="flex items-start gap-1.5 text-sm leading-5">
        <span className="mt-1 text-violet-400 text-[10px] shrink-0">▸</span>
        <span><MarkdownLine text={l.replace(/^[-•]\s|^\d+\.\s/, "")} /></span>
      </div>
    );
    else elems.push(<p key={i} className="text-sm leading-[1.65]"><MarkdownLine text={l} /></p>);
  }
  return (
    <div className="space-y-0.5">
      {elems}
      {streaming && <span className="inline-block h-3 w-0.5 bg-violet-400 animate-pulse ml-0.5 translate-y-0.5" />}
    </div>
  );
}

/* ─── Report modal (#10) ─────────────────────────────────────────────────── */
function ReportModal({ msg, onClose }: { msg: Message; onClose: () => void }) {
  function download() {
    const blob = new Blob([msg.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `limule_rapport_${Date.now()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-black/[0.06] px-6 py-4 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
            <LimuleIcon size={20} />
          </div>
          <div className="flex-1">
            <p className="font-black text-[#17211f] dark:text-white">Rapport Limule</p>
            <p className="text-xs text-stone-400">Grand Sage V1.1 · {msg.intent ?? "analyse"}</p>
          </div>
          <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] px-3 py-1.5 text-xs font-bold text-[#17211f] hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5">
            <Download size={13} /> Télécharger
          </button>
          <button onClick={onClose} className="ml-1 grid h-8 w-8 place-items-center rounded-lg hover:bg-stone-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <MsgContent text={msg.text} />
          {msg.sources?.length ? (
            <p className="mt-6 text-[11px] text-stone-400 border-t border-black/[0.05] pt-3 dark:border-white/10">
              Sources : {msg.sources.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2); }

/** Heure courte : "14:32" */
function msgTime(v: string | null | undefined) {
  if (!v) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

/** Label relatif : "Aujourd'hui", "Hier", "Lun 28 avr.", … */
function relativeDay(v: string | null) {
  if (!v) return "Inconnu";
  const d = new Date(v);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const itemDay = new Date(d); itemDay.setHours(0, 0, 0, 0);
  if (itemDay.getTime() === today.getTime()) return "Aujourd'hui";
  if (itemDay.getTime() === yesterday.getTime()) return "Hier";
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86400000);
  if (diffDays < 7) return new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(d);
  if (diffDays < 30) return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(d);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Groupe les items d'historique par bucket de date */
function groupByDate(items: LimuleChatHistoryItem[]): { label: string; items: LimuleChatHistoryItem[] }[] {
  const buckets = new Map<string, LimuleChatHistoryItem[]>();
  for (const item of items) {
    const label = relativeDay(item.created_at);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}

const INTENT_LABELS: Record<string, string> = {
  prediction_economique: "Prévision",
  conseil_investissement: "Investissement",
  analyse_secteur: "Secteur",
  tresorerie: "Trésorerie",
  risk_analysis: "Risque",
  summary: "Résumé",
  task_creation: "Tâche",
  drafting: "Rédaction",
  payroll_support: "Paie",
  operations_support: "Opérations",
  document_analysis: "Document",
  question: "Question",
};

const INTENT_COLORS: Record<string, string> = {
  prediction_economique: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  conseil_investissement: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  analyse_secteur: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  tresorerie: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  risk_analysis: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  summary: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  task_creation: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  drafting: "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  payroll_support: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  operations_support: "bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
  document_analysis: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  question: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300",
};

const SEV: Record<string, string> = { critical: "text-red-500", high: "text-orange-500", medium: "text-amber-500", low: "text-sky-400" };

/* ═══════════════════════════════════════════════════════════════════════════ */
export function Copilot() {
  const location = useLocation();
  const navigate = useNavigate();

  /* ── États de base ──────────────────────────────────────────────────────── */
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([mkIntro()]);
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; key_configured: boolean } | null>(null);

  /* ── Historique ─────────────────────────────────────────────────────────── */
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<LimuleChatHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  /* ── Streaming (#1) ─────────────────────────────────────────────────────── */
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<(() => void) | null>(null);

  /* ── Copier (#2) ────────────────────────────────────────────────────────── */
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ── Épingler (#5) ──────────────────────────────────────────────────────── */
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [showPinned, setShowPinned] = useState(false);

  /* ── Mode rapport (#10) ─────────────────────────────────────────────────── */
  const [reportMsg, setReportMsg] = useState<Message | null>(null);

  /* ── Alertes proactives (#11) ───────────────────────────────────────────── */
  const [alertBadge, setAlertBadge] = useState(0);
  const alertSeenRef = useRef<Set<number>>(new Set());

  /* ── Indicateur durée (#4) ──────────────────────────────────────────────── */
  const [isHeavy, setIsHeavy] = useState(false);

  /* ── Mémoire semaine (#9) ───────────────────────────────────────────────── */
  const [weekSummary, setWeekSummary] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── Init ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  /* ── Alertes proactives — polling toutes les 90s (#11) ─────────────────── */
  useEffect(() => {
    function checkAlerts() {
      api.terasAlerts().then((alerts) => {
        const openCritical = alerts.filter((a) => a.status === "open" && (a.severity === "critical" || a.severity === "high"));
        const newCount = openCritical.filter((a) => !alertSeenRef.current.has(a.id)).length;
        if (newCount > 0) setAlertBadge((c) => c + newCount);
      }).catch(() => undefined);
    }
    checkAlerts();
    const timer = setInterval(checkAlerts, 90_000);
    return () => clearInterval(timer);
  }, []);

  /* ── Injecter alertes en message à l'ouverture (#11) ───────────────────── */
  useEffect(() => {
    if (!open || alertBadge === 0) return;
    setAlertBadge(0);
    api.terasAlerts().then((alerts) => {
      const openCritical = alerts.filter((a) => a.status === "open" && (a.severity === "critical" || a.severity === "high"));
      const unseen = openCritical.filter((a) => !alertSeenRef.current.has(a.id)).slice(0, 3);
      if (!unseen.length) return;
      unseen.forEach((a) => alertSeenRef.current.add(a.id));
      const text = `⚡ **${unseen.length} alerte${unseen.length > 1 ? "s" : ""} TERAS critique${unseen.length > 1 ? "s" : ""} détectée${unseen.length > 1 ? "s" : ""} :**\n\n` +
        unseen.map((a) => `- **[${a.severity.toUpperCase()}]** ${a.title} — ${a.recommendation ?? ""}`).join("\n") +
        "\n\nSouhaitez-vous un plan d'action correctif ?";
      setMessages((c) => [...c, { id: uid(), author: "ai", text, intent: "risk_analysis", signals: unseen.map((a) => ({ type: "alert", label: a.title, severity: a.severity, module: a.module })) }]);
    }).catch(() => undefined);
  }, [open, alertBadge]);

  /* ── Historique ─────────────────────────────────────────────────────────── */
  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    await api.limuleChatHistory(50)
      .then((h) => {
        setHistoryItems(h);
        // Mémoire semaine (#9)
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        const week = h.filter((item) => item.created_at && new Date(item.created_at).getTime() > cutoff);
        if (week.length) {
          const counts: Record<string, number> = {};
          week.forEach((item) => { counts[item.intent] = (counts[item.intent] ?? 0) + 1; });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(" · ");
          setWeekSummary(`Cette semaine : ${top}`);
        }
      })
      .catch(() => undefined)
      .finally(() => { setHistoryLoaded(true); setHistoryLoading(false); });
  }

  useEffect(() => { if (open && !historyLoaded) void loadHistory(); }, [open, historyLoaded]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, isStreaming, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);

  /* ── Escape ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { if (reportMsg) { setReportMsg(null); return; } if (fullscreen) { setFullscreen(false); return; } setOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, reportMsg]);

  /* ── Historique → conversation (#12) ───────────────────────────────────── */
  function buildHistory(msgs: Message[]): ConvEntry[] {
    return msgs
      .filter((m) => m.id !== "intro" && !m.isStreaming)
      .slice(-10)
      .map((m) => ({ role: m.author === "user" ? "user" as const : "assistant" as const, content: m.text }));
  }

  /* ── Envoyer (#1 streaming + #12 multi-tour) ─────────────────────────────── */
  async function send(text: string, fromBranch?: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInput("");

    // Branching (#8) : couper après le point d'ancrage
    let base = messages;
    if (fromBranch) {
      const idx = messages.findIndex((m) => m.id === fromBranch);
      base = idx >= 0 ? messages.slice(0, idx + 1) : messages;
    }

    const userMsg: Message = { id: uid(), author: "user", text: trimmed, createdAt: new Date().toISOString() };
    const aiId = uid();
    const aiPlaceholder: Message = { id: aiId, author: "ai", text: "", isStreaming: true };

    setMessages([...base, userMsg, aiPlaceholder]);
    setIsStreaming(true);
    setIsHeavy(detectHeavy(trimmed));

    const history = buildHistory(base);

    let aborted = false;
    streamAbortRef.current = () => { aborted = true; };

    await api.limuleChatStream(
      { prompt: trimmed, page_path: location.pathname, conversation_history: history },
      (partial) => {
        if (aborted) return;
        setMessages((c) => c.map((m) => m.id === aiId ? { ...m, text: partial } : m));
      },
      (final, meta) => {
        if (aborted) return;
        const savedAt = new Date().toISOString();
        setMessages((c) => c.map((m) =>
          m.id === aiId
            ? { ...m, text: final, isStreaming: false, interactionId: meta.interactionId ?? undefined, intent: meta.intent, sources: meta.sources, signals: meta.signals, createdAt: savedAt }
            : m
        ));
        if (meta.interactionId) {
          setHistoryItems((c) => [...c, {
            id: meta.interactionId!,
            prompt: trimmed,
            response: final,
            module: meta.module,
            intent: meta.intent,
            page_path: location.pathname,
            sources: meta.sources,
            signals: meta.signals,
            rating: null,
            created_at: savedAt,
          }].slice(-50));
        }
        setIsStreaming(false);
        setIsHeavy(false);
      },
      (err) => {
        if (aborted) return;
        setMessages((c) => c.map((m) =>
          m.id === aiId
            ? { ...m, text: `Erreur : ${err.message}. Vérifie que le backend est lancé.`, isStreaming: false }
            : m
        ));
        setIsStreaming(false);
        setIsHeavy(false);
      },
    );
  }

  /* ── Copier (#2) ────────────────────────────────────────────────────────── */
  function copyMsg(msg: Message) {
    navigator.clipboard.writeText(msg.text).catch(() => undefined);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  /* ── Épingler (#5) ──────────────────────────────────────────────────────── */
  function togglePin(id: string) {
    setPinnedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  /* ── Quick actions (#6) ─────────────────────────────────────────────────── */
  function actionTask(msg: Message) {
    navigate("/work", { state: { prefill: msg.text.slice(0, 120) } });
    setOpen(false);
  }
  function actionAssistant(msg: Message) {
    navigate("/assistants", { state: { prefill: msg.text.slice(0, 600) } });
    setOpen(false);
  }
  function actionExport(msg: Message) {
    const blob = new Blob([msg.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `limule_${Date.now()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ── Rating ─────────────────────────────────────────────────────────────── */
  async function rate(interactionId: number, rating: number) {
    await api.limuleFeedback(interactionId, { rating }).catch(() => undefined);
  }

  /* ── Nouveau chat / ouvrir historique ───────────────────────────────────── */
  function startNewChat() { setMessages([mkIntro()]); setInput(""); setShowHistory(false); setPinnedIds(new Set()); }
  function openHistoryItem(item: LimuleChatHistoryItem) {
    setMessages([mkIntro(),
      { id: uid(), author: "user", text: item.prompt, createdAt: item.created_at },
      { id: uid(), author: "ai", text: item.response, interactionId: item.id, intent: item.intent, sources: item.sources, signals: item.signals, createdAt: item.created_at },
    ]);
    setShowHistory(false);
  }

  /* ── Layout ─────────────────────────────────────────────────────────────── */
  const panelCls = fullscreen
    ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
    : "fixed bottom-24 right-5 z-40 flex h-[38rem] w-[calc(100vw-2rem)] max-w-[26rem] flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]";

  const suggestions = PAGE_SUGGESTIONS[location.pathname] ?? DEFAULT_CHIPS;
  const pinnedMsgs = messages.filter((m) => pinnedIds.has(m.id));
  const quickReplies = (() => {
    const last = [...messages].reverse().find((m) => m.author === "ai" && m.id !== "intro" && !m.isStreaming);
    return last?.intent ? (QUICK_REPLIES[last.intent] ?? QUICK_REPLIES["question"]) : [];
  })();

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── FAB avec badge alerte (#11) ──────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-30">
        <button
          onClick={() => setOpen(true)}
          className="relative rounded-full p-0 transition hover:scale-[1.06] focus:outline-none"
          aria-label="Ouvrir Limule"
          style={{ background: "none", border: "none" }}
        >
          <LimuleAvatar state={isStreaming ? "thinking" : "idle"} size={56} />
          {alertBadge > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow">
              {alertBadge > 9 ? "9+" : alertBadge}
            </span>
          )}
        </button>
      </div>

      {/* ── Report modal (#10) ──────────────────────────────────────────────── */}
      {reportMsg && <ReportModal msg={reportMsg} onClose={() => setReportMsg(null)} />}

      {open && (
        <section className={panelCls}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-[#0b1f3a] to-[#1a3a5c] px-5 py-3.5 text-white">
            <LimuleAvatar state={isStreaming ? "thinking" : "speaking"} size={40} />
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
              <p className="text-xs text-white/60">Grand Sage V1.1 · Conseiller stratégique</p>
            </div>
            <button onClick={() => setFullscreen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition" title={fullscreen ? "Réduire" : "Plein écran"}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => { setOpen(false); setFullscreen(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition">
              <X size={17} />
            </button>
          </div>

          {/* ── Barre outils ─────────────────────────────────────────────── */}
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-black/[0.05] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1e2229]">
            <button type="button" onClick={startNewChat} className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2 py-1 text-[11px] font-bold text-[#17211f] hover:bg-violet-50 hover:text-violet-700 transition dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10">
              <Plus size={11} /> Nouveau
            </button>
            <button type="button" onClick={() => { setShowHistory((v) => !v); if (!historyLoaded) void loadHistory(); }} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${showHistory ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200" : "border-black/[0.06] text-[#17211f] hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"}`}>
              <Clock3 size={11} /> Historique{historyItems.length ? ` (${historyItems.length})` : ""}
            </button>
            {pinnedMsgs.length > 0 && (
              <button type="button" onClick={() => setShowPinned((v) => !v)} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${showPinned ? "border-amber-300 bg-amber-50 text-amber-700" : "border-black/[0.06] text-[#17211f] hover:bg-amber-50 hover:text-amber-700 dark:border-white/10 dark:text-white"}`}>
                <Pin size={11} /> Épinglés ({pinnedMsgs.length})
              </button>
            )}
            <div className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-stone-400">
              <Sparkles size={10} className="text-violet-400" />
              Temps réel
            </div>
          </div>

          {/* ── Mémoire semaine (#9) ─────────────────────────────────────── */}
          {weekSummary && !showHistory && !showPinned && (
            <div className="shrink-0 flex items-center gap-2 border-b border-black/[0.04] bg-violet-50/50 px-4 py-1.5 dark:bg-violet-500/5 dark:border-white/10">
              <Bell size={11} className="text-violet-400 shrink-0" />
              <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-300">{weekSummary}</p>
            </div>
          )}

          {/* ── Panneau Historique (remplace le flux de messages) ─────── */}
          {showHistory && (
            <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f8fb] dark:bg-[#171a21]">
              {/* Barre de recherche */}
              <div className="shrink-0 border-b border-black/[0.05] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1e2229]">
                <div className="flex items-center gap-2 rounded-lg border border-black/[0.07] bg-[#f8f8fb] px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
                  <Clock3 size={12} className="shrink-0 text-stone-400" />
                  <input
                    autoFocus
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Rechercher dans l'historique…"
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none dark:text-white placeholder:text-stone-400"
                  />
                  {historySearch && (
                    <button onClick={() => setHistorySearch("")} className="text-stone-400 hover:text-stone-600 dark:hover:text-white">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Liste */}
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {historyLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-stone-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
                    <p className="text-xs">Chargement…</p>
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-stone-400">
                    <Clock3 size={28} className="opacity-30" />
                    <p className="text-xs font-semibold">Aucun échange enregistré</p>
                    <p className="text-[11px] text-stone-300">Posez votre première question à Limule</p>
                  </div>
                ) : (() => {
                  const q = historySearch.toLowerCase();
                  const filtered = q
                    ? [...historyItems].reverse().filter((it) =>
                        it.prompt.toLowerCase().includes(q) || it.response.toLowerCase().includes(q)
                      )
                    : [...historyItems].reverse();

                  if (filtered.length === 0) return (
                    <p className="py-8 text-center text-xs text-stone-400">Aucun résultat pour « {historySearch} »</p>
                  );

                  const groups = q ? [{ label: `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`, items: filtered }] : groupByDate(filtered);

                  return (
                    <div className="space-y-5">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                            {group.label}
                          </p>
                          <div className="space-y-1.5">
                            {group.items.map((item) => {
                              const intentLabel = INTENT_LABELS[item.intent] ?? item.intent;
                              const intentCls = INTENT_COLORS[item.intent] ?? INTENT_COLORS.question;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => openHistoryItem(item)}
                                  className="group block w-full rounded-xl border border-black/[0.05] bg-white px-3.5 py-3 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5"
                                >
                                  {/* Ligne supérieure : intent + heure + module */}
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${intentCls}`}>
                                      {intentLabel}
                                    </span>
                                    {item.module && item.module !== "global" && (
                                      <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 dark:bg-white/10 dark:text-stone-400">
                                        {item.module}
                                      </span>
                                    )}
                                    <span className="ml-auto text-[10px] text-stone-300 dark:text-stone-600">
                                      {msgTime(item.created_at)}
                                    </span>
                                  </div>
                                  {/* Prompt */}
                                  <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-[#17211f] dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300 transition">
                                    {item.prompt}
                                  </p>
                                  {/* Réponse preview */}
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-400">
                                    {item.response.replace(/[#*_`]/g, "").slice(0, 140)}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Messages épinglés (#5) ───────────────────────────────────── */}
          {showPinned && pinnedMsgs.length > 0 && (
            <div className="max-h-52 shrink-0 overflow-y-auto border-b border-black/[0.05] bg-amber-50/50 p-3 dark:border-white/10 dark:bg-amber-500/5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-600">Messages épinglés</p>
              <div className="space-y-1.5">
                {pinnedMsgs.map((m) => (
                  <div key={m.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 dark:border-amber-500/20 dark:bg-white/5">
                    <p className="text-xs font-semibold text-[#17211f] dark:text-white line-clamp-3">{m.text.slice(0, 200)}{m.text.length > 200 ? "…" : ""}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={() => setReportMsg(m)} className="text-[10px] text-violet-500 hover:underline">Voir rapport</button>
                      <button onClick={() => togglePin(m.id)} className="text-[10px] text-stone-400 hover:underline">Désépingler</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Messages (masqués quand historique actif) ───────────────── */}
          {!showHistory && (
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfd] p-4 dark:bg-[#171a21]">
            {messages.map((msg, idx) => (
              <div key={msg.id}>
                <div className={`flex items-end gap-2 ${msg.author === "user" ? "justify-end" : "justify-start"}`}>
                  {/* Avatar Limule */}
                  {msg.author === "ai" && (
                    <div className="mb-0.5 shrink-0 self-end">
                      <LimuleIcon size={18} className="opacity-50" />
                    </div>
                  )}

                  <div className={`group relative max-w-[88%] ${msg.author === "user" ? "" : "flex-1"}`}>
                    {/* Bulle */}
                    <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                      msg.author === "user"
                        ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm leading-relaxed rounded-br-md"
                        : "bg-white text-[#17211f] dark:bg-white/[0.07] dark:text-white rounded-bl-md"
                    }`}>
                      {msg.author === "user" ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        <MsgContent text={msg.text} streaming={msg.isStreaming} />
                      )}

                      {/* Intent badge sur les messages IA (non-intro) */}
                      {msg.author === "ai" && msg.intent && msg.intent !== "question" && msg.id !== "intro" && !msg.isStreaming && (
                        <div className="mt-2 flex items-center gap-1.5 border-t border-black/[0.05] pt-2 dark:border-white/10">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${INTENT_COLORS[msg.intent] ?? INTENT_COLORS.question}`}>
                            {INTENT_LABELS[msg.intent] ?? msg.intent}
                          </span>
                          {/* Signaux */}
                          {msg.signals?.slice(0, 1).map((s, i) => (
                            <span key={i} className={`text-[10px] font-semibold ${SEV[s.severity] ?? "text-stone-400"}`}>
                              ⚡ {s.label}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Sources discrètes */}
                      {msg.author === "ai" && msg.sources?.length && !msg.isStreaming && msg.id !== "intro" ? (
                        <p className="mt-1 text-[10px] text-stone-300 dark:text-stone-600">
                          {msg.sources.slice(0, 4).join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    {/* Timestamp sous la bulle */}
                    {msg.createdAt && (
                      <p className={`mt-0.5 text-[10px] text-stone-300 dark:text-stone-600 ${msg.author === "user" ? "text-right" : "text-left"}`}>
                        {msgTime(msg.createdAt)}
                      </p>
                    )}

                    {/* ── Barre d'actions — visible au survol seulement ────── */}
                    {msg.author === "ai" && !msg.isStreaming && msg.id !== "intro" && (
                      <div className="mt-1.5 hidden group-hover:flex flex-wrap items-center gap-0.5 rounded-xl border border-black/[0.05] bg-white px-2 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                        {/* Copier */}
                        <button onClick={() => copyMsg(msg)} title="Copier" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition dark:hover:bg-white/10 dark:hover:text-white">
                          {copiedId === msg.id ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                          {copiedId === msg.id ? "Copié" : "Copier"}
                        </button>
                        {/* Épingler */}
                        <button onClick={() => togglePin(msg.id)} title={pinnedIds.has(msg.id) ? "Désépingler" : "Épingler"} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${pinnedIds.has(msg.id) ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10" : "text-stone-500 hover:bg-stone-100 hover:text-amber-600 dark:hover:bg-white/10"}`}>
                          {pinnedIds.has(msg.id) ? <PinOff size={10} /> : <Pin size={10} />}
                          {pinnedIds.has(msg.id) ? "Désépingler" : "Épingler"}
                        </button>
                        {/* Rapport (longues réponses) */}
                        {msg.text.length > 350 && (
                          <button onClick={() => setReportMsg(msg)} title="Voir en plein écran" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-violet-50 hover:text-violet-700 transition dark:hover:bg-violet-500/10">
                            <ZoomIn size={10} /> Rapport
                          </button>
                        )}
                        {/* Séparateur */}
                        <span className="mx-0.5 h-3 w-px bg-stone-200 dark:bg-white/10" />
                        {/* Tâche */}
                        <button onClick={() => actionTask(msg)} title="Créer une tâche" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-emerald-50 hover:text-emerald-700 transition dark:hover:bg-emerald-500/10">
                          <CheckCircle2 size={10} /> Tâche
                        </button>
                        {/* Email */}
                        <button onClick={() => actionAssistant(msg)} title="Rédiger un email" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-blue-50 hover:text-blue-700 transition dark:hover:bg-blue-500/10">
                          <Wand2 size={10} /> Email
                        </button>
                        {/* Export */}
                        <button onClick={() => actionExport(msg)} title="Exporter" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition dark:hover:bg-white/10">
                          <Download size={10} /> Export
                        </button>
                        {/* Branchement */}
                        <button onClick={() => send("", msg.id)} title="Reprendre la conversation à partir d'ici" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-indigo-50 hover:text-indigo-700 transition dark:hover:bg-indigo-500/10">
                          <GitBranch size={10} /> Reprendre ici
                        </button>
                        {/* Rating 👍 / 👎 */}
                        {msg.interactionId && (
                          <>
                            <span className="mx-0.5 h-3 w-px bg-stone-200 dark:bg-white/10" />
                            <button onClick={() => rate(msg.interactionId!, 5)} title="Utile" className="rounded-lg px-1.5 py-1 text-[12px] text-stone-400 hover:bg-emerald-50 hover:text-emerald-600 transition dark:hover:bg-emerald-500/10">👍</button>
                            <button onClick={() => rate(msg.interactionId!, 1)} title="Pas utile" className="rounded-lg px-1.5 py-1 text-[12px] text-stone-400 hover:bg-red-50 hover:text-red-500 transition dark:hover:bg-red-500/10">👎</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick replies après le dernier message IA (#7) */}
                {msg.author === "ai" && !msg.isStreaming && msg.id !== "intro" && idx === messages.length - 1 && quickReplies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {quickReplies.map((qr) => (
                      <button key={qr} onClick={() => send(qr)} disabled={isStreaming} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-40 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                        {qr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Indicateur streaming (#4) */}
            {isStreaming && (
              <div className="flex items-center gap-2.5 py-1">
                <LimuleAvatar state="thinking" size={26} />
                <div>
                  <p className="text-xs font-semibold text-[#17211f] dark:text-white">Limule analyse…</p>
                  <p className="text-[10px] text-stone-400">{isHeavy ? "Analyse approfondie · 15-25s attendues" : "Croisement des données en cours"}</p>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          )} {/* fin !showHistory */}

          {/* ── Suggestions contextuelles (#3) — masquées pendant historique */}
          {!showHistory && (
          <div className="shrink-0 flex flex-wrap gap-1 border-t border-black/[0.05] bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#1e2229]">
            {suggestions.slice(0, fullscreen ? 6 : 3).map((s) => (
              <button key={s.label} onClick={() => send(s.label)} disabled={isStreaming} className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10">
                <s.icon size={11} className="text-violet-500" />
                {s.label}
              </button>
            ))}
          </div>
          )} {/* fin !showHistory suggestions */}

          {/* ── Saisie (toujours visible) ─────────────────────────────────── */}
          <div className="shrink-0 border-t border-black/[0.05] p-3 dark:border-white/10">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm focus-within:border-violet-400 transition dark:border-white/10 dark:bg-white/5">
              <LimuleIcon size={17} className="opacity-50 shrink-0" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Posez votre question à Limule…"
                disabled={isStreaming}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white placeholder:text-stone-400 disabled:opacity-50"
              />
              {isStreaming ? (
                <button onClick={() => { streamAbortRef.current?.(); setIsStreaming(false); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition" title="Arrêter">
                  <X size={14} />
                </button>
              ) : (
                <button onClick={() => send(input)} disabled={!input.trim()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition">
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>

        </section>
      )}
    </>
  );
}
