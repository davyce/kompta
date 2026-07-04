import type { ReactNode } from "react";

// Léger renderer Markdown vers JSX, sans dépendance externe.
// Utilisé pour afficher les rapports/analyses générés par Limule (IA) :
// titres (#, ##, ###), listes (tiret, astérisque, puce, "1."),
// règles horizontales, et emphase inline (gras, italique).
// Partagé entre AnalyticsPage (prévision) et ReportsHubPage (rapports IA)
// pour garantir un rendu cohérent partout où du contenu IA est affiché.
export function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 space-y-1 pl-4">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-6 text-[#17211f] dark:text-white/85">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            <span>{inlineRender(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function inlineRender(text: string): ReactNode {
    // Découpe en conservant **gras**, *italique* et _italique_.
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-[#17211f] dark:text-white">{part.slice(2, -2)}</strong>;
      }
      if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
        return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      nodes.push(<hr key={i} className="my-3 border-black/10 dark:border-white/10" />);
    } else if (line.startsWith("### ")) {
      flushList();
      nodes.push(<h3 key={i} className="mt-4 mb-1 text-base font-black text-[#17211f] dark:text-white">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      nodes.push(<h2 key={i} className="mt-5 mb-1 text-lg font-black text-violet-700 dark:text-violet-300">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      nodes.push(<h1 key={i} className="mt-4 mb-2 text-xl font-black text-[#17211f] dark:text-white">{line.slice(2)}</h1>);
    } else if (/^[-*•]\s/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s/, ""));
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ""));
    } else if (trimmed === "") {
      flushList();
      if (nodes.length > 0) nodes.push(<div key={`sp-${i}`} className="h-2" />);
    } else {
      flushList();
      nodes.push(
        <p key={i} className="text-sm leading-7 text-[#17211f] dark:text-white/85">
          {inlineRender(line)}
        </p>
      );
    }
  }
  flushList();
  return <div className="space-y-0.5">{nodes}</div>;
}
