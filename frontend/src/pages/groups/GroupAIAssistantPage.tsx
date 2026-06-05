import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Send, Loader2, BarChart3, FileText } from "lucide-react";
import { api } from "../../services/api";
import { LimuleAvatar, LimuleIcon } from "../../components/LimuleAvatar";

const QUICK_QUESTIONS = [
  "Qui n'a pas encore payé ses cotisations ?",
  "Combien avons-nous en caisse ?",
  "Quel membre a le plus grand arriéré ?",
  "Quelle est l'évolution des cotisations ce mois ?",
  "Résume les dernières décisions importantes.",
  "Qui fête son anniversaire cette semaine ?",
  "Quelles sont nos prochaines réunions ?",
];

type Message = { role: "user" | "assistant"; content: string };

export function GroupAIAssistantPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [showReport, setShowReport] = useState(false);

  const ask = useMutation({
    mutationFn: (q: string) => api.groupAskAI(id, q),
    onSuccess: (data, q) => setMessages(m => [...m, { role: "user", content: q }, { role: "assistant", content: data.answer }]),
  });

  const report = useMutation({
    mutationFn: (type: string) => api.groupGenerateReport(id, type),
    onSuccess: data => { setReportContent(data.content); setShowReport(true); },
  });

  const analysis = useMutation({
    mutationFn: () => api.groupPaymentAnalysis(id),
    onSuccess: data => { setReportContent(data.analysis); setShowReport(true); },
  });

  const sendMsg = () => {
    if (!input.trim()) return;
    ask.mutate(input.trim());
    setInput("");
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <LimuleAvatar state={ask.isPending || report.isPending || analysis.isPending ? "thinking" : "idle"} size={44} />
        <div>
          <h2 className="text-xl font-black text-[#17211f] dark:text-white">Limule — Assistant du groupe</h2>
          <p className="text-xs text-[#717182]">Posez des questions sur votre groupe, ses finances et ses membres</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => report.mutate("monthly")} disabled={report.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-800/10 px-3 py-2 text-xs font-bold text-blue-900 dark:text-blue-400 hover:bg-blue-100 transition">
          <FileText size={12} /> Rapport mensuel
        </button>
        <button onClick={() => report.mutate("payments")} disabled={report.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition">
          <BarChart3 size={12} /> Analyse cotisations
        </button>
        <button onClick={() => analysis.mutate()} disabled={analysis.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition">
          {analysis.isPending ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} Analyse paiements
        </button>
      </div>

      {/* Quick questions */}
      <div className="flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map(q => (
          <button key={q} onClick={() => { ask.mutate(q); }}
            className="rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-1.5 text-xs text-[#717182] hover:border-blue-500 hover:text-blue-900 dark:hover:text-blue-400 transition">
            {q}
          </button>
        ))}
      </div>

      {/* Conversation */}
      <div className="min-h-[200px] space-y-3">
        {messages.length === 0 && !ask.isPending && (
          <div className="flex flex-col items-center py-10 text-center">
            <LimuleAvatar state="idle" size={56} className="mb-3" />
            <p className="text-sm text-[#717182] max-w-sm">Posez une question sur votre groupe : finances, membres en retard, prochaines réunions, anniversaires…</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-gradient-to-r from-blue-800 to-blue-900 text-white" : "bg-[#ececf2] dark:bg-white/[0.07] text-[#17211f] dark:text-white"}`}>
              {msg.role === "assistant" && <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase text-[#717182]"><LimuleIcon size={12} /> Limule</div>}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#ececf2] dark:bg-white/[0.07] px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-700" />
              <span className="text-sm text-[#717182]">Limule analyse…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f5f6f8] dark:bg-[#252931] px-3 py-2.5">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
          placeholder="Posez une question sur votre groupe…"
          className="flex-1 bg-transparent text-sm text-[#17211f] dark:text-white outline-none placeholder:text-[#717182]" />
        <button onClick={sendMsg} disabled={!input.trim() || ask.isPending}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-800 to-blue-900 text-white disabled:opacity-40">
          {ask.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>

      {/* Report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><LimuleIcon size={16} /><h3 className="font-black text-[#17211f] dark:text-white">Rapport généré par Limule</h3></div>
              <button onClick={() => setShowReport(false)} className="rounded-lg bg-black/[0.05] dark:bg-white/[0.07] px-3 py-1 text-xs font-bold text-[#717182]">Fermer</button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-[#17211f] dark:text-white/90 leading-relaxed font-sans">{reportContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
