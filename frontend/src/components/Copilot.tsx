import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Bot, FileText, ListChecks, Send, Sparkles, Wand2, X } from "lucide-react";
import { api } from "../services/api";

type Message = {
  author: "user" | "ai";
  text: string;
};

const suggestions = [
  { label: "Resume cette page", icon: FileText },
  { label: "Quels sont les risques ?", icon: AlertTriangle },
  { label: "Cree une tache depuis ce contenu", icon: ListChecks },
  { label: "Redige un email de relance", icon: Wand2 }
];

export function Copilot() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      author: "ai",
      text: "Je suis Limule. Pose une question, demande un résumé, un risque ou un brouillon: je génère une réponse depuis le backend IA."
    }
  ]);
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; key_configured: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  async function send(text: string) {
    if (!text.trim() || loading) {
      return;
    }
    const userMessage = text.trim();
    setMessages((current) => [...current, { author: "user", text: userMessage }]);
    setInput("");
    setLoading(true);
    try {
      const generation = await api.aiGenerate({
        kind: "text",
        title: "Copilot Limule",
        prompt: userMessage,
        context: `page:${location.pathname}`,
      });
      setMessages((current) => [
        ...current,
        {
          author: "ai",
          text: generation.content
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          author: "ai",
          text: "Je n'arrive pas à joindre Limule pour l'instant. Vérifie que le backend est lancé, puis réessaie depuis cette fenêtre."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_18px_50px_rgba(124,58,237,0.35)] transition hover:scale-[1.03]"
        aria-label="Ouvrir Limule"
      >
        <Sparkles size={25} />
      </button>
      {open ? (
        <section className="fixed bottom-24 right-5 z-40 flex h-[36rem] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e2229]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-white">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
              <Bot size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black">Limule</p>
              <p className="text-sm font-semibold text-white/75">
                {aiStatus
                  ? `${aiStatus.provider} · ${aiStatus.model} · ${aiStatus.key_configured ? "clé prête" : "mode secours"}`
                  : "Assistant IA de KOMPTA"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfbfd] p-5 dark:bg-[#171a21]">
            {messages.map((message, index) => (
              <div key={`${message.author}-${index}`} className={`flex ${message.author === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.author === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    : "bg-white text-ink dark:bg-white/[0.08] dark:text-white"
                }`}>
                  {message.text}
                </p>
              </div>
            ))}
            {loading ? <p className="text-xs font-semibold text-[#717182]">Analyse en cours...</p> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-black/[0.05] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1e2229]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                onClick={() => send(suggestion.label)}
                className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17211f] transition hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-violet-500/10"
              >
                <suggestion.icon size={13} className="text-violet-600" />
                {suggestion.label}
              </button>
            ))}
          </div>
          <div className="border-t border-black/[0.05] p-3">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <Sparkles size={16} className="text-violet-600" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    send(input);
                  }
                }}
                placeholder="Demande a Limule..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
              />
              <button onClick={() => send(input)} className="grid h-9 w-9 place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-700" aria-label="Envoyer">
                <Send size={15} />
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
