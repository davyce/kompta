/**
 * Copilot Limule — chat IA intégré avec 12 améliorations :
 * 1. Streaming SSE        7. Quick replies contextuels
 * 2. Copier message       8. Branchement de conversation
 * 3. Suggestions/page     9. Mémoire semaine
 * 4. Indicateur durée    10. Mode rapport plein écran
 * 5. Messages épinglés   11. Alertes proactives (badge FAB)
 * 6. Actions rapides     12. Multi-tour (historique injecté)
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertTriangle, BarChart3, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, Clock3, Copy, Download, FileText, GitBranch, ListTodo,
  Maximize2, Minimize2, Pin, PinOff, Plus, Send, ShieldCheck, Sparkles,
  Trash2, TrendingUp, User2, Wallet, Wand2, X, ZoomIn,
} from "lucide-react";
import { api, type LimuleChatHistoryItem, type LimuleSignal } from "../services/api";
import { LimuleAvatar, LimuleIcon } from "./LimuleAvatar";
import i18n from "../i18n";

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

type TaskDraft = {
  msgId: string;
  title: string;
  description: string;
  assignee_name: string;
  priority: "low" | "normal" | "high";
  due_date: string;
  due_time: string;
  proof_required: boolean;
  autoDetectedPriority: "low" | "normal" | "high";
};

/* ─── Message d'intro ─────────────────────────────────────────────────────── */
function mkIntro(tr: TFunction): Message {
  return {
    id: "intro",
    author: "ai",
    text: tr("components.copilot.intro"),
  };
}

/* ─── Suggestions contextuelles (#3) ─────────────────────────────────────── */
type Chip = { tk: string; icon: React.ElementType };
const PAGE_SUGGESTIONS: Record<string, Chip[]> = {
  "/":            [{ tk: "components.copilot.suggestions.dailySummary", icon: FileText }, { tk: "components.copilot.suggestions.cashForecast30", icon: TrendingUp }, { tk: "components.copilot.suggestions.terasUrgent", icon: ShieldCheck }],
  "/dashboard":   [{ tk: "components.copilot.suggestions.dailySummary", icon: FileText }, { tk: "components.copilot.suggestions.cashForecast30", icon: TrendingUp }, { tk: "components.copilot.suggestions.terasUrgent", icon: ShieldCheck }],
  "/payroll":     [{ tk: "components.copilot.suggestions.payrollStatus", icon: FileText }, { tk: "components.copilot.suggestions.cnpsCompliance", icon: ShieldCheck }, { tk: "components.copilot.suggestions.payrollForecast", icon: TrendingUp }],
  "/employees":   [{ tk: "components.copilot.suggestions.payrollMass", icon: TrendingUp }, { tk: "components.copilot.suggestions.employeesAtRisk", icon: AlertTriangle }, { tk: "components.copilot.suggestions.hrSummary", icon: FileText }],
  "/pos":         [{ tk: "components.copilot.suggestions.bestSalesHour", icon: BarChart3 }, { tk: "components.copilot.suggestions.restockProducts", icon: AlertTriangle }, { tk: "components.copilot.suggestions.posTarget", icon: TrendingUp }],
  "/inventory":   [{ tk: "components.copilot.suggestions.criticalStock", icon: AlertTriangle }, { tk: "components.copilot.suggestions.stockValue", icon: Wallet }, { tk: "components.copilot.suggestions.restockRecommendations", icon: FileText }],
  "/reports-teras": [{ tk: "components.copilot.suggestions.fixUrgent", icon: ShieldCheck }, { tk: "components.copilot.suggestions.compliancePlan", icon: FileText }, { tk: "components.copilot.suggestions.taxRisks", icon: AlertTriangle }],
  "/accounting":  [{ tk: "components.copilot.suggestions.cashflowAnalysis", icon: TrendingUp }, { tk: "components.copilot.suggestions.cashRisks", icon: AlertTriangle }, { tk: "components.copilot.suggestions.syscemacReconcile", icon: FileText }],
  "/billing":     [{ tk: "components.copilot.suggestions.overdueInvoices", icon: AlertTriangle }, { tk: "components.copilot.suggestions.collectionForecast", icon: TrendingUp }, { tk: "components.copilot.suggestions.followupsToSend", icon: Wand2 }],
  "/work":        [{ tk: "components.copilot.suggestions.urgentLateTasks", icon: AlertTriangle }, { tk: "components.copilot.suggestions.projectsSummary", icon: FileText }, { tk: "components.copilot.suggestions.weekPriorities", icon: TrendingUp }],
  "/declarations":[{ tk: "components.copilot.suggestions.missingDocs", icon: AlertTriangle }, { tk: "components.copilot.suggestions.declarationRisks", icon: ShieldCheck }, { tk: "components.copilot.suggestions.declarationChecklist", icon: FileText }],
  "/documents":   [{ tk: "components.copilot.suggestions.lowTrustDocs", icon: AlertTriangle }, { tk: "components.copilot.suggestions.analyzeContracts", icon: FileText }, { tk: "components.copilot.suggestions.missingDocsShort", icon: ShieldCheck }],
};
const DEFAULT_CHIPS: Chip[] = [
  { tk: "components.copilot.suggestions.cashForecast30", icon: TrendingUp },
  { tk: "components.copilot.suggestions.investOrHire", icon: Wallet },
  { tk: "components.copilot.suggestions.sectorPositioning", icon: BarChart3 },
  { tk: "components.copilot.suggestions.priorityRisks", icon: AlertTriangle },
  { tk: "components.copilot.suggestions.terasUrgent", icon: ShieldCheck },
  { tk: "components.copilot.suggestions.dailySummary", icon: FileText },
];

/* ─── Quick replies par intention (#7) ───────────────────────────────────── */
const QUICK_REPLY_KEYS: Record<string, string[]> = {
  prediction_economique:  ["pessimisticScenario", "salesUp20", "indicatorsToWatch"],
  conseil_investissement: ["paybackDelay", "choiceRisks", "compareAlternatives"],
  analyse_secteur:        ["directCompetitors", "differentiate", "opportunitiesNow"],
  tresorerie:             ["improveBalance", "forecast60", "cashBreakRisk"],
  risk_analysis:          ["mostUrgentRisk", "fixPriority", "createCorrectiveTasks"],
  payroll_support:        ["blockingPayslips", "cnpsCompliance", "transferStatus"],
  summary:                ["goDeeper", "priorityActions", "fullReport"],
  question:               ["moreDetails", "recommendedActions", "threePointSummary"],
};

/* ─── Indicateur de durée attendue (#4) ──────────────────────────────────── */
const HEAVY_INTENTS = new Set(["prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie", "risk_analysis"]);
function detectHeavy(text: string): boolean {
  const t = text.toLowerCase();
  return ["prévision", "forecast", "investir", "invest", "secteur", "sector", "trésorerie", "cash", "risque", "risk", "analyse", "analysis", "prédiction", "prediction", "tendance", "trend"].some((w) => t.includes(w));
}

/* ─── Helpers tâche inline ────────────────────────────────────────────────── */
/** Extrait un titre propre depuis un texte IA (première phrase, sans markdown, ≤80 chars) */
/** Termes génériques à ignorer comme titre de tâche */
const VAGUE_TITLE = /^(diagnostic|analyse|résumé|rapport|note|alerte|synthèse|bilan|revue|voici|ci-dessous|suite à|limule|bonjour|conclusion|recommandation|évaluation|aperçu)\b/i;

/**
 * Extrait un titre pertinent depuis un message IA :
 * - ignore les en-têtes markdown et les phrases génériques
 * - cherche la première ligne descriptive (≥ 10 chars, non vague)
 * - sinon prend le premier point de liste, sinon la première phrase
 */
function extractTaskTitle(text: string): string {
  const trim80 = (s: string) => s.length > 80 ? s.slice(0, 77) + "…" : s;

  // Découpe en lignes, nettoie le markdown
  const lines = text
    .split("\n")
    .map((l) =>
      l
        .replace(/^#{1,3}\s+/, "")          // titres markdown
        .replace(/^[-•*]\s+/, "")           // puces
        .replace(/\*\*(.*?)\*\*/g, "$1")    // gras
        .replace(/[*_`>]/g, "")             // reste du markdown
        .trim()
    )
    .filter((l) => l.length >= 10);         // trop courts → ignorés

  // 1. Première ligne non-vague
  const good = lines.find((l) => !VAGUE_TITLE.test(l));
  if (good) return trim80(good.split(/[.!?]/)[0].trim() || good);

  // 2. Fallback : première ligne disponible (même vague)
  if (lines[0]) return trim80(lines[0].split(/[.!?]/)[0].trim() || lines[0]);

  // 3. Dernier recours : brute force
  const raw = text.replace(/[#*_`>]/g, "").trim();
  return trim80(raw.split(/[.!?\n]/)[0].trim() || raw.slice(0, 80));
}

/**
 * Génère une description structurée à partir du message IA :
 * - extrait les points de liste (actions concrètes) en priorité
 * - sinon prend le premier paragraphe non-générique
 * - toujours court et actionnable (≤ 350 chars)
 */
function extractTaskDescription(text: string): string {
  const stripMd = (s: string) =>
    s.replace(/^#{1,3}\s+/, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/[*_`>]/g, "").trim();

  // 1. Collecter les puces/listes numérotées
  const bullets = text
    .split("\n")
    .filter((l) => /^(\s*[-•*]|\s*\d+\.)\s+/.test(l))
    .map((l) => stripMd(l.replace(/^(\s*[-•*]|\s*\d+\.)\s+/, "")))
    .filter((l) => l.length > 8)
    .slice(0, 5);

  if (bullets.length >= 2) {
    return bullets.map((b) => `• ${b}`).join("\n").slice(0, 350);
  }

  // 2. Premier paragraphe significatif non-générique
  const paras = text
    .split(/\n{2,}/)
    .map(stripMd)
    .filter((p) => p.length > 20 && !VAGUE_TITLE.test(p));

  if (paras.length) return paras[0].slice(0, 350);

  // 3. Fallback brut
  return stripMd(text).slice(0, 350);
}

/** Détecte la priorité à partir des mots-clés du message IA */
function detectPriority(text: string): "low" | "normal" | "high" {
  const t = text.toLowerCase();
  if (/urgent|critique|immédiat|bloqu|alerte critique|risque élevé|en retard|prioritaire/.test(t)) return "high";
  if (/important|surveillance|attention|vérifi|délai|rappel|suivi/.test(t)) return "normal";
  return "normal";
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
  const { t: tr } = useTranslation();
  async function download() {
    // Si l'interaction a un ID backend → télécharger le PDF généré par le serveur
    if (msg.interactionId) {
      try {
        const blob = await api.aiDownload(msg.interactionId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `limule-rapport-${msg.interactionId}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      } catch { /* on tente le PDF client-side ci-dessous */ }
    }
    // Fallback : PDF client-side via service
    const blob = await _buildClientPdf(msg.text, msg.intent ?? "report");
    const isPdf = blob.type === "application/pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `limule_rapport_${Date.now()}.${isPdf ? "pdf" : "txt"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (!isPdf) {
      // Échec EXPLICITE : la génération PDF a échoué, on exporte le texte brut.
      window.alert(tr("components.copilot.alerts.pdfUnavailableTxt"));
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-black/[0.06] px-6 py-4 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
            <LimuleIcon size={20} />
          </div>
          <div className="flex-1">
            <p className="font-black text-[#17211f] dark:text-white">{tr("components.copilot.report.title")}</p>
            <p className="text-xs text-stone-400">{tr("components.copilot.subtitle")} · {msg.intent ? tr(INTENT_LABELS[msg.intent] ?? "components.copilot.intents.question", { defaultValue: msg.intent }) : tr("components.copilot.intents.analysis")}</p>
          </div>
          <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] px-3 py-1.5 text-xs font-bold text-[#17211f] hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5">
            <Download size={13} /> {tr("common.download")}
          </button>
          <button onClick={onClose} className="ml-1 grid h-8 w-8 place-items-center rounded-lg hover:bg-stone-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <MsgContent text={msg.text} />
          {msg.sources?.length ? (
            <p className="mt-6 text-[11px] text-stone-400 border-t border-black/[0.05] pt-3 dark:border-white/10">
              {tr("components.copilot.sources", { sources: msg.sources.join(", ") })}
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
  return new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

/** Label relatif : "Aujourd'hui", "Hier", "Lun 28 avr.", … */
function relativeDay(v: string | null, tr: TFunction) {
  if (!v) return tr("components.copilot.history.unknownDate");
  const d = new Date(v);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const itemDay = new Date(d); itemDay.setHours(0, 0, 0, 0);
  if (itemDay.getTime() === today.getTime()) return tr("components.copilot.history.today");
  if (itemDay.getTime() === yesterday.getTime()) return tr("components.copilot.history.yesterday");
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86400000);
  if (diffDays < 7) return new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(d);
  if (diffDays < 30) return new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric", month: "short" }).format(d);
  return new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Groupe les items d'historique par bucket de date */
function groupByDate(items: LimuleChatHistoryItem[], tr: TFunction): { label: string; items: LimuleChatHistoryItem[] }[] {
  const buckets = new Map<string, LimuleChatHistoryItem[]>();
  for (const item of items) {
    const label = relativeDay(item.created_at, tr);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}

const INTENT_LABELS: Record<string, string> = {
  prediction_economique: "components.copilot.intents.prediction",
  conseil_investissement: "components.copilot.intents.investment",
  analyse_secteur: "components.copilot.intents.sector",
  tresorerie: "components.copilot.intents.cash",
  risk_analysis: "components.copilot.intents.risk",
  summary: "components.copilot.intents.summary",
  task_creation: "components.copilot.intents.task",
  drafting: "components.copilot.intents.drafting",
  payroll_support: "components.copilot.intents.payroll",
  operations_support: "components.copilot.intents.operations",
  document_analysis: "components.copilot.intents.document",
  question: "components.copilot.intents.question",
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

/* ─── Helper PDF fallback (via endpoint backend) ─────────────────────────── */
async function _buildClientPdf(text: string, kind = "text"): Promise<Blob> {
  // Extraire un titre depuis la première ligne non vide
  const firstLine = text.split("\n").find((l) => l.trim()) ?? i18n.t("components.copilot.pdf.defaultTitle");
  const title = firstLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").slice(0, 80);
  try {
    return await api.aiContentPdf({ title, content: text, kind });
  } catch {
    // Ultime fallback : blob texte brut
    return new Blob([text], { type: "text/plain" });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function Copilot() {
  const { t: tr } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  /* ── États de base ──────────────────────────────────────────────────────── */
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => [mkIntro(tr)]);
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; key_configured: boolean } | null>(null);

  /* ── Branchement (#8) ───────────────────────────────────────────────────── */
  const [branchAnchorId, setBranchAnchorId] = useState<string | null>(null);

  /* ── Historique ─────────────────────────────────────────────────────────── */
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<LimuleChatHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  /* ── Indicateur durée (#4) ──────────────────────────────────────────────── */
  const [isHeavy, setIsHeavy] = useState(false);

  /* ── Mémoire semaine (#9) ───────────────────────────────────────────────── */
  const [weekSummary, setWeekSummary] = useState<string | null>(null);

  /* ── Création de tâche inline ───────────────────────────────────────────── */
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [taskEmployees, setTaskEmployees] = useState<{ name: string }[]>([]);
  const [taskEmployeesLoaded, setTaskEmployeesLoaded] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskCreated, setTaskCreated] = useState<{ id: number; title: string } | null>(null);
  const [taskDescOpen, setTaskDescOpen] = useState(false);
  const [taskDescEditing, setTaskDescEditing] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── Init ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  useEffect(() => {
    setMessages((current) => current.map((m) => m.id === "intro" ? mkIntro(tr) : m));
  }, [tr]);

  /* Alertes proactives désactivées — l'utilisateur consulte TERAS depuis la page dédiée */

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
            .map(([k, v]) => tr("components.copilot.weekItem", { count: v, intent: tr(INTENT_LABELS[k] ?? "components.copilot.intents.question", { defaultValue: k.replace(/_/g, " ") }) })).join(" · ");
          setWeekSummary(tr("components.copilot.weekSummary", { summary: top }));
        }
      })
      .catch(() => undefined)
      .finally(() => { setHistoryLoaded(true); setHistoryLoading(false); });
  }

  async function deleteInteraction(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await api.limuleDeleteInteraction(id).catch(() => undefined);
    setHistoryItems((c) => c.filter((it) => it.id !== id));
  }

  async function clearHistory() {
    await api.limuleClearHistory().catch(() => undefined);
    setHistoryItems([]);
    setWeekSummary(null);
    setClearConfirm(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => api.limuleDeleteInteraction(id).catch(() => undefined)));
    setHistoryItems((c) => c.filter((it) => !selectedIds.has(it.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  useEffect(() => { if (open && !historyLoaded) void loadHistory(); }, [open, historyLoaded]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, isStreaming, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);

  /* Préchargement des employés dès l'ouverture — évite la race condition */
  useEffect(() => {
    if (open && !taskEmployeesLoaded) {
      api.employees()
        .then((emps) => setTaskEmployees(emps.map((e) => ({ name: `${e.first_name} ${e.last_name}`.trim() }))))
        .catch(() => undefined)
        .finally(() => setTaskEmployeesLoaded(true));
    }
  }, [open, taskEmployeesLoaded]);

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
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInput("");

    // Branching (#8) : utilise l'ancre active si présente
    let base = messages;
    if (branchAnchorId) {
      const idx = messages.findIndex((m) => m.id === branchAnchorId);
      base = idx >= 0 ? messages.slice(0, idx + 1) : messages;
      setBranchAnchorId(null);
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
            ? { ...m, text: tr("components.copilot.errors.backend", { message: err.message }), isStreaming: false }
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
  async function actionTask(msg: Message) {
    const title = extractTaskTitle(msg.text);
    const pri = detectPriority(msg.text);
    const description = extractTaskDescription(msg.text);

    // Si le titre extrait est suffisamment précis (≥ 15 chars, non vague), on crée directement
    const isConfident = title.length >= 15 && !/^(voici|voilà|bien sûr|je vous|je peux|votre)/i.test(title);
    if (isConfident) {
      setTaskDraft({
        msgId: msg.id,
        title,
        description,
        assignee_name: "",
        priority: pri,
        due_date: "",
        due_time: "",
        proof_required: false,
        autoDetectedPriority: pri,
      });
      setTaskSaving(true);
      setTaskCreated(null);
      try {
        const task = await api.createTask({
          title,
          description: description || undefined,
          assignee_name: undefined,
          priority: pri,
          due_date: null,
          due_time: null,
          source: "limule",
          proof_required: false,
          status: "todo",
        });
        setTaskCreated({ id: task.id, title: task.title });
        // Ouvrir le panel pour montrer la confirmation (mais pas le formulaire)
        setTaskDescOpen(true);
        setTaskDescEditing(false);
      } catch {
        // En cas d'erreur, ouvrir le modal pour correction manuelle
        setTaskDescOpen(true);
        setTaskDescEditing(true);
      } finally {
        setTaskSaving(false);
      }
    } else {
      // Titre trop court ou vague → ouvrir le modal
      setTaskDraft({
        msgId: msg.id,
        title,
        description,
        assignee_name: "",
        priority: pri,
        due_date: "",
        due_time: "",
        proof_required: false,
        autoDetectedPriority: pri,
      });
      setTaskCreated(null);
      setTaskDescOpen(true);
      setTaskDescEditing(false);
    }
  }
  function actionAssistant(msg: Message) {
    navigate("/assistants", { state: { prefill: msg.text.slice(0, 600) } });
    setOpen(false);
  }

  async function saveTask() {
    if (!taskDraft || taskSaving) return;
    setTaskSaving(true);
    try {
      const task = await api.createTask({
        title: taskDraft.title,
        description: taskDraft.description || undefined,
        assignee_name: taskDraft.assignee_name || undefined,
        priority: taskDraft.priority,
        due_date: taskDraft.due_date || null,
        due_time: taskDraft.due_time || null,
        source: "limule",
        proof_required: taskDraft.proof_required,
        status: "todo",
      });
      setTaskCreated({ id: task.id, title: task.title });
    } catch { /* ignore */ }
    finally { setTaskSaving(false); }
  }

  async function actionExport(msg: Message) {
    // Si l'interaction a un ID backend → télécharger le PDF du serveur
    if (msg.interactionId) {
      try {
        const blob = await api.aiDownload(msg.interactionId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `limule-${msg.interactionId}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      } catch { /* on tente le PDF client-side ci-dessous */ }
    }
    // Fallback : PDF client-side
    const blob = await _buildClientPdf(msg.text, msg.intent ?? "analyse");
    const isPdf = blob.type === "application/pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `limule_${Date.now()}.${isPdf ? "pdf" : "txt"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (!isPdf) {
      window.alert(tr("components.copilot.alerts.pdfUnavailableTxt"));
    }
  }

  /* ── Rating ─────────────────────────────────────────────────────────────── */
  async function rate(interactionId: number, rating: number) {
    await api.limuleFeedback(interactionId, { rating }).catch(() => undefined);
  }

  /* ── Reprendre ici (#8) — coupe la conv + focus saisie ─────────────────── */
  function reprendreIci(msg: Message) {
    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx >= 0) setMessages(messages.slice(0, idx + 1));
    setBranchAnchorId(msg.id);
    setTimeout(() => inputRef.current?.focus(), 60);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  /* ── Nouveau chat / ouvrir historique ───────────────────────────────────── */
  function startNewChat() { setMessages([mkIntro(tr)]); setInput(""); setShowHistory(false); setPinnedIds(new Set()); }
  function openHistoryItem(item: LimuleChatHistoryItem) {
    setMessages([mkIntro(tr),
      { id: uid(), author: "user", text: item.prompt, createdAt: item.created_at },
      { id: uid(), author: "ai", text: item.response, interactionId: item.id, intent: item.intent, sources: item.sources, signals: item.signals, createdAt: item.created_at },
    ]);
    setShowHistory(false);
  }

  /* ── Layout ─────────────────────────────────────────────────────────────── */
  const panelCls = fullscreen
    ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]"
    : "fixed right-5 z-40 flex h-[min(38rem,calc(100vh-12rem))] w-[calc(100vw-2rem)] max-w-[26rem] flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229] bottom-[calc(9rem+env(safe-area-inset-bottom))] lg:bottom-24";
  // Sur mobile, le FAB recouvrait les contrôles essentiels de la caisse et la
  // zone d'envoi du chat. Limule reste accessible via la navigation dédiée ;
  // le bouton flottant réapparaît sur desktop où l'espace est suffisant.
  const suppressMobileFab = location.pathname === "/pos" || location.pathname === "/chat";

  const suggestions = (PAGE_SUGGESTIONS[location.pathname] ?? DEFAULT_CHIPS).map((s) => ({ ...s, label: tr(s.tk) }));
  const pinnedMsgs = messages.filter((m) => pinnedIds.has(m.id));
  const quickReplies = (() => {
    const last = [...messages].reverse().find((m) => m.author === "ai" && m.id !== "intro" && !m.isStreaming);
    const keys = last?.intent ? (QUICK_REPLY_KEYS[last.intent] ?? QUICK_REPLY_KEYS.question) : [];
    return keys.map((key) => tr(`components.copilot.quickReplies.${key}`));
  })();

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── FAB avec badge alerte (#11) ──────────────────────────────────── */}
      <div className={`fixed right-5 z-30 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-5 ${suppressMobileFab ? "hidden lg:block" : ""}`}>
        <button
          data-tour="limule"
          onClick={() => setOpen(true)}
          className="relative rounded-full p-0 transition hover:scale-[1.06] focus:outline-none"
          aria-label={tr("components.copilot.openLimule")}
          style={{ background: "none", border: "none" }}
        >
          <LimuleAvatar state={isStreaming ? "thinking" : "idle"} size={56} />
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
                    {tr("components.copilot.aiActive")}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60">{tr("components.copilot.subtitle")}</p>
            </div>
            <button onClick={() => setFullscreen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition" title={fullscreen ? tr("components.copilot.reduce") : tr("components.copilot.fullscreen")}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => { setOpen(false); setFullscreen(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition">
              <X size={17} />
            </button>
          </div>

          {/* ── Barre outils ─────────────────────────────────────────────── */}
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-black/[0.05] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1e2229]">
            <button type="button" onClick={startNewChat} className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2 py-1 text-[11px] font-bold text-[#17211f] hover:bg-violet-50 hover:text-violet-700 transition dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10">
              <Plus size={11} /> {tr("components.copilot.newChat")}
            </button>
            <button type="button" onClick={() => { setShowHistory((v) => !v); if (!historyLoaded) void loadHistory(); exitSelectionMode(); }} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${showHistory ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200" : "border-black/[0.06] text-[#17211f] hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-white dark:hover:bg-violet-500/10"}`}>
              <Clock3 size={11} /> {tr("components.copilot.history.title")}{historyItems.length ? ` (${historyItems.length})` : ""}
            </button>
            {pinnedMsgs.length > 0 && (
              <button type="button" onClick={() => setShowPinned((v) => !v)} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${showPinned ? "border-amber-300 bg-amber-50 text-amber-700" : "border-black/[0.06] text-[#17211f] hover:bg-amber-50 hover:text-amber-700 dark:border-white/10 dark:text-white"}`}>
                <Pin size={11} /> {tr("components.copilot.pinned.short", { count: pinnedMsgs.length })}
              </button>
            )}
            <div className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-stone-400">
              <Sparkles size={10} className="text-violet-400" />
              {tr("components.copilot.realtime")}
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
              {/* Barre de recherche + actions */}
              <div className="shrink-0 border-b border-black/[0.05] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1e2229]">
                {/* Ligne recherche */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-black/[0.07] bg-[#f8f8fb] px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <Clock3 size={12} className="shrink-0 text-stone-400" />
                    <input
                      autoFocus={!selectionMode}
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder={tr("components.copilot.history.searchPlaceholder")}
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none dark:text-white placeholder:text-stone-400"
                    />
                    {historySearch && (
                      <button onClick={() => setHistorySearch("")} className="text-stone-400 hover:text-stone-600 dark:hover:text-white">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {/* Bouton Sélectionner / Terminer */}
                  {historyItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        selectionMode
                          ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300"
                          : "border-black/[0.06] text-stone-500 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-stone-400 dark:hover:bg-violet-500/10"
                      }`}
                    >
                      {selectionMode ? tr("components.copilot.history.done") : tr("components.copilot.history.select")}
                    </button>
                  )}
                </div>

                {/* Ligne actions contextuelles */}
                {historyItems.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {selectionMode ? (
                      /* Mode sélection : tout sélect / désélect + confirmation suppression */
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const visible = [...historyItems].reverse();
                            const allSelected = visible.every((it) => selectedIds.has(it.id));
                            if (allSelected) setSelectedIds(new Set());
                            else setSelectedIds(new Set(visible.map((it) => it.id)));
                          }}
                          className="text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                        >
                          {[...historyItems].every((it) => selectedIds.has(it.id)) ? tr("components.copilot.history.deselectAll") : tr("components.copilot.history.selectAll")}
                        </button>
                        {selectedIds.size > 0 && (
                          <>
                            <span className="text-stone-300 dark:text-stone-600">·</span>
                            <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                              {tr("components.copilot.history.selected", { count: selectedIds.size })}
                            </span>
                          </>
                        )}
                      </>
                    ) : clearConfirm ? (
                      <div className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-500/20 dark:bg-red-500/10">
                        <p className="flex-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{tr("components.copilot.history.clearConfirm")}</p>
                        <button onClick={clearHistory} className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 transition">{tr("common.confirm")}</button>
                        <button onClick={() => setClearConfirm(false)} className="rounded-md px-2 py-1 text-[11px] font-bold text-stone-500 hover:bg-stone-100 dark:hover:bg-white/10 transition">{tr("common.cancel")}</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setClearConfirm(true)}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-400 hover:bg-red-50 hover:text-red-600 transition dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Trash2 size={11} /> {tr("components.copilot.history.clearAll")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Liste */}
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {historyLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-stone-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
                    <p className="text-xs">{tr("common.loading")}</p>
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-stone-400">
                    <Clock3 size={28} className="opacity-30" />
                    <p className="text-xs font-semibold">{tr("components.copilot.history.empty")}</p>
                    <p className="text-[11px] text-stone-300">{tr("components.copilot.history.emptyHint")}</p>
                  </div>
                ) : (() => {
                  const q = historySearch.toLowerCase();
                  const filtered = q
                    ? [...historyItems].reverse().filter((it) =>
                        it.prompt.toLowerCase().includes(q) || it.response.toLowerCase().includes(q)
                      )
                    : [...historyItems].reverse();

                  if (filtered.length === 0) return (
                    <p className="py-8 text-center text-xs text-stone-400">{tr("components.copilot.history.noResult", { query: historySearch })}</p>
                  );

                  const groups = q ? [{ label: tr("components.copilot.history.results", { count: filtered.length }), items: filtered }] : groupByDate(filtered, tr);

                  return (
                    <div className="space-y-5">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                            {group.label}
                          </p>
                          <div className="space-y-1.5">
                            {group.items.map((item) => {
                              const intentLabel = tr(INTENT_LABELS[item.intent] ?? "components.copilot.intents.question", { defaultValue: item.intent });
                              const intentCls = INTENT_COLORS[item.intent] ?? INTENT_COLORS.question;
                              const isSelected = selectedIds.has(item.id);
                              return (
                                <div
                                  key={item.id}
                                  className={`group relative flex items-stretch gap-0 rounded-xl border shadow-sm transition ${
                                    isSelected
                                      ? "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                                      : "border-black/[0.05] bg-white dark:border-white/10 dark:bg-white/[0.04]"
                                  } ${selectionMode ? "cursor-pointer" : ""}`}
                                  onClick={() => selectionMode ? toggleSelection(item.id) : openHistoryItem(item)}
                                >
                                  {/* Checkbox (mode sélection) */}
                                  {selectionMode && (
                                    <div className="flex shrink-0 items-center pl-3 pr-1">
                                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition ${
                                        isSelected
                                          ? "border-violet-500 bg-violet-500"
                                          : "border-stone-300 dark:border-stone-600"
                                      }`}>
                                        {isSelected && <Check size={9} className="text-white" strokeWidth={3} />}
                                      </div>
                                    </div>
                                  )}

                                  {/* Contenu de la carte */}
                                  <div className={`min-w-0 flex-1 px-3.5 py-3 ${selectionMode ? "pl-2" : ""}`}>
                                    {/* Ligne supérieure : intent + heure + module + corbeille */}
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
                                      {/* Corbeille unitaire (hors mode sélection) */}
                                      {!selectionMode && (
                                        <button
                                          onClick={(e) => deleteInteraction(item.id, e)}
                                          title={tr("components.copilot.history.deleteOne")}
                                          className="ml-1 grid h-5 w-5 place-items-center rounded-md text-stone-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                    {/* Prompt */}
                                    <p className={`mt-1.5 line-clamp-2 text-xs font-semibold leading-snug transition ${
                                      isSelected ? "text-violet-700 dark:text-violet-300" : "text-[#17211f] dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300"
                                    }`}>
                                      {item.prompt}
                                    </p>
                                    {/* Réponse preview */}
                                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-400">
                                      {item.response.replace(/[#*_`]/g, "").slice(0, 140)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Barre d'action sélection (sticky bas) */}
              {selectionMode && selectedIds.size > 0 && (
                <div className="shrink-0 border-t border-black/[0.05] bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#1e2229]">
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    <Trash2 size={14} />
                    {tr("components.copilot.history.deleteSelected", { count: selectedIds.size })}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Messages épinglés (#5) ───────────────────────────────────── */}
          {showPinned && pinnedMsgs.length > 0 && (
            <div className="max-h-52 shrink-0 overflow-y-auto border-b border-black/[0.05] bg-amber-50/50 p-3 dark:border-white/10 dark:bg-amber-500/5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-600">{tr("components.copilot.pinned.title")}</p>
              <div className="space-y-1.5">
                {pinnedMsgs.map((m) => (
                  <div key={m.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 dark:border-amber-500/20 dark:bg-white/5">
                    <p className="text-xs font-semibold text-[#17211f] dark:text-white line-clamp-3">{m.text.slice(0, 200)}{m.text.length > 200 ? "…" : ""}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={() => setReportMsg(m)} className="text-[10px] text-violet-500 hover:underline">{tr("components.copilot.actions.viewReport")}</button>
                      <button onClick={() => togglePin(m.id)} className="text-[10px] text-stone-400 hover:underline">{tr("components.copilot.actions.unpin")}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Compositeur de tâche inline ──────────────────────────────── */}
          {!showHistory && taskDraft && (
            <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f8fb] dark:bg-[#171a21]">
              {/* Header */}
              <div className="shrink-0 flex items-center gap-2.5 border-b border-black/[0.05] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1e2229]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                  <ListTodo size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-[#17211f] dark:text-white">{tr("components.copilot.task.title")}</p>
                  <p className="text-[10px] text-stone-400">{tr("components.copilot.task.prefilled")}</p>
                </div>
                <button onClick={() => setTaskDraft(null)} className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition dark:hover:bg-white/10" title={tr("common.close")}>
                  <X size={14} />
                </button>
              </div>

              {taskCreated ? (
                /* ── État succès ── */
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-black text-[#17211f] dark:text-white">{tr("components.copilot.task.created")}</p>
                    <p className="mt-1 max-w-[220px] text-sm text-stone-500 dark:text-stone-400 line-clamp-2">
                      « {taskCreated.title} »
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigate("/work"); setOpen(false); setTaskDraft(null); }}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                    >
                      <ListTodo size={14} /> {tr("components.copilot.task.viewTask")}
                    </button>
                    <button
                      onClick={() => setTaskDraft(null)}
                      className="rounded-xl border border-black/[0.06] px-4 py-2.5 text-sm font-bold text-[#17211f] transition hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    >
                      {tr("common.close")}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Formulaire ── */
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

                  {/* Titre */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1.5">{tr("components.copilot.task.titleLabel")}</label>
                    <input
                      autoFocus
                      value={taskDraft.title}
                      onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
                      placeholder={tr("components.copilot.task.titlePlaceholder")}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none focus:border-emerald-400 transition dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>

                  {/* Priorité */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{tr("components.copilot.task.priority")}</span>
                      {taskDraft.priority === taskDraft.autoDetectedPriority && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                          <LimuleIcon size={9} /> {tr("components.copilot.task.detectedByAi")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {(["low", "normal", "high"] as const).map((p) => {
                        const labels = {
                          low: tr("components.copilot.task.priorities.low"),
                          normal: tr("components.copilot.task.priorities.normal"),
                          high: tr("components.copilot.task.priorities.high"),
                        };
                        const activeCls = {
                          low: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
                          normal: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
                          high: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
                        };
                        const inactiveCls = "border-black/[0.06] bg-white text-stone-500 hover:bg-stone-50 dark:border-white/10 dark:bg-white/5 dark:text-stone-400";
                        const isActive = taskDraft.priority === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setTaskDraft({ ...taskDraft, priority: p })}
                            className={`flex-1 rounded-xl border py-2.5 text-[11px] font-bold transition ${isActive ? activeCls[p] : inactiveCls}`}
                          >
                            {labels[p]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Responsable */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{tr("components.copilot.task.assignee")}</label>
                      {!taskEmployeesLoaded && (
                        <span className="flex items-center gap-1 text-[10px] text-stone-400">
                          <div className="h-2.5 w-2.5 animate-spin rounded-full border border-stone-300 border-t-stone-500" />
                          {tr("common.loading")}
                        </span>
                      )}
                      {taskEmployeesLoaded && taskEmployees.length === 0 && (
                        <span className="text-[10px] text-amber-500">{tr("components.copilot.task.noEmployee")}</span>
                      )}
                    </div>
                    <div className="relative">
                      <User2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                      <select
                        value={taskDraft.assignee_name}
                        onChange={(e) => setTaskDraft({ ...taskDraft, assignee_name: e.target.value })}
                        disabled={!taskEmployeesLoaded}
                        className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white py-2.5 pl-8 pr-3 text-sm text-[#17211f] outline-none focus:border-emerald-400 transition disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      >
                        <option value="">{tr("components.copilot.task.unassigned")}</option>
                        {taskEmployees.map((emp) => (
                          <option key={emp.name} value={emp.name}>{emp.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Date + Heure d'échéance */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1.5">{tr("components.copilot.task.dueDate")}</label>
                      <div className="relative">
                        <CalendarDays size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        <input
                          type="date"
                          value={taskDraft.due_date}
                          onChange={(e) => setTaskDraft({ ...taskDraft, due_date: e.target.value })}
                          className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-8 pr-2 text-sm text-[#17211f] outline-none focus:border-emerald-400 transition dark:border-white/10 dark:bg-white/5 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1.5">{tr("components.copilot.task.time")}</label>
                      <div className="relative">
                        <Clock3 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        <input
                          type="time"
                          value={taskDraft.due_time}
                          onChange={(e) => setTaskDraft({ ...taskDraft, due_time: e.target.value })}
                          className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-8 pr-2 text-sm text-[#17211f] outline-none focus:border-emerald-400 transition dark:border-white/10 dark:bg-white/5 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Description (collapsible — lecture + édition) */}
                  <div>
                    {/* En-tête */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <button
                        type="button"
                        onClick={() => { setTaskDescOpen((v) => !v); if (taskDescOpen) setTaskDescEditing(false); }}
                        className="flex flex-1 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-600 transition"
                      >
                        <span className="flex-1 text-left">{tr("components.copilot.task.description")}</span>
                        <ChevronDown size={11} className={`transition-transform ${taskDescOpen ? "" : "-rotate-180"}`} />
                      </button>
                      {taskDescOpen && (
                        taskDescEditing ? (
                          <button
                            type="button"
                            onClick={() => setTaskDescEditing(false)}
                            className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100 transition dark:bg-emerald-500/10 dark:text-emerald-400"
                          >
                            {tr("components.copilot.task.done")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setTaskDescEditing(true)}
                            className="shrink-0 rounded-md border border-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-stone-400 hover:border-stone-300 hover:text-stone-600 transition dark:border-white/10 dark:hover:text-white"
                          >
                            {tr("common.edit")}
                          </button>
                        )
                      )}
                    </div>

                    {/* Corps */}
                    {taskDescOpen && (
                      taskDescEditing ? (
                        <textarea
                          autoFocus
                          value={taskDraft.description}
                          onChange={(e) => setTaskDraft({ ...taskDraft, description: e.target.value })}
                          rows={5}
                          placeholder={tr("components.copilot.task.descriptionPlaceholder")}
                          className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-xs text-[#17211f] outline-none transition resize-none dark:border-emerald-500/40 dark:bg-white/5 dark:text-white"
                        />
                      ) : (
                        /* Vue lecture */
                        <div className="rounded-xl border border-black/[0.06] bg-stone-50 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                          {taskDraft.description ? (
                            <div className="space-y-1.5">
                              {taskDraft.description.split("\n").map((line, i) =>
                                line.startsWith("•") ? (
                                  <div key={i} className="flex items-start gap-2">
                                    <span className="mt-0.5 shrink-0 text-[9px] text-emerald-500">▸</span>
                                    <span className="text-xs leading-snug text-[#17211f] dark:text-stone-200">{line.slice(1).trim()}</span>
                                  </div>
                                ) : line.trim() ? (
                                  <p key={i} className="text-xs leading-snug text-[#17211f] dark:text-stone-200">{line}</p>
                                ) : null
                              )}
                            </div>
                          ) : (
                            <p className="text-xs italic text-stone-400">{tr("components.copilot.task.noDescription")}</p>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  {/* Preuve requise */}
                  <div className="flex items-center justify-between rounded-xl border border-black/[0.05] bg-white px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div>
                      <p className="text-xs font-bold text-[#17211f] dark:text-white">{tr("components.copilot.task.proofRequired")}</p>
                      <p className="text-[10px] text-stone-400">{tr("components.copilot.task.proofHint")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaskDraft({ ...taskDraft, proof_required: !taskDraft.proof_required })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${taskDraft.proof_required ? "bg-emerald-500" : "bg-stone-200 dark:bg-white/20"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${taskDraft.proof_required ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Bouton Créer */}
              {!taskCreated && (
                <div className="shrink-0 border-t border-black/[0.05] px-4 py-3 dark:border-white/10">
                  <button
                    type="button"
                    disabled={!taskDraft.title.trim() || taskSaving}
                    onClick={saveTask}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {taskSaving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    {taskSaving ? tr("components.copilot.task.creating") : tr("components.copilot.task.create")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Messages (masqués quand historique ou compositeur actif) ─── */}
          {!showHistory && !taskDraft && (
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
                            {tr(INTENT_LABELS[msg.intent] ?? "components.copilot.intents.question", { defaultValue: msg.intent })}
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

                    {/* ── Barre d'actions — toujours visible ───────────────── */}
                    {msg.author === "ai" && !msg.isStreaming && msg.id !== "intro" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-0.5 rounded-xl border border-black/[0.05] bg-white px-2 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                        {/* Copier */}
                        <button onClick={() => copyMsg(msg)} title={tr("common.copy")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition dark:hover:bg-white/10 dark:hover:text-white">
                          {copiedId === msg.id ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                          {copiedId === msg.id ? tr("components.copilot.actions.copied") : tr("common.copy")}
                        </button>
                        {/* Épingler */}
                        <button onClick={() => togglePin(msg.id)} title={pinnedIds.has(msg.id) ? tr("components.copilot.actions.unpin") : tr("components.copilot.actions.pin")} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${pinnedIds.has(msg.id) ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10" : "text-stone-500 hover:bg-stone-100 hover:text-amber-600 dark:hover:bg-white/10"}`}>
                          {pinnedIds.has(msg.id) ? <PinOff size={10} /> : <Pin size={10} />}
                          {pinnedIds.has(msg.id) ? tr("components.copilot.actions.unpin") : tr("components.copilot.actions.pin")}
                        </button>
                        {/* Rapport (longues réponses) */}
                        {msg.text.length > 350 && (
                          <button onClick={() => setReportMsg(msg)} title={tr("components.copilot.actions.viewFullscreen")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-violet-50 hover:text-violet-700 transition dark:hover:bg-violet-500/10">
                            <ZoomIn size={10} /> {tr("components.copilot.actions.report")}
                          </button>
                        )}
                        {/* Séparateur */}
                        <span className="mx-0.5 h-3 w-px bg-stone-200 dark:bg-white/10" />
                        {/* Tâche */}
                        <button onClick={() => actionTask(msg)} title={tr("components.copilot.task.title")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-emerald-50 hover:text-emerald-700 transition dark:hover:bg-emerald-500/10">
                          <CheckCircle2 size={10} /> {tr("components.copilot.actions.task")}
                        </button>
                        {/* Email */}
                        <button onClick={() => actionAssistant(msg)} title={tr("components.copilot.actions.writeEmail")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-blue-50 hover:text-blue-700 transition dark:hover:bg-blue-500/10">
                          <Wand2 size={10} /> Email
                        </button>
                        {/* Export */}
                        <button onClick={() => actionExport(msg)} title={tr("common.export")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition dark:hover:bg-white/10">
                          <Download size={10} /> {tr("common.export")}
                        </button>
                        {/* Branchement */}
                        <button onClick={() => reprendreIci(msg)} title={tr("components.copilot.branch.title")} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${branchAnchorId === msg.id ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "text-stone-500 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10"}`}>
                          <GitBranch size={10} /> {tr("components.copilot.branch.resumeHere")}
                        </button>
                        {/* Rating 👍 / 👎 */}
                        {msg.interactionId && (
                          <>
                            <span className="mx-0.5 h-3 w-px bg-stone-200 dark:bg-white/10" />
                            <button onClick={() => rate(msg.interactionId!, 5)} title={tr("components.copilot.rating.useful")} className="rounded-lg px-1.5 py-1 text-[12px] text-stone-400 hover:bg-emerald-50 hover:text-emerald-600 transition dark:hover:bg-emerald-500/10">👍</button>
                            <button onClick={() => rate(msg.interactionId!, 1)} title={tr("components.copilot.rating.notUseful")} className="rounded-lg px-1.5 py-1 text-[12px] text-stone-400 hover:bg-red-50 hover:text-red-500 transition dark:hover:bg-red-500/10">👎</button>
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
                  <p className="text-xs font-semibold text-[#17211f] dark:text-white">{tr("components.copilot.streaming.analyzing")}</p>
                  <p className="text-[10px] text-stone-400">{isHeavy ? tr("components.copilot.streaming.deep") : tr("components.copilot.streaming.crossingData")}</p>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          )} {/* fin !showHistory && !taskDraft */}

          {/* ── Suggestions contextuelles (#3) — masquées pendant historique / compositeur */}
          {!showHistory && !taskDraft && (
          <div className="shrink-0 flex flex-wrap gap-1 border-t border-black/[0.05] bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#1e2229]">
            {suggestions.slice(0, fullscreen ? 6 : 3).map((s) => (
              <button key={s.tk} onClick={() => send(s.label)} disabled={isStreaming} className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10">
                <s.icon size={11} className="text-violet-500" />
                {s.label}
              </button>
            ))}
          </div>
          )} {/* fin !showHistory && !taskDraft suggestions */}

          {/* ── Indicateur branchement actif ────────────────────────────── */}
          {branchAnchorId && !taskDraft && (
            <div className="shrink-0 flex items-center gap-2 border-t border-indigo-100 bg-indigo-50 px-3 py-1.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <GitBranch size={11} className="shrink-0 text-indigo-500" />
              <p className="flex-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                {tr("components.copilot.branch.banner")}
              </p>
              <button onClick={() => setBranchAnchorId(null)} className="rounded p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-500/20" title={tr("common.cancel")}>
                <X size={12} />
              </button>
            </div>
          )}

          {/* ── Saisie (toujours visible) ─────────────────────────────────── */}
          <div className="shrink-0 border-t border-black/[0.05] p-3 dark:border-white/10">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm focus-within:border-violet-400 transition dark:border-white/10 dark:bg-white/5">
              <LimuleIcon size={17} className="opacity-50 shrink-0" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={tr("components.copilot.inputPlaceholder")}
                disabled={isStreaming}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white placeholder:text-stone-400 disabled:opacity-50"
              />
              {isStreaming ? (
                <button onClick={() => { streamAbortRef.current?.(); setIsStreaming(false); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition" title={tr("components.copilot.stop")}>
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
