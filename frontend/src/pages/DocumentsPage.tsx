import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useMemo, FormEvent } from "react";
import {
  ArrowRight, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp,
  Download, FileImage, FilePieChart, FileSpreadsheet, FileText, FileUp,
  FileX, Filter, FolderArchive, Landmark, Loader2, MessageSquare,
  RefreshCcw, Search, Send, ShieldCheck, Upload, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { useToast } from "../components/ToastProvider";
import type { CompanyDocument } from "../types/domain";
import { shortDate } from "../utils/format";
import { LimuleIcon } from "../components/LimuleAvatar";

// ── Helpers ────────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  contrat: "Contrat",
  facture: "Facture",
  releve_bancaire: "Relevé bancaire",
  bulletin_paie: "Bulletin de paie",
  declaration_fiscale: "Déclaration fiscale",
  rapport: "Rapport",
  identite: "Identité",
  diplome: "Diplôme",
  autre: "Autre",
};

function docTypeTone(type: string): string {
  const tones: Record<string, string> = {
    contrat: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    facture: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    releve_bancaire: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    bulletin_paie: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
    declaration_fiscale: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    rapport: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
    identite: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
    diplome: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  };
  return tones[type] ?? "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-white/60";
}

function FileIcon({ filename, mimeType, parseMethod }: { filename: string; mimeType?: string; parseMethod?: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || mimeType?.includes("pdf") || parseMethod === "pdfplumber";
  const isExcel = ["xlsx", "xls", "ods", "csv"].includes(ext) || parseMethod === "openpyxl" || parseMethod === "csv";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp"].includes(ext) || mimeType?.startsWith("image/") || parseMethod === "ocr";
  const isWord = ["docx", "doc"].includes(ext) || parseMethod === "docx";
  const isCsv = ext === "csv" || parseMethod === "csv";

  if (isPdf)    return <FilePieChart   size={18} className="text-red-500 shrink-0" />;
  if (isCsv)    return <FileSpreadsheet size={18} className="text-blue-500 shrink-0" />;
  if (isExcel)  return <FileSpreadsheet size={18} className="text-green-600 shrink-0" />;
  if (isImage)  return <FileImage       size={18} className="text-purple-500 shrink-0" />;
  if (isWord)   return <FileText        size={18} className="text-blue-600 shrink-0" />;
  return          <FileText             size={18} className="text-stone-500 shrink-0" />;
}

function parseExtracted(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return null; }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────

function UploadDropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all ${
        dragging
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-black/[0.12] bg-white hover:border-emerald-400 hover:bg-emerald-50/40 dark:bg-[#1e2229] dark:border-white/[0.12] dark:hover:border-emerald-500/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.csv,.xlsx,.xls,.ods,.txt,.png,.jpg,.jpeg,.gif,.webp,.heic,.docx,.doc,.bmp"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600">
        <Upload size={26} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-[#17211f] dark:text-white">
          Glissez un fichier ou <span className="text-emerald-600">parcourez</span>
        </p>
        <p className="mt-1 text-xs text-[#717182]">
          Contrat · Facture · Relevé bancaire · Fiche de paie · Rapport · Identité…
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {["PDF", "CSV", "XLSX", "PNG/JPG (OCR)", "DOCX", "TXT"].map((fmt) => (
            <span key={fmt} className="rounded-md bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-[#717182]">{fmt}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Document Chat Panel ────────────────────────────────────────────────────────

function DocChatPanel({ doc, onClose }: { doc: CompanyDocument; onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    if (!input.trim() || streaming) return;
    const prompt = input.trim();
    setInput("");
    const history = [...messages, { role: "user" as const, content: prompt }];
    setMessages(history);
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    await api.limuleDocumentChatStream(
      doc.id,
      { prompt, conversation_history: messages },
      (partial) => setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: partial };
        return copy;
      }),
      (final) => {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: final };
          return copy;
        });
        setStreaming(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      () => { setStreaming(false); },
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[480px] rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <LimuleIcon size={16} />
          <span className="text-sm font-semibold text-[#17211f] dark:text-white">Chat Limule · {doc.title}</span>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/[0.05] text-[#717182]"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-center text-[#aaa] mt-4">
            Posez une question sur ce document à Limule…
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "bg-emerald-600 text-white"
                : "bg-[#f7f8fa] dark:bg-[#14181f] text-[#17211f] dark:text-white"
            }`}>
              {m.content || (streaming && i === messages.length - 1 ? (
                <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" />…</span>
              ) : "—")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <input
          className="flex-1 rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white"
          placeholder="Question sur ce document…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button onClick={send} disabled={!input.trim() || streaming} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0">
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Extracted Data Viewer ─────────────────────────────────────────────────────

function ExtractedDataViewer({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {entries.map(([key, val]) => {
        const displayKey = key.replace(/_/g, " ");
        const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
        if (displayVal.length > 200) return null; // skip very long values
        return (
          <div key={key} className="rounded-lg bg-[#f7f8fa] dark:bg-[#14181f] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#aaa]">{displayKey}</p>
            <p className="mt-0.5 text-xs font-medium text-[#17211f] dark:text-white truncate" title={displayVal}>{displayVal}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onAnalyze,
  onTerasAnalyze,
  onDownload,
  analyzing,
}: {
  doc: CompanyDocument;
  onAnalyze: () => void;
  onTerasAnalyze: () => void;
  onDownload: () => void;
  analyzing: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const extracted = parseExtracted(doc.extracted_data);
  const isBankStatement = doc.document_type === "releve_bancaire";

  return (
    <article className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] overflow-hidden transition hover:shadow-md">
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f7f8fa] dark:bg-[#14181f]">
          <FileIcon filename={doc.filename} mimeType={doc.mime_type} parseMethod={doc.parse_method} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-[#17211f] dark:text-white truncate">{doc.title}</p>
          <p className="text-xs text-[#717182] truncate">{doc.filename} · {formatSize(doc.size_bytes)} · {shortDate(doc.created_at)}</p>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${docTypeTone(doc.document_type)}`}>
          {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
        </span>
        {doc.confidence > 0 && (
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
            doc.confidence >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            : doc.confidence >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            : "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"
          }`}>
            {doc.confidence}% confiance
          </span>
        )}
        {doc.parse_method && (
          <span className="rounded-full bg-blue-100 dark:bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
            {doc.parse_method}
          </span>
        )}
        {doc.text_length != null && doc.text_length > 0 && (
          <span className="rounded-full bg-slate-100 dark:bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-medium text-[#717182]">
            {doc.text_length.toLocaleString()} car.
          </span>
        )}
      </div>

      {/* AI Summary (always visible) */}
      {doc.ai_summary && (
        <div className="px-4 pb-3">
          <p className={`text-xs text-[#717182] leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
            {doc.ai_summary}
          </p>
        </div>
      )}

      {/* Tags */}
      {doc.ai_tags && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {doc.ai_tags.split(",").slice(0, 6).map((tag) => tag.trim()).filter(Boolean).map((tag) => (
            <span key={tag} className="rounded-md bg-[#f0fdf4] dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-4 space-y-4">
          {/* Extracted data */}
          {extracted && Object.keys(extracted).length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#717182] mb-2 flex items-center gap-1.5">
                <BrainCircuit size={12} /> Données extraites
              </p>
              <ExtractedDataViewer data={extracted} />
            </div>
          )}

          {/* Chat panel */}
          {showChat && <DocChatPanel doc={doc} onClose={() => setShowChat(false)} />}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-3 bg-[#fafafa] dark:bg-[#16191f]">
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-[#f5f5fa] dark:hover:bg-white/[0.06] disabled:opacity-50 transition"
        >
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <LimuleIcon size={12} />}
          Re-analyser
        </button>
        <button
          onClick={onTerasAnalyze}
          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-[#f5f5fa] dark:hover:bg-white/[0.06] transition"
        >
          <ShieldCheck size={12} className="text-emerald-600" />
          TERAS
        </button>
        <button
          onClick={() => { setExpanded(true); setShowChat(true); }}
          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-[#f5f5fa] dark:hover:bg-white/[0.06] transition"
        >
          <MessageSquare size={12} className="text-blue-500" />
          Chat
        </button>
        {isBankStatement && (
          <button
            onClick={() => navigate("/transactions")}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-600/40 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
          >
            <Landmark size={12} />
            Import transactions
            <ArrowRight size={11} />
          </button>
        )}
        <button
          onClick={onDownload}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#17211f] dark:bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition"
        >
          <Download size={12} />
          Télécharger
        </button>
      </div>
    </article>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DOC_TYPE_FILTERS = [
  { value: "", label: "Tous les types" },
  { value: "releve_bancaire", label: "Relevés bancaires" },
  { value: "facture", label: "Factures" },
  { value: "contrat", label: "Contrats" },
  { value: "bulletin_paie", label: "Bulletins de paie" },
  { value: "declaration_fiscale", label: "Déclarations fiscales" },
  { value: "rapport", label: "Rapports" },
  { value: "identite", label: "Identités" },
  { value: "diplome", label: "Diplômes" },
  { value: "autre", label: "Autres" },
];

export function DocumentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  // Queries
  const documents = useQuery({ queryKey: ["documents"], queryFn: api.documents });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });

  // Upload mutation
  const upload = useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: () => {
      setTitle(""); setEmployeeId(""); setPendingFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  // Analyze mutations
  const analyze = useMutation({
    mutationFn: async (docId: number) => {
      setAnalyzingId(docId);
      return api.limuleAnalyzeDocument(docId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setAnalyzingId(null);
    },
    onError: () => setAnalyzingId(null),
  });
  const terasAnalyze = useMutation({
    mutationFn: api.analyzeTerasDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
      queryClient.invalidateQueries({ queryKey: ["terasRecommendations"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
    },
  });

  // File drop / selection
  function handleFile(file: File) {
    setPendingFile(file);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pendingFile) return;
    upload.mutate({ title: title || pendingFile.name, file: pendingFile, employee_id: employeeId ? Number(employeeId) : undefined });
  }

  async function download(documentId: number, filename: string) {
    try {
      const blob = await api.downloadDocument(documentId);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(`Impossible de télécharger le fichier : ${(err as Error).message}`);
    }
  }

  // Filtered docs
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (documents.data ?? []).filter((d) => {
      const matchSearch = !q || d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q) || (d.ai_tags ?? "").toLowerCase().includes(q);
      const matchType = !typeFilter || d.document_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [documents.data, search, typeFilter]);

  // Stats
  const total = documents.data?.length ?? 0;
  const analyzed = documents.data?.filter((d) => d.confidence > 0).length ?? 0;
  const bankDocs = documents.data?.filter((d) => d.document_type === "releve_bancaire").length ?? 0;
  const avgConfidence = total > 0
    ? Math.round((documents.data ?? []).reduce((s, d) => s + d.confidence, 0) / total)
    : 0;

  const inputCls = "w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm text-[#17211f] placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-white/[0.08] dark:bg-[#14181f] dark:text-white dark:placeholder:text-white/30";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-600">Documents entreprise</p>
          <h1 className="text-2xl font-black text-[#17211f] dark:text-white flex items-center gap-2">
            <FolderArchive size={24} className="text-emerald-600" />
            Bibliothèque intelligente
          </h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            Analysez tous vos documents avec Limule — PDF, Excel, CSV, Word, Images (OCR)
          </p>
        </div>
        <button
          onClick={() => navigate("/transactions")}
          className="flex items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-600/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
        >
          <Landmark size={16} />
          Voir les transactions
          <ArrowRight size={14} />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total documents", value: total, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
          { label: "Analysés par IA", value: analyzed, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
          { label: "Relevés bancaires", value: bankDocs, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
          { label: "Confiance moy.", value: `${avgConfidence}%`, color: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4 flex gap-3 items-center">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-black ${kpi.color}`}>
              {typeof kpi.value === "number" ? kpi.value : kpi.value}
            </span>
            <div>
              <p className="text-xs text-[#717182]">{kpi.label}</p>
              <p className="text-lg font-bold text-[#17211f] dark:text-white">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid: upload + library */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
        {/* Left: Upload panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-5">
            <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white flex items-center gap-2">
              <FileUp size={16} className="text-emerald-600" />
              Ajouter un document
            </h2>
            <form onSubmit={submit} className="space-y-3">
              {/* Drop zone */}
              {!pendingFile ? (
                <UploadDropZone onFile={handleFile} />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3">
                  <FileIcon filename={pendingFile.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{pendingFile.name}</p>
                    <p className="text-xs text-[#717182]">{formatSize(pendingFile.size)}</p>
                  </div>
                  <button type="button" onClick={() => setPendingFile(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05]">
                    <X size={14} />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#717182] mb-1">Titre</label>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du document" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#717182] mb-1">Lier à un employé (optionnel)</label>
                <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Document entreprise</option>
                  {employees.data?.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={!pendingFile || upload.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300 dark:disabled:bg-stone-700 hover:bg-emerald-700 transition"
              >
                {upload.isPending ? (
                  <><Loader2 size={15} className="animate-spin" /> Analyse IA en cours…</>
                ) : (
                  <><FileUp size={15} /> Uploader et analyser</>
                )}
              </button>
              {upload.isPending && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#717182]">
                    <span>Extraction et classification Limule…</span>
                    <LimuleIcon size={13} className="animate-pulse" />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500" />
                  </div>
                </div>
              )}
              {upload.isSuccess && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 size={15} /> Document classé et analysé
                </p>
              )}
              {upload.isError && (
                <p className="text-sm text-red-600">{(upload.error as Error).message}</p>
              )}
            </form>
          </div>

          {/* Format guide */}
          <div className="rounded-xl border border-black/[0.06] bg-[#fafbff] dark:bg-[#1e2229] dark:border-white/[0.06] p-4 space-y-2">
            <p className="text-xs font-bold text-[#717182] uppercase tracking-wide">Formats pris en charge</p>
            {[
              { icon: <FilePieChart size={14} className="text-red-500" />, label: "PDF", desc: "Extraction pdfplumber" },
              { icon: <FileSpreadsheet size={14} className="text-green-600" />, label: "Excel / CSV", desc: "openpyxl + csv" },
              { icon: <FileImage size={14} className="text-purple-500" />, label: "Images (OCR)", desc: "PNG, JPG, HEIC…" },
              { icon: <FileText size={14} className="text-blue-600" />, label: "Word", desc: "DOCX, DOC" },
              { icon: <FileText size={14} className="text-stone-500" />, label: "Texte brut", desc: "TXT, CSV" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5">
                {f.icon}
                <div>
                  <span className="text-xs font-semibold text-[#17211f] dark:text-white">{f.label}</span>
                  <span className="text-[10px] text-[#aaa] ml-1.5">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Document library */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-[180px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]" />
              <input
                className="w-full rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] dark:text-white py-2 pl-9 pr-3 text-sm placeholder:text-[#aaa] focus:border-emerald-500 focus:outline-none"
                placeholder="Rechercher titre, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-[#aaa]" />
              <select
                className="rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] dark:text-white/70 px-3 py-2 text-sm text-[#717182] focus:border-emerald-500 focus:outline-none"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                {DOC_TYPE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            {(search || typeFilter) && (
              <button
                onClick={() => { setSearch(""); setTypeFilter(""); }}
                className="flex items-center gap-1 rounded-lg border border-black/[0.08] px-3 py-2 text-xs font-semibold text-[#717182] hover:bg-black/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
              >
                <X size={11} /> Effacer
              </button>
            )}
            <span className="ml-auto text-xs text-[#aaa]">{filtered.length} doc{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Document cards */}
          {documents.isFetching && !documents.data ? (
            <div className="flex items-center gap-2 rounded-xl bg-stone-50 dark:bg-[#1e2229] p-6 text-sm text-[#717182]">
              <RefreshCcw className="animate-spin" size={16} /> Chargement des documents…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[#717182] rounded-xl border-2 border-dashed border-black/[0.08] dark:border-white/[0.08]">
              <FileX size={40} className="mb-3 text-[#ccc]" />
              <p className="text-sm font-semibold text-[#17211f] dark:text-white">Aucun document</p>
              <p className="text-xs mt-1 max-w-xs">
                {search || typeFilter ? "Aucun document ne correspond à vos filtres." : "Ajoutez votre premier document en le glissant dans la zone d'upload."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onAnalyze={() => analyze.mutate(doc.id)}
                  onTerasAnalyze={() => terasAnalyze.mutate(doc.id)}
                  onDownload={() => download(doc.id, doc.filename)}
                  analyzing={analyzingId === doc.id && analyze.isPending}
                />
              ))}
              {documents.isFetching && (
                <div className="flex items-center gap-2 rounded-lg p-3 text-xs text-[#717182]">
                  <RefreshCcw size={13} className="animate-spin" /> Actualisation…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
