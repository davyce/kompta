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
import { useTranslation } from "react-i18next";

import { api } from "../services/api";
import { useAuth } from "../app/AuthContext";

type CommandItem = {
  type: "page" | "action" | "person" | "invoice" | "product" | "task" | "client";
  label: string;
  hint: string;
  icon: LucideIcon;
  path?: string;
  group: string;
};
type StaticCommandItem = Omit<CommandItem, "label" | "hint" | "group"> & {
  labelTk: string;
  hintTk: string;
  groupTk: string;
};

/* Static pages and quick actions */
const staticItems: StaticCommandItem[] = [
  { type: "page", labelTk: "components.command.pages.dashboard.label", hintTk: "components.command.pages.dashboard.hint", icon: LayoutDashboard, path: "/", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.company.label", hintTk: "components.command.pages.company.hint", icon: Building2, path: "/company", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.hr.label", hintTk: "components.command.pages.hr.hint", icon: Users, path: "/employees", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.documents.label", hintTk: "components.command.pages.documents.hint", icon: FolderArchive, path: "/documents", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.payroll.label", hintTk: "components.command.pages.payroll.hint", icon: HandCoins, path: "/payroll", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.accounting.label", hintTk: "components.command.pages.accounting.hint", icon: Calculator, path: "/accounting", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.billing.label", hintTk: "components.command.pages.billing.hint", icon: ReceiptText, path: "/billing", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.pos.label", hintTk: "components.command.pages.pos.hint", icon: ShoppingCart, path: "/pos", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.inventory.label", hintTk: "components.command.pages.inventory.hint", icon: Boxes, path: "/inventory", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.projects.label", hintTk: "components.command.pages.projects.hint", icon: CheckSquare, path: "/projects", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.chat.label", hintTk: "components.command.pages.chat.hint", icon: MessageSquare, path: "/chat", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.calendar.label", hintTk: "components.command.pages.calendar.hint", icon: CalendarDays, path: "/calendar", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.notes.label", hintTk: "components.command.pages.notes.hint", icon: FileText, path: "/notes", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.reports.label", hintTk: "components.command.pages.reports.hint", icon: ChartNoAxesCombined, path: "/reports", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.declarations.label", hintTk: "components.command.pages.declarations.hint", icon: ClipboardList, path: "/declarations", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.assistants.label", hintTk: "components.command.pages.assistants.hint", icon: Bot, path: "/assistants", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.teras.label", hintTk: "components.command.pages.teras.hint", icon: ShieldCheck, path: "/reports-teras", groupTk: "components.command.groups.pages" },
  { type: "page", labelTk: "components.command.pages.settings.label", hintTk: "components.command.pages.settings.hint", icon: Settings, path: "/settings", groupTk: "components.command.groups.pages" },
  { type: "action", labelTk: "components.command.actions.createInvoice.label", hintTk: "components.command.actions.createInvoice.hint", icon: Plus, path: "/billing", groupTk: "components.command.groups.quickActions" },
  { type: "action", labelTk: "components.command.actions.runPayroll.label", hintTk: "components.command.actions.runPayroll.hint", icon: HandCoins, path: "/payroll", groupTk: "components.command.groups.quickActions" },
  { type: "action", labelTk: "components.command.actions.addEmployee.label", hintTk: "components.command.actions.addEmployee.hint", icon: Users, path: "/employees", groupTk: "components.command.groups.quickActions" },
  { type: "action", labelTk: "components.command.actions.uploadDocument.label", hintTk: "components.command.actions.uploadDocument.hint", icon: FileText, path: "/documents", groupTk: "components.command.groups.quickActions" },
  { type: "action", labelTk: "components.command.actions.askTeras.label", hintTk: "components.command.actions.askTeras.hint", icon: Sparkles, path: "/reports-teras", groupTk: "components.command.groups.quickActions" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Debounce input by 250ms to avoid jitter on fast typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 250);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const isMemberGroup = user?.role === "membre_groupe";

  /* Live data — fetched lazily once palette opens */
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees, enabled: open && !isMemberGroup, staleTime: 60_000 });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices, enabled: open, staleTime: 60_000 });
  const products = useQuery({ queryKey: ["products"], queryFn: api.products, enabled: open, staleTime: 60_000 });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks, enabled: open, staleTime: 60_000 });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => api.clients(), enabled: open, staleTime: 60_000 });

  /* Build full searchable list from real data */
  const allItems = useMemo<CommandItem[]>(() => {
    const dynamic: CommandItem[] = [];
    const localizedStatic = staticItems.map((item) => ({
      ...item,
      label: tr(item.labelTk),
      hint: tr(item.hintTk),
      group: tr(item.groupTk),
    }));
    employees.data?.forEach((e) => {
      dynamic.push({
        type: "person",
        label: `${e.first_name} ${e.last_name}`,
        hint: `${e.job_title || "—"} · ${e.department || "—"}`,
        icon: Users,
        path: "/employees",
        group: tr("components.command.groups.people"),
      });
    });
    invoices.data?.forEach((inv) => {
      dynamic.push({
        type: "invoice",
        label: `${inv.number} · ${inv.customer_name}`,
        hint: tr("components.command.dynamic.invoiceHint", { status: inv.status }),
        icon: ReceiptText,
        path: "/billing",
        group: tr("components.command.groups.invoices"),
      });
    });
    products.data?.forEach((p) => {
      dynamic.push({
        type: "product",
        label: p.name,
        hint: tr("components.command.dynamic.stockHint", { stock: p.stock_quantity, category: p.category || "—" }),
        icon: Package,
        path: "/inventory",
        group: tr("components.command.groups.products"),
      });
    });
    clients.data?.forEach((c) => {
      dynamic.push({
        type: "client",
        label: c.name,
        hint: tr("components.command.dynamic.clientHint", { detail: c.city || c.country || c.email || "—" }),
        icon: Users,
        path: "/clients",
        group: tr("components.command.groups.clients"),
      });
    });
    tasks.data?.forEach((t) => {
      dynamic.push({
        type: "task",
        label: t.title,
        hint: `${t.status} · ${t.priority}`,
        icon: CheckSquare,
        path: "/work",
        group: tr("components.command.groups.tasks"),
      });
    });
    return [...localizedStatic, ...dynamic];
  }, [employees.data, invoices.data, products.data, tasks.data, clients.data, tr]);

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
    setRawQuery("");
    setQuery("");
    onClose();
  }

  if (!open) return null;

  const isLoading = employees.isLoading || invoices.isLoading || products.isLoading || tasks.isLoading || clients.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 px-4 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
          <Search size={18} className="text-stone-400" />
          <input
            autoFocus
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            placeholder={tr("components.command.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-stone-400"
          />
          {isLoading && <span className="text-xs text-stone-400">{tr("common.loading")}</span>}
          <span className="rounded-md bg-black/[0.04] px-2 py-1 text-xs font-bold text-[#717182]">ESC</span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2">
          {filtered.length === 0 && !isLoading ? (
            <div className="px-4 py-10 text-center text-sm font-medium text-[#717182]">{tr("components.command.noResult", { query })}</div>
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
          <span>{tr("components.command.footer.navigate")}</span>
          <span>{tr("components.command.footer.open")}</span>
          <span className="ml-auto flex items-center gap-1 text-emerald-600"><Sparkles size={13} /> {tr("components.command.footer.liveSearch")}</span>
        </div>
      </div>
    </div>
  );
}
