import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useRef, useState } from "react";
import {
  Braces, ChevronDown, ChevronUp, ClipboardCheck,
  Copy, Download, Mail, RefreshCcw, Save, Send, Sparkles, Trash2, Zap,
} from "lucide-react";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";

import { TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";

/* ─── Modèles de documents ──────────────────────────────────────────────── */
const TEMPLATES = [
  { key: "email",          label: "Email professionnel",  icon: Mail },
  { key: "note",           label: "Note de service",       icon: ClipboardCheck },
  { key: "communique",     label: "Communiqué",            icon: Sparkles },
  { key: "courrier",       label: "Courrier officiel",     icon: ClipboardCheck },
  { key: "reponse_client", label: "Réponse client",        icon: Mail },
  { key: "annonce_interne",label: "Annonce interne",       icon: Sparkles },
  { key: "clause",         label: "Clause contractuelle",  icon: Braces },
  { key: "declaration",    label: "Analyse déclarative",   icon: Zap },
];

const TONES = ["professionnel", "chaleureux", "formel", "ferme"];

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
  const queryClient = useQueryClient();
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    content_type: "email",
    tone: "professionnel",
    audience: "Équipe boutique Plateau",
    notes: "Annoncer le lancement de la collection wax 2026 et le planning de formation",
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
        title:   `${selectedTemplate.label} · ${form.audience}`,
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
        title:   `${selectedTemplate.label} · ${form.audience}`,
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
        <p className="text-sm font-semibold text-emerald-600">Rédaction IA</p>
        <h1 className="text-3xl font-black text-ink">Studio Limule</h1>
        <p className="mt-1 text-sm font-medium text-[#717182]">
          Emails, notes, courriers et clauses générés avec variables dynamiques et contexte CEMACE.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.38fr_1fr]">

        {/* ── Modèles ── */}
        <Panel title="Modèles">
          <div className="space-y-1">
            {TEMPLATES.map(t => (
              <button
                key={t.key}
                onClick={() => setForm(f => ({ ...f, content_type: t.key }))}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                  form.content_type === t.key
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "text-ink dark:text-white hover:bg-stone-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <t.icon size={16} className="shrink-0" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Infobadge LLM */}
          <div className="mt-4 rounded-lg border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Zap size={12} />
              Limule — LLM actif
            </p>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-500">
              Génération temps-réel · Variables DB · Contexte CEMACE
            </p>
          </div>
        </Panel>

        {/* ── Éditeur ── */}
        <Panel
          title={selectedTemplate.label}
          action={
            isStreaming
              ? <span className="flex items-center gap-2 text-xs font-bold text-emerald-600"><RefreshCcw className="animate-spin" size={13} />Limule génère…</span>
              : hasContent
              ? <StatusBadge label="Généré par Limule" tone="green" />
              : null
          }
        >
          <form onSubmit={handleGenerate} className="space-y-4">

            {/* Audience + Ton */}
            <div className="grid gap-3 lg:grid-cols-[0.95fr_1fr]">
              <TextInput
                label="Destinataire / audience"
                value={form.audience}
                onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
              />
              <label className="block">
                <span className="text-xs font-semibold uppercase text-[#717182]">Ton</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TONES.map(tone => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, tone }))}
                      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                        form.tone === tone
                          ? "bg-emerald-600 text-white"
                          : "bg-black/[0.04] dark:bg-white/[0.06] text-[#17211f] dark:text-white hover:bg-stone-200 dark:hover:bg-white/[0.10]"
                      }`}
                    >
                      {tone[0].toUpperCase() + tone.slice(1)}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            {/* Objectif / notes */}
            <TextArea
              ref={notesRef}
              label="Objectif / contexte"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Décris ta demande… Tu peux utiliser {entreprise}, {utilisateur}, {teras_score}, etc."
            />

            {/* ── Variables dynamiques ── */}
            <div>
              <button
                type="button"
                onClick={() => setShowVars(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#717182] hover:text-ink dark:hover:text-white transition"
              >
                <Braces size={13} />
                Variables dynamiques
                {showVars ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {variables.data && (
                  <span className="ml-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {Object.keys(variables.data.catalogue).length} disponibles
                  </span>
                )}
              </button>
              {showVars && (
                <div className="mt-2 rounded-lg border border-black/[0.05] dark:border-white/[0.05] bg-stone-50 dark:bg-white/[0.02] p-3">
                  <p className="mb-2 text-[11px] text-[#717182]">
                    Cliquez sur une variable pour l'insérer dans le texte. Survol = valeur actuelle.
                  </p>
                  {variables.isLoading && (
                    <p className="text-xs text-[#717182]">Chargement des variables…</p>
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
                  {isStreaming ? "Limule génère en temps réel…" : "Brouillon généré"}
                </p>
              </div>

              {hasContent ? (
                <pre className="whitespace-pre-wrap text-sm leading-7 text-ink dark:text-white/90">
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
                    Remplissez le formulaire et cliquez sur{" "}
                    <strong className="not-italic text-ink dark:text-white">Générer</strong> pour créer votre brouillon.
                  </p>
                  <p className="text-[12px]">
                    💡 Utilisez les <strong className="not-italic text-ink dark:text-white">variables dynamiques</strong> pour injecter
                    automatiquement le nom de l'entreprise, le score TERAS, le nombre d'employés et plus encore.
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isStreaming}
                  className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"
                >
                  {isStreaming ? <LimuleAvatar state="thinking" size={18} /> : <LimuleIcon size={16} className="brightness-0" />}
                  {isStreaming ? "Génération…" : "Générer"}
                </button>
                <button
                  type="button"
                  onClick={() => generateVariant("chaleureux")}
                  disabled={isStreaming}
                  className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 disabled:opacity-40 transition"
                >
                  Variante chaleureuse
                </button>
                <button
                  type="button"
                  onClick={copyDraft}
                  disabled={!hasContent}
                  className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm font-bold text-ink dark:text-white hover:bg-stone-50 disabled:opacity-40 transition"
                >
                  <Copy size={15} />
                  {copied ? "Copié !" : "Copier"}
                </button>
              </div>
              <button
                type="button"
                onClick={copyDraft}
                disabled={!hasContent}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300 transition"
                title="Copier dans le presse-papiers pour envoyer"
              >
                <Send size={15} />
                Copier &amp; envoyer
              </button>
            </div>

          </form>
        </Panel>
      </div>

      {/* ── Mes dernières questions Limule (Q&A persistées) ── */}
      <div className="grid gap-5 xl:grid-cols-[0.38fr_1fr]">
        <Panel
          title="Mes dernières questions"
          action={
            <span className="text-xs text-[#717182]">
              {limuleQA.data?.length ?? 0}
            </span>
          }
        >
          {limuleQA.isLoading && (
            <p className="py-4 text-sm text-[#717182]">Chargement…</p>
          )}
          {!limuleQA.isLoading && (limuleQA.data?.length ?? 0) === 0 && (
            <p className="py-4 text-sm text-[#717182]">
              Tes questions à Limule s'enregistrent automatiquement ici.
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
                    {q.question || "(sans question)"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#717182]">
                    {q.module}
                    {q.created_at
                      ? " · " +
                        new Date(q.created_at).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Réponse Limule">
          {selectedQA ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Question
                </p>
                <p className="mt-1 text-sm font-medium text-[#17211f] dark:text-white">
                  {selectedQA.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Réponse
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#17211f] dark:text-white">
                  {selectedQA.answer || "(réponse vide)"}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-sm text-[#717182]">
              Sélectionne une question dans la liste pour afficher la réponse.
            </p>
          )}
        </Panel>
      </div>

      {/* ── Historique Limule ── */}
      <Panel
        title="Historique Limule"
        action={
          <span className="text-xs text-[#717182]">
            {history.data?.length ?? 0} génération{(history.data?.length ?? 0) !== 1 ? "s" : ""}
          </span>
        }
      >
        {history.isLoading && <p className="py-4 text-sm text-[#717182]">Chargement…</p>}
        {!history.isLoading && (history.data?.length ?? 0) === 0 && (
          <p className="py-4 text-sm text-[#717182]">
            Tes générations apparaîtront ici dès que Limule aura produit du contenu.
          </p>
        )}
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {(history.data ?? []).map(g => (
            <div key={g.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                <LimuleIcon size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#17211f] dark:text-white truncate">{g.title || "(sans titre)"}</p>
                <p className="text-xs text-[#717182]">
                  {g.kind}
                  {" · "}
                  {new Date(g.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
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
                title="Télécharger"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => deleteGen.mutate(g.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                title="Supprimer"
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
