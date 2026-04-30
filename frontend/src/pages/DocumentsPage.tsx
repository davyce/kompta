import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { BrainCircuit, CheckCircle2, Download, FileSearch, FileUp, RefreshCcw } from "lucide-react";

import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { TextInput } from "../components/FormField";
import { api } from "../services/api";
import { shortDate } from "../utils/format";

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["documents"], queryFn: api.documents });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const [title, setTitle] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: () => {
      setTitle("");
      setEmployeeId("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  const analyze = useMutation({
    mutationFn: api.analyzeDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] })
  });
  const terasAnalyze = useMutation({
    mutationFn: api.analyzeTerasDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
      queryClient.invalidateQueries({ queryKey: ["terasRecommendations"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      return;
    }
    upload.mutate({ title: title || file.name, file, employee_id: employeeId ? Number(employeeId) : undefined });
  }

  async function download(documentId: number, filename: string) {
    const blob = await api.downloadDocument(documentId);
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Documents entreprise</p>
        <h1 className="text-3xl font-black text-ink">Classement et analyse IA</h1>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="Ajouter un document">
          <form onSubmit={submit} className="space-y-3">
            <TextInput label="Titre" value={title} onChange={(event) => setTitle(event.target.value)} />
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Lier a un employe</span>
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
              >
                <option value="">Document entreprise</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.first_name} {employee.last_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
              <span className="text-sm font-semibold text-stone-700">Fichier</span>
              <input className="mt-2 block w-full text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button
              disabled={!file || upload.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:bg-stone-300 transition"
            >
              {upload.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Analyse IA en cours…
                </>
              ) : (
                <>
                  <FileUp size={18} />
                  Uploader et classer
                </>
              )}
            </button>
            {upload.isPending && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#717182]">
                  <span>Envoi et classification IA…</span>
                  <span className="animate-pulse">⚡</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500" />
                </div>
              </div>
            )}
            {upload.isSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CheckCircle2 size={15} /> Document classé et analysé par l'IA
              </p>
            )}
            {upload.error ? <p className="text-sm text-red-600">{upload.error.message}</p> : null}
          </form>
        </Panel>
        <Panel title="Bibliotheque documentaire">
          <div className="grid gap-3">
            {documents.data?.map((document) => (
              <article key={document.id} className="rounded-lg border border-stone-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{document.title}</p>
                    <p className="text-sm text-stone-500">{document.filename} · {shortDate(document.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={document.document_type} tone="blue" />
                    <StatusBadge label={`${document.confidence}% IA`} tone={document.confidence >= 80 ? "green" : "amber"} />
                  </div>
                </div>
                <p className="mt-3 text-sm text-stone-600">{document.ai_summary}</p>
                <p className="mt-2 text-xs text-stone-500">{document.ai_tags}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => analyze.mutate(document.id)}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
                  >
                    <BrainCircuit size={16} />
                    Re-analyser
                  </button>
                  <button
                    onClick={() => terasAnalyze.mutate(document.id)}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
                  >
                    <FileSearch size={16} />
                    Controle TERAS
                  </button>
                  <button
                    onClick={() => download(document.id, document.filename)}
                    className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Download size={16} />
                    Telecharger
                  </button>
                </div>
              </article>
            ))}
            {documents.isFetching ? (
              <div className="flex items-center gap-2 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
                <RefreshCcw className="animate-spin" size={16} />
                Chargement des documents
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
