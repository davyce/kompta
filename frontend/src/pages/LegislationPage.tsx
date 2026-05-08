import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  BookOpen, CheckCircle2, FileSpreadsheet, FileText, FileType2,
  Loader2, Plus, RefreshCcw, Tag, Trash2, Upload, X,
} from "lucide-react";

import { Panel } from "../components/Panel";
import { LimuleIcon } from "../components/LimuleAvatar";
import { api, type LegislationDocumentDto } from "../services/api";
import { shortDate } from "../utils/format";

/* ── Catégories ─────────────────────────────────────────── */
const CATEGORIES = [
  { key: "fiscal",   label: "Fiscalité & Impôts",      color: "text-red-600",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/30" },
  { key: "social",   label: "Droit social & CNPS",     color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-500/10",  border: "border-blue-200 dark:border-blue-500/30" },
  { key: "commerce", label: "Droit commercial",        color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-500/10", border: "border-violet-200 dark:border-violet-500/30" },
  { key: "finance",  label: "Finances & Banque",       color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30" },
  { key: "general",  label: "Général",                 color: "text-stone-600",  bg: "bg-stone-50 dark:bg-stone-500/10", border: "border-stone-200 dark:border-stone-500/30" },
];

function catInfo(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[4];
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.includes("pdf")) return <FileText size={16} className="text-red-500" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet size={16} className="text-green-600" />;
  if (mime.includes("word") || mime.includes("document"))
    return <FileType2 size={16} className="text-blue-500" />;
  return <FileText size={16} className="text-stone-500" />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/* ── Modal aperçu analyse ─────────────────────────────── */
function SummaryModal({ doc, onClose }: { doc: LegislationDocumentDto; onClose: () => void }) {
  const tags: string[] = (() => {
    try { return JSON.parse(doc.ai_tags); } catch { return []; }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl ring-1 ring-black/10">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${catInfo(doc.doc_category).bg}`}>
              <BookOpen size={14} className={catInfo(doc.doc_category).color} />
            </span>
            <div>
              <p className="font-bold text-[#17211f] dark:text-white text-sm">{doc.title}</p>
              <p className="text-xs text-[#717182]">{catInfo(doc.doc_category).label} · {doc.country_scope}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                  <Tag size={10} /> {t}
                </span>
              ))}
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-[#17211f] dark:text-white whitespace-pre-wrap leading-relaxed">
            {doc.ai_summary || "Aucune analyse disponible."}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page principale ──────────────────────────────────── */
export default function LegislationPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filterCat, setFilterCat] = useState<string>("");
  const [viewDoc, setViewDoc] = useState<LegislationDocumentDto | null>(null);

  // Form upload
  const [form, setForm] = useState({
    title: "", description: "", doc_category: "fiscal", country_scope: "Congo",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const docs = useQuery({
    queryKey: ["legislationDocs", filterCat],
    queryFn: () => api.legislationDocs(filterCat || undefined),
  });
  const ctxQuery = useQuery({
    queryKey: ["legislationContext"],
    queryFn: api.legislationContext,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Aucun fichier sélectionné");
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("title", form.title || selectedFile.name);
      fd.append("description", form.description);
      fd.append("doc_category", form.doc_category);
      fd.append("country_scope", form.country_scope);
      return api.uploadLegislationDoc(fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legislationDocs"] });
      queryClient.invalidateQueries({ queryKey: ["legislationContext"] });
      setSelectedFile(null);
      setForm({ title: "", description: "", doc_category: "fiscal", country_scope: "Congo" });
    },
  });

  const analyze = useMutation({
    mutationFn: api.analyzeLegislationDoc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legislationDocs"] });
      queryClient.invalidateQueries({ queryKey: ["legislationContext"] });
    },
  });

  const del = useMutation({
    mutationFn: api.deleteLegislationDoc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legislationDocs"] });
      queryClient.invalidateQueries({ queryKey: ["legislationContext"] });
    },
  });

  const allDocs = docs.data ?? [];
  const analyzedCount = allDocs.filter((d) => d.analyzed).length;

  return (
    <div className="space-y-6">
      {viewDoc && <SummaryModal doc={viewDoc} onClose={() => setViewDoc(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[#17211f] dark:text-white">Base législative</h1>
          <p className="text-sm text-[#717182] mt-0.5">
            Documents de référence analysés par Limule — enrichissent les conseils sur toute la plateforme.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] px-4 py-2">
          <LimuleIcon size={20} />
          <span className="text-sm font-bold text-[#17211f] dark:text-white">
            {analyzedCount} doc{analyzedCount !== 1 ? "s" : ""} analysé{analyzedCount !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-[#717182]">· contexte actif pour Limule</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total documents", value: allDocs.length, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-500/10" },
          { label: "Analysés",        value: analyzedCount,  color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "En attente",      value: allDocs.length - analyzedCount, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-500/10" },
          { label: "Contexte Limule", value: ctxQuery.data?.doc_count ?? 0, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-500/10" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{k.label}</p>
            <p className={`mt-1 text-2xl font-black ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Colonne gauche : Upload ── */}
        <div className="space-y-4">
          <Panel title="Ajouter un document">
            <div className="space-y-3">
              {/* Zone de drop */}
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] bg-black/[0.01] dark:bg-white/[0.02] p-6 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
              >
                <Upload size={24} className="text-[#717182]" />
                {selectedFile
                  ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{selectedFile.name}</p>
                  : <>
                    <p className="text-sm font-semibold text-[#17211f] dark:text-white">Cliquer pour choisir</p>
                    <p className="text-xs text-[#717182]">PDF, Word, Excel, CSV, TXT — max 30 Mo</p>
                  </>
                }
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSelectedFile(f);
                    if (!form.title) setForm((p) => ({ ...p, title: f.name.replace(/\.[^/.]+$/, "") }));
                  }
                }}
              />
              {/* Champs */}
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Titre du document *"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description (optionnel)"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <select
                value={form.doc_category}
                onChange={(e) => setForm((p) => ({ ...p, doc_category: e.target.value }))}
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <input
                value={form.country_scope}
                onChange={(e) => setForm((p) => ({ ...p, country_scope: e.target.value }))}
                placeholder="Pays / portée géographique"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => upload.mutate()}
                disabled={upload.isPending || !selectedFile || !form.title.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {upload.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {upload.isPending ? "Envoi en cours…" : "Ajouter le document"}
              </button>
              {upload.isSuccess && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Document ajouté — cliquez Analyser pour l'activer.
                </p>
              )}
              {upload.isError && (
                <p className="text-xs text-red-600">{(upload.error as Error).message}</p>
              )}
            </div>
          </Panel>

          {/* Contexte actif */}
          {ctxQuery.data && ctxQuery.data.doc_count > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <LimuleIcon size={16} />
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Contexte Limule actif</p>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {ctxQuery.data.doc_count} document{ctxQuery.data.doc_count > 1 ? "s" : ""} analysé{ctxQuery.data.doc_count > 1 ? "s" : ""} enrichissent
                les conseils Limule sur toute la plateforme.
              </p>
              {ctxQuery.data.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ctxQuery.data.categories.map((c) => (
                    <span key={c} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catInfo(c).bg} ${catInfo(c).color}`}>
                      {catInfo(c).label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Colonne droite : Liste documents ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filtres catégorie */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCat("")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${!filterCat ? "bg-[#17211f] text-white border-[#17211f] dark:bg-white dark:text-[#17211f] dark:border-white" : "border-black/[0.08] dark:border-white/[0.08] text-[#717182] hover:bg-black/[0.03]"}`}
            >
              Tous ({allDocs.length})
            </button>
            {CATEGORIES.map((c) => {
              const count = allDocs.filter((d) => d.doc_category === c.key).length;
              if (count === 0) return null;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilterCat(c.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${filterCat === c.key ? `${c.bg} ${c.color} ${c.border}` : "border-black/[0.08] dark:border-white/[0.08] text-[#717182] hover:bg-black/[0.03]"}`}
                >
                  {c.label} ({count})
                </button>
              );
            })}
          </div>

          {docs.isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-[#717182]">
              <Loader2 size={18} className="animate-spin" /> Chargement…
            </div>
          )}

          {!docs.isLoading && allDocs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/[0.08] dark:border-white/[0.08] py-16">
              <BookOpen size={32} className="text-[#717182]" />
              <p className="text-sm font-semibold text-[#717182]">Aucun document législatif</p>
              <p className="text-xs text-[#aaa]">Uploadez des lois, décrets, circulaires pour que Limule les intègre.</p>
            </div>
          )}

          <div className="space-y-3">
            {allDocs.map((doc) => {
              const cat = catInfo(doc.doc_category);
              const tags: string[] = (() => { try { return JSON.parse(doc.ai_tags); } catch { return []; } })();
              return (
                <div key={doc.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cat.bg}`}>
                        <FileIcon mime={doc.mime_type} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#17211f] dark:text-white truncate">{doc.title}</p>
                        <p className="text-xs text-[#717182]">
                          {doc.filename} · {fmtSize(doc.size_bytes)} · {shortDate(doc.created_at)}
                        </p>
                        {doc.description && (
                          <p className="text-xs text-[#717182] mt-0.5 line-clamp-1">{doc.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cat.bg} ${cat.color} ${cat.border}`}>
                            {cat.label}
                          </span>
                          <span className="text-[10px] text-[#aaa]">{doc.country_scope}</span>
                          {doc.analyzed
                            ? <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"><CheckCircle2 size={10} /> Analysé</span>
                            : <span className="text-[10px] text-amber-600 font-semibold">Non analysé</span>
                          }
                        </div>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.slice(0, 5).map((t) => (
                              <span key={t} className="text-[10px] bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 rounded-full px-1.5 py-0.5">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {doc.analyzed && (
                        <button
                          onClick={() => setViewDoc(doc)}
                          className="flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 px-2 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition"
                        >
                          <BookOpen size={11} /> Voir
                        </button>
                      )}
                      <button
                        onClick={() => analyze.mutate(doc.id)}
                        disabled={analyze.isPending && analyze.variables === doc.id}
                        className="flex items-center gap-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-2 py-1 text-xs font-semibold text-[#717182] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] disabled:opacity-50 transition"
                      >
                        {analyze.isPending && analyze.variables === doc.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <LimuleIcon size={12} />
                        }
                        {doc.analyzed ? "Ré-analyser" : "Analyser"}
                      </button>
                      <button
                        onClick={() => del.mutate(doc.id)}
                        disabled={del.isPending}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
