import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Calculator,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderArchive,
  HandCoins,
  LayoutDashboard,
  MessageSquare,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { api } from "../services/api";

type CommandItem = {
  type: "page" | "action" | "person" | "invoice" | "product" | "task";
  label: string;
  hint: string;
  icon: LucideIcon;
  path?: string;
  group: string;
};

/* Static pages and quick actions */
const staticItems: CommandItem[] = [
  { type: "page", label: "Tableau de bord", hint: "Pilotage temps réel", icon: LayoutDashboard, path: "/", group: "Pages" },
  { type: "page", label: "Entreprise", hint: "Profil, structure, paramètres", icon: Building2, path: "/company", group: "Pages" },
  { type: "page", label: "Ressources humaines", hint: "Employés, contrats, accès", icon: Users, path: "/employees", group: "Pages" },
  { type: "page", label: "Documents", hint: "Classement IA et contrats", icon: FolderArchive, path: "/documents", group: "Pages" },
  { type: "page", label: "Paie", hint: "Cycles, bulletins, validation", icon: HandCoins, path: "/payroll", group: "Pages" },
  { type: "page", label: "Comptabilité", hint: "Finance et SYSCOHADA", icon: Calculator, path: "/accounting", group: "Pages" },
  { type: "page", label: "Facturation", hint: "Clients, factures, encaissements", icon: ReceiptText, path: "/billing", group: "Pages" },
  { type: "page", label: "POS / Caisse", hint: "Caisse, panier, encaissement", icon: ShoppingCart, path: "/pos", group: "Pages" },
  { type: "page", label: "Inventaire", hint: "Stock, produits, QR codes", icon: Boxes, path: "/inventory", group: "Pages" },
  { type: "page", label: "Projets & boards", hint: "Suivi équipe et budgets", icon: CheckSquare, path: "/projects", group: "Pages" },
  { type: "page", label: "Chat", hint: "Messages et mentions", icon: MessageSquare, path: "/chat", group: "Pages" },
  { type: "page", label: "Agenda", hint: "Calendrier, réunions, tâches et comptes-rendus Limule", icon: CalendarDays, path: "/calendar", group: "Pages" },
  { type: "page", label: "Notes IA", hint: "Journal automatique des tâches", icon: FileText, path: "/notes", group: "Pages" },
  { type: "page", label: "Rapports", hint: "Hub d'analyses", icon: ChartNoAxesCombined, path: "/reports", group: "Pages" },
  { type: "page", label: "Déclarations", hint: "Fiscal, social, bailleur, TERAS", icon: ClipboardList, path: "/declarations", group: "Pages" },
  { type: "page", label: "Rédaction IA", hint: "Studio Limule · emails, courriers", icon: Bot, path: "/assistants", group: "Pages" },
  { type: "page", label: "TERAS Connect", hint: "Scoring, risques, conformité", icon: ShieldCheck, path: "/reports-teras", group: "Pages" },
  { type: "page", label: "Paramètres", hint: "Modules et configuration", icon: Settings, path: "/settings", group: "Pages" },
  { type: "action", label: "Créer une facture", hint: "Nouveau client ou ligne de vente", icon: Plus, path: "/billing", group: "Actions rapides" },
  { type: "action", label: "Lancer la paie", hint: "Générer les bulletins du mois", icon: HandCoins, path: "/payroll", group: "Actions rapides" },
  { type: "action", label: "Ajouter un employé", hint: "Création rapide RH + accès", icon: Users, path: "/employees", group: "Actions rapides" },
  { type: "action", label: "Uploader un document", hint: "Classement IA automatique", icon: FileText, path: "/documents", group: "Actions rapides" },
  { type: "action", label: "Demander à TERAS", hint: "Analyse risque et recommandations", icon: Sparkles, path: "/reports-teras", group: "Actions rapides" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  /* Live data — fetched lazily once palette opens */
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees, enabled: open, staleTime: 60_000 });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices, enabled: open, staleTime: 60_000 });
  const products = useQuery({ queryKey: ["products"], queryFn: api.products, enabled: open, staleTime: 60_000 });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks, enabled: open, staleTime: 60_000 });

  /* Build full searchable list from real data */
  const allItems = useMemo<CommandItem[]>(() => {
    const dynamic: CommandItem[] = [];
    employees.data?.forEach((e) => {
      dynamic.push({
        type: "person",
        label: `${e.first_name} ${e.last_name}`,
        hint: `${e.job_title || "—"} · ${e.department || "—"}`,
        icon: Users,
        path: "/employees",
        group: "Personnes",
      });
    });
    invoices.data?.forEach((inv) => {
      dynamic.push({
        type: "invoice",
        label: `${inv.number} · ${inv.customer_name}`,
        hint: `Facture · ${inv.status}`,
        icon: ReceiptText,
        path: "/billing",
        group: "Factures",
      });
    });
    products.data?.forEach((p) => {
      dynamic.push({
        type: "product",
        label: p.name,
        hint: `Stock : ${p.stock_quantity} · ${p.category || "—"}`,
        icon: Package,
        path: "/inventory",
        group: "Produits",
      });
    });
    tasks.data?.forEach((t) => {
      dynamic.push({
        type: "task",
        label: t.title,
        hint: `${t.status} · ${t.priority}`,
        icon: CheckSquare,
        path: "/work",
        group: "Tâches",
      });
    });
    return [...staticItems, ...dynamic];
  }, [employees.data, invoices.data, products.data, tasks.data]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return allItems.slice(0, 50);
    return allItems
      .filter((item) => `${item.label} ${item.hint} ${item.group}`.toLowerCase().includes(lowered))
      .slice(0, 80);
  }, [query, allItems]);

  const groups = useMemo(() => Array.from(new Set(filtered.map((item) => item.group))), [filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) onClose();
      }
      if (!open) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        select(filtered[activeIndex]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, filtered, onClose, open]);

  function select(item: CommandItem) {
    if (item.path) navigate(item.path);
    setQuery("");
    onClose();
  }

  if (!open) return null;

  const isLoading = employees.isLoading || invoices.isLoading || products.isLoading || tasks.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 px-4 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
          <Search size={18} className="text-stone-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher pages, factures, produits, employés, tâches…"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-stone-400"
          />
          {isLoading && <span className="text-xs text-stone-400">Chargement…</span>}
          <span className="rounded-md bg-black/[0.04] px-2 py-1 text-xs font-bold text-[#717182]">ESC</span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2">
          {filtered.length === 0 && !isLoading ? (
            <div className="px-4 py-10 text-center text-sm font-medium text-[#717182]">Aucun résultat pour "{query}"</div>
          ) : null}
          {groups.map((group) => (
            <div key={group} className="mb-2">
              <p className="px-2 py-1 text-[11px] font-bold uppercase text-stone-400">{group}</p>
              {filtered.filter((item) => item.group === group).map((item) => {
                const index = filtered.indexOf(item);
                const Icon = item.icon;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${item.group}-${item.label}-${index}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                      isActive ? "bg-emerald-50 text-emerald-800" : "text-ink hover:bg-stone-50"
                    }`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${isActive ? "bg-emerald-50 text-emerald-600" : "bg-black/[0.04] text-[#717182]"}`}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{item.label}</span>
                      <span className="block truncate text-xs font-medium text-[#717182]">{item.hint}</span>
                    </span>
                    {isActive ? <ArrowRight size={17} className="text-emerald-600" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-black/[0.05] px-4 py-2 text-[11px] font-semibold text-[#717182]">
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span className="ml-auto flex items-center gap-1 text-emerald-600"><Sparkles size={13} /> Recherche live</span>
        </div>
      </div>
    </div>
  );
}
