import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Loader2 } from "lucide-react";
import { useRef } from "react";
import { api } from "../../services/api";

const MIME_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "image/jpeg": "🖼️", "image/png": "🖼️",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
};
function fmtSize(b: number) { if (b < 1024) return `${b} o`; if (b < 1024*1024) return `${(b/1024).toFixed(0)} Ko`; return `${(b/1024/1024).toFixed(1)} Mo`; }

export function GroupDocumentsPage() {
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
      const token = localStorage.getItem("kompta_access_token") ?? sessionStorage.getItem("kompta_access_token") ?? "";
      const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
      const r = await fetch(`${API_URL}/groups/${id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-docs", id] }),
  });

  const CATEGORIES = ["statut","règlement intérieur","rapport financier","pv","reçu","facture","contrat","preuve","autre"];
  const byCategory: Record<string, typeof documents> = {};
  for (const d of documents) {
    (byCategory[d.category] = byCategory[d.category] ?? []).push(d);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-black text-[#17211f] dark:text-white">Documents</h2><p className="text-sm text-[#717182]">{documents.length} document{documents.length > 1 ? "s" : ""}</p></div>
        <button onClick={() => fileRef.current?.click()} disabled={upload.isPending}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60 transition">
          {upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Téléverser
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="application/pdf,image/*,.docx,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); if (fileRef.current) fileRef.current.value = ""; }} />
      </div>
      {upload.error && <p className="text-sm text-rose-600">{(upload.error as Error).message}</p>}
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-violet-500" /></div> :
        documents.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileText size={40} className="text-[#717182] mb-3" />
            <p className="text-[#717182]">Aucun document. Téléversez des statuts, PV, reçus…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byCategory).map(([cat, docs]) => (
              <div key={cat}>
                <p className="text-xs font-bold uppercase text-[#717182] mb-2">{cat.toUpperCase()}</p>
                <div className="space-y-2">
                  {docs.map(d => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3">
                      <span className="text-xl shrink-0">{MIME_ICONS[d.mime_type] ?? "📎"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[#17211f] dark:text-white truncate">{d.title}</p>
                        <p className="text-xs text-[#717182]">{fmtSize(d.size_bytes)} · {new Date(d.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <span className="text-[10px] rounded-full bg-black/[0.05] dark:bg-white/[0.07] px-2 py-0.5 text-[#717182]">{d.visibility}</span>
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
