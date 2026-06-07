import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Loader2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, getToken } from "../../services/api";
import i18n from "../../i18n";

const MIME_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "image/jpeg": "🖼️", "image/png": "🖼️",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
};

const CATEGORY_TK: Record<string, string> = {
  statut: "groupPages.documents.categories.statute",
  "règlement intérieur": "groupPages.documents.categories.rules",
  "rapport financier": "groupPages.documents.categories.financialReport",
  pv: "groupPages.documents.categories.minutes",
  reçu: "groupPages.documents.categories.receipt",
  facture: "groupPages.documents.categories.invoice",
  contrat: "groupPages.documents.categories.contract",
  preuve: "groupPages.documents.categories.proof",
  autre: "groupPages.documents.categories.other",
};

const VISIBILITY_TK: Record<string, string> = {
  members: "groupPages.documents.visibility.members",
  managers: "groupPages.documents.visibility.managers",
  public: "groupPages.documents.visibility.public",
};

function fmtSize(b: number, tr: TFunction) {
  if (b < 1024) return `${b} ${tr("groupPages.documents.units.bytes")}`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} ${tr("groupPages.documents.units.kb")}`;
  return `${(b / 1024 / 1024).toFixed(1)} ${tr("groupPages.documents.units.mb")}`;
}

export function GroupDocumentsPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: documents = [], isLoading } = useQuery({ queryKey: ["group-docs", id], queryFn: () => api.groupDocuments(id) });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      fd.append("category", "autre");
      fd.append("visibility", "members");
      const token = getToken() ?? "";
      const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
      const r = await fetch(`${API_URL}/groups/${id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, credentials: "include", body: fd });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-docs", id] }),
  });

  const byCategory: Record<string, typeof documents> = {};
  for (const d of documents) {
    (byCategory[d.category] = byCategory[d.category] ?? []).push(d);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.documents.title")}</h2><p className="text-sm text-[#717182]">{tr("groupPages.documents.count", { count: documents.length })}</p></div>
        <button onClick={() => fileRef.current?.click()} disabled={upload.isPending}
          className="flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-60 transition">
          {upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {tr("groupPages.documents.upload")}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="application/pdf,image/*,.docx,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); if (fileRef.current) fileRef.current.value = ""; }} />
      </div>
      {upload.error && <p className="text-sm text-rose-600">{(upload.error as Error).message}</p>}
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-blue-700" /></div> :
        documents.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileText size={40} className="text-[#717182] mb-3" />
            <p className="text-[#717182]">{tr("groupPages.documents.empty")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byCategory).map(([cat, docs]) => (
              <div key={cat}>
                <p className="text-xs font-bold uppercase text-[#717182] mb-2">{tr(CATEGORY_TK[cat] ?? "groupPages.documents.categories.unknown", { defaultValue: cat }).toUpperCase()}</p>
                <div className="space-y-2">
                  {docs.map(d => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3">
                      <span className="text-xl shrink-0">{MIME_ICONS[d.mime_type] ?? "📎"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[#17211f] dark:text-white truncate">{d.title}</p>
                        <p className="text-xs text-[#717182]">{fmtSize(d.size_bytes, tr)} · {new Date(d.created_at).toLocaleDateString(i18n.language)}</p>
                      </div>
                      <span className="text-[10px] rounded-full bg-black/[0.05] dark:bg-white/[0.07] px-2 py-0.5 text-[#717182]">{tr(VISIBILITY_TK[d.visibility] ?? "groupPages.documents.visibility.unknown", { defaultValue: d.visibility })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
