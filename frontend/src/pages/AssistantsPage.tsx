import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Braces, ChevronDown, ChevronUp, ClipboardCheck,
  Copy, Download, Mail, RefreshCcw, Send, Sparkles, Trash2, Zap,
} from "lucide-react";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";

import { TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import i18n from "../i18n";
import { api } from "../services/api";

/* ─── Modèles de documents ──────────────────────────────────────────────── */
const TEMPLATES = [
  { key: "email",          labelTk: "assistants.templates.email",          icon: Mail },
  { key: "note",           labelTk: "assistants.templates.note",           icon: ClipboardCheck },
  { key: "communique",     labelTk: "assistants.templates.communique",     icon: Sparkles },
  { key: "courrier",       labelTk: "assistants.templates.courrier",       icon: ClipboardCheck },
  { key: "reponse_client", labelTk: "assistants.templates.reponseClient",  icon: Mail },
  { key: "annonce_interne",labelTk: "assistants.templates.annonceInterne", icon: Sparkles },
  { key: "clause",         labelTk: "assistants.templates.clause",         icon: Braces },
  { key: "declaration",    labelTk: "assistants.templates.declaration",    icon: Zap },
];

const TONES = [
  { value: "professionnel", tk: "assistants.tones.professional" },
  { value: "chaleureux", tk: "assistants.tones.warm" },
  { value: "formel", tk: "assistants.tones.formal" },
  { value: "ferme", tk: "assistants.tones.firm" },
];

function formatAssistantDateTime(value: string): string {
  return new Date(value).toLocaleString(i18n.language, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/* ─── Composant variable chip ────────────────────────────────────────────── */
function VarChip({
  varKey,
  label,
  resolvedValue,
  onClick,
}: {
  varKey: string;
  label: string;
  resolvedValue?: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
      title={label}
    >
      <span className="text-emerald-400">{"{"}</span>
      {varKey}
      <span className="text-emerald-400">{"}"}</span>
      {hover && resolvedValue && !resolvedValue.startsWith("{") && (
        <span className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-black/[0.08] bg-white dark:bg-[#252931] dark:border-white/[0.08] px-2 py-1 font-sans text-[11px] text-[#17211f] dark:text-white shadow-md">
          = <strong>{resolvedValue}</strong>
        </span>
      )}
    </button>
  );
}

/* ─── Page principale ────────────────────────────────────────────────────── */
export function AssistantsPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    content_type: "email",
    tone: "professionnel",
    audience: tr("assistants.defaults.audience"),
    notes: tr("assistants.defaults.notes"),
  });

  const [streamedDraft, setStreamedDraft]     = useState<string>("");
  const [isStreaming, setIsStreaming]          = useState(false);
  const [streamError, setStreamError]          = useState<string | null>(null);
  const [copied, setCopied]                    = useState(false);
  const [showVars, setShowVars]                = useState(true);

  const variables  = useQuery({ queryKey: ["aiVariables"], queryFn: api.aiVariables });
  const history    = useQuery({ queryKey: ["aiHistory"],   queryFn: () => api.aiHistory(30) });
  // Historique Q&A Limule (chat) — sidebar « Mes dernières questions »
  const limuleQA   = useQuery({ queryKey: ["limuleHistory"], queryFn: () => api.limuleHistory(30) });
  const [selectedQA, setSelectedQA] = useState<{ question: string; answer: string } | null>(null);

  const deleteGen = useMutation({
    mutationFn: (id: number) => api.aiDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiHistory"] }),
  });

  /* ── Insérer une variable au curseur ── */
  const insertVariable = useCallback((varKey: string) => {
    const ta = notesRef.current;
    const token = `{${varKey}}`;
    if (ta) {
      const start = ta.selectionStart ?? form.notes.length;
      const end   = ta.selectionEnd   ?? form.notes.length;
      const newVal = form.notes.slice(0, start) + token + form.notes.slice(end);
      setForm(f => ({ ...f, notes: newVal }));
      // Repositionner le curseur après l'insertion
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + token.length;
        ta.focus();
      });
    } else {
      setForm(f => ({ ...f, notes: f.notes + token }));
    }
  }, [form.notes]);

  /* ── Génération streaming ── */
  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setStreamedDraft("");
    setStreamError(null);
    setIsStreaming(true);

    await api.aiGenerateStream(
      {
        kind:    form.content_type,
        title:   `${tr(selectedTemplate.labelTk)} · ${form.audience}`,
        prompt:  form.notes,
        context: `tone:${form.tone}; audience:${form.audience}`,
      },
      (partial) => setStreamedDraft(partial),
      (final, _id) => {
        setStreamedDraft(final);
        setIsStreaming(false);
        queryClient.invalidateQueries({ queryKey: ["aiHistory"] });
      },
      (err) => {
        setStreamError(err.message);
        setIsStreaming(false);
      },
    );
  }

  /* ── Générer une variante de ton ── */
  async function generateVariant(tone: string) {
    setForm(f => ({ ...f, tone }));
    setStreamedDraft("");
    setStreamError(null);
    setIsStreaming(true);
    await api.aiGenerateStream(
      {
        kind:    form.content_type,
        title:   `${tr(selectedTemplate.labelTk)} · ${form.audience}`,
        prompt:  form.notes,
        context: `tone:${tone}; audience:${form.audience}`,
      },
      (partial) => setStreamedDraft(partial),
      (final) => {
        setStreamedDraft(final);
        setIsStreaming(false);
        queryClient.invalidateQueries({ queryKey: ["aiHistory"] });
      },
      (err) => {
        setStreamError(err.message);
        setIsStreaming(false);
      },
    );
  }

  function copyDraft() {
    if (!streamedDraft) return;
    navigator.clipboard.writeText(streamedDraft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function downloadGen(id: number, filename: string) {
    const blob = await api.aiDownload(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedTemplate = TEMPLATES.find(t => t.key === form.content_type) ?? TEMPLATES[0];
  const hasContent = streamedDraft.length > 0;

  return (
    <div className="space-y-5">

      {/* En-tête */}
      <div>
        <p className="text-sm font-semibold text-emerald-600">{tr("assistants.header.eyebrow")}</p>
        <h1 className="text-2xl sm:text-3xl font-black text-ink">{tr("assistants.header.title")}</h1>
        <p className="mt-1 text-sm font-medium text-[#717182]">
          {tr("assistants.header.subtitle")}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.38fr_1fr]">

        {/* ── Modèles ── */}
        <Panel title={tr("assistants.templatesPanel.title")}>
          {/* Mobile : rangée scrollable horizontale (l'éditeur reste accessible
              sans dérouler 8 items). Desktop (xl) : liste verticale classique. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin xl:mx-0 xl:flex-col xl:gap-1 xl:overflow-visible xl:px-0 xl:pb-0">
            {TEMPLATES.map(t => (
              <button
                key={t.key}
                onClick={() => setForm(f => ({ ...f, content_type: t.key }))}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-semibold transition xl:w-full xl:gap-3 xl:py-2.5 ${
                  form.content_type === t.key
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/30 xl:ring-0"
                    : "bg-stone-50 text-ink dark:bg-white/[0.04] dark:text-white hover:bg-stone-100 dark:hover:bg-white/[0.06] xl:bg-transparent xl:hover:bg-stone-50 dark:xl:bg-transparent"
                }`}
              >
                <t.icon size={16} className="shrink-0" />
                {tr(t.labelTk)}
              </button>
            ))}
          </div>

          {/* Infobadge LLM */}
          <div className="mt-4 rounded-lg border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Zap size={12} />
              {tr("assistants.llmBadge.title")}
            </p>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-500">
              {tr("assistants.llmBadge.subtitle")}
            </p>
          </div>
        </Panel>

        {/* ── Éditeur ── */}
        <Panel
          title={tr(selectedTemplate.labelTk)}
          action={
            isStreaming
              ? <span className="flex items-center gap-2 text-xs font-bold text-emerald-600"><RefreshCcw className="animate-spin" size={13} />{tr("assistants.editor.generating")}</span>
              : hasContent
              ? <StatusBadge label={tr("assistants.editor.generatedBadge")} tone="green" />
              : null
          }
        >
          <form onSubmit={handleGenerate} className="space-y-4">

            {/* Audience + Ton */}
            <div className="grid gap-3 lg:grid-cols-[0.95fr_1fr]">
              <TextInput
                label={tr("assistants.form.audience")}
                value={form.audience}
                onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
              />
              <label className="block">
                <span className="text-xs font-semibold uppercase text-[#717182]">{tr("assistants.form.tone")}</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TONES.map(({ value, tk }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, tone: value }))}
                      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                        form.tone === value
                          ? "bg-emerald-600 text-white"
                          : "bg-black/[0.04] dark:bg-white/[0.06] text-[#17211f] dark:text-white hover:bg-stone-200 dark:hover:bg-white/[0.10]"
                      }`}
                    >
                      {tr(tk)}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            {/* Objectif / notes */}
            <TextArea
              ref={notesRef}
              label={tr("assistants.form.objective")}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={tr("assistants.form.objectivePlaceholder")}
            />

            {/* ── Variables dynamiques ── */}
            <div>
              <button
                type="button"
                onClick={() => setShowVars(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#717182] hover:text-ink dark:hover:text-white transition"
              >
                <Braces size={13} />
                {tr("assistants.variables.title")}
                {showVars ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {variables.data && (
                  <span className="ml-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {tr("assistants.variables.available", { count: Object.keys(variables.data.catalogue).length })}
                  </span>
                )}
              </button>
              {showVars && (
                <div className="mt-2 rounded-lg border border-black/[0.05] dark:border-white/[0.05] bg-stone-50 dark:bg-white/[0.02] p-3">
                  <p className="mb-2 text-[11px] text-[#717182]">
                    {tr("assistants.variables.help")}
                  </p>
                  {variables.isLoading && (
                    <p className="text-xs text-[#717182]">{tr("assistants.variables.loading")}</p>
                  )}
                  {variables.data && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(variables.data.catalogue).map(([key, label]) => (
                        <VarChip
                          key={key}
                          varKey={key}
                          label={label}
                          resolvedValue={variables.data?.resolved?.[key]}
                          onClick={() => insertVariable(key)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Zone de brouillon ── */}
            <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center gap-2">
                <LimuleAvatar state={isStreaming ? "speaking" : "idle"} size={28} />
                <p className="font-bold text-emerald-600">
                  {isStreaming ? tr("assistants.draft.streaming") : tr("assistants.draft.title")}
                </p>
              </div>

              {hasContent ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-ink dark:text-white/90">
                  {streamedDraft}
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-4 bg-emerald-500 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              ) : isStreaming ? (
                <div className="flex h-20 items-center justify-center">
                  <LimuleAvatar state="thinking" size={56} />
                </div>
              ) : (
                <div className="space-y-2 text-sm leading-7 text-[#717182] italic">
                  <p>
                    {tr("assistants.draft.emptyPrefix")}{" "}
                    <strong className="not-italic text-ink dark:text-white">{tr("assistants.actions.generate")}</strong>
                    {tr("assistants.draft.emptySuffix")}
                  </p>
                  <p className="text-[12px]">
                    {tr("assistants.draft.tipPrefix")} <strong className="not-italic text-ink dark:text-white">{tr("assistants.variables.title")}</strong> {tr("assistants.draft.tipSuffix")}
                  </p>
                </div>
              )}
            </div>

            {streamError && (
              <p className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {streamError}
              </p>
            )}

            {/* ── Boutons d'action ── */}
            {/* Mobile : actions empilées, CTA pleine largeur. Desktop : en ligne. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="submit"
                  disabled={isStreaming}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 dark:hover:bg-white/[0.06] disabled:opacity-40 transition sm:col-span-1 sm:py-2"
                >
                  {isStreaming ? <LimuleAvatar state="thinking" size={18} /> : <LimuleIcon size={16} className="brightness-0" />}
                  {isStreaming ? tr("assistants.actions.generating") : tr("assistants.actions.generate")}
                </button>
                <button
                  type="button"
                  onClick={() => generateVariant("chaleureux")}
                  disabled={isStreaming}
                  className="flex items-center justify-center rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 disabled:opacity-40 transition sm:py-2"
                >
                  {tr("assistants.actions.warmVariant")}
                </button>
                <button
                  type="button"
                  onClick={copyDraft}
                  disabled={!hasContent}
                  className="flex items-center justify-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 disabled:opacity-40 transition sm:py-2"
                >
                  <Copy size={15} />
                  {copied ? tr("assistants.actions.copied") : tr("common.copy")}
                </button>
              </div>
              <button
                type="button"
                onClick={copyDraft}
                disabled={!hasContent}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300 dark:disabled:bg-white/10 dark:disabled:text-white/40 transition sm:w-auto sm:py-2"
                title={tr("assistants.actions.copySendTitle")}
              >
                <Send size={15} />
                {tr("assistants.actions.copySend")}
              </button>
            </div>

          </form>
        </Panel>
      </div>

      {/* ── Mes dernières questions Limule (Q&A persistées) ── */}
      <div className="grid gap-5 xl:grid-cols-[0.38fr_1fr]">
        <Panel
          title={tr("assistants.qa.title")}
          action={
            <span className="text-xs text-[#717182]">
              {limuleQA.data?.length ?? 0}
            </span>
          }
        >
          {limuleQA.isLoading && (
            <p className="py-4 text-sm text-[#717182]">{tr("common.loading")}</p>
          )}
          {!limuleQA.isLoading && (limuleQA.data?.length ?? 0) === 0 && (
            <p className="py-4 text-sm text-[#717182]">
              {tr("assistants.qa.empty")}
            </p>
          )}
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.04] max-h-96 overflow-y-auto">
            {(limuleQA.data ?? []).map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setSelectedQA({ question: q.question, answer: q.answer })}
                  className="block w-full text-left px-2 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition"
                >
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white truncate">
                    {q.question || tr("assistants.qa.noQuestion")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#717182]">
                    {q.module}
                    {q.created_at
                      ? " · " +
                        formatAssistantDateTime(q.created_at)
                      : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={tr("assistants.qa.answerPanel")}>
          {selectedQA ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  {tr("assistants.qa.question")}
                </p>
                <p className="mt-1 text-sm font-medium text-[#17211f] dark:text-white">
                  {selectedQA.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  {tr("assistants.qa.answer")}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#17211f] dark:text-white">
                  {selectedQA.answer || tr("assistants.qa.emptyAnswer")}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-sm text-[#717182]">
              {tr("assistants.qa.selectPrompt")}
            </p>
          )}
        </Panel>
      </div>

      {/* ── Historique Limule ── */}
      <Panel
        title={tr("assistants.history.title")}
        action={
          <span className="text-xs text-[#717182]">
            {tr("assistants.history.count", { count: history.data?.length ?? 0 })}
          </span>
        }
      >
        {history.isLoading && <p className="py-4 text-sm text-[#717182]">{tr("common.loading")}</p>}
        {!history.isLoading && (history.data?.length ?? 0) === 0 && (
          <p className="py-4 text-sm text-[#717182]">
            {tr("assistants.history.empty")}
          </p>
        )}
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {(history.data ?? []).map(g => (
            <div key={g.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                <LimuleIcon size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#17211f] dark:text-white truncate">{g.title || tr("assistants.history.noTitle")}</p>
                <p className="text-xs text-[#717182]">
                  {g.kind}
                  {" · "}
                  {formatAssistantDateTime(g.created_at)}
                  {g.teras_used ? " · TERAS" : ""}
                </p>
                {g.content && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[#717182]">{g.content}</p>
                )}
              </div>
              <button
                onClick={() =>
                  downloadGen(
                    g.id,
                    `limule-${g.id}-${(g.title || "generation").replace(/\s+/g, "-").slice(0, 30)}.md`,
                  )
                }
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
                title={tr("common.download")}
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => deleteGen.mutate(g.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                title={tr("common.delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
