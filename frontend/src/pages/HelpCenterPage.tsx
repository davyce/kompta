import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ChevronDown, ChevronRight, ExternalLink, LifeBuoy, MessageSquare,
  Plus, Search, Send, Tag, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { shortDate } from "../utils/format";

/* ────────────────────────────────────────────────────────── types */
type Tab = "faq" | "guides" | "tickets" | "contact";

/* ────────────────────────────────────────────────────────── static data */
type Guide = { title: string; desc: string; steps: string[]; tag: string; icon: string };
type FaqEntry = { q: string; a: string; tag: string };

const STATUS_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  open: "blue",
  in_progress: "amber",
  resolved: "green",
  closed: "red",
};

/* ────────────────────────────────────────────────────────── sub-components */
function FaqItem({ q, a, tag }: { q: string; a: string; tag: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition ${open ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5" : "border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
      >
        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {tag}
        </span>
        <p className="flex-1 font-semibold text-[#17211f] dark:text-white">{q}</p>
        {open ? <ChevronDown size={18} className="shrink-0 text-emerald-600" /> : <ChevronRight size={18} className="shrink-0 text-[#717182]" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-sm leading-6 text-[#717182]">{a}</p>
        </div>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#1e2229]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-4 p-5 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-2xl dark:bg-emerald-500/10">
          {guide.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[#17211f] dark:text-white">{guide.title}</p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#717182] dark:bg-white/10 dark:text-white/50">
              {guide.tag}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#717182]">{guide.desc}</p>
        </div>
        {open ? <ChevronDown size={18} className="mt-1 shrink-0 text-emerald-600" /> : <ChevronRight size={18} className="mt-1 shrink-0 text-[#717182]" />}
      </button>
      {open && (
        <div className="border-t border-black/[0.06] px-5 pb-5 pt-4 dark:border-white/[0.06]">
          <ol className="space-y-2">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm text-[#17211f] dark:text-white">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── main page */
export function HelpCenterPage() {
  const { t: tr } = useTranslation();
  const FAQ_ITEMS = tr("helpCenter.faq", { returnObjects: true }) as FaqEntry[];
  const GUIDES = tr("helpCenter.guides", { returnObjects: true }) as Guide[];
  const STATUS_LABEL: Record<string, string> = { open: tr("helpCenter.statusOpen"), in_progress: tr("helpCenter.statusInProgress"), resolved: tr("helpCenter.statusResolved"), closed: tr("helpCenter.statusClosed") };
  const PRIORITY_LABEL: Record<string, string> = { low: tr("helpCenter.prioLow"), medium: tr("helpCenter.prioMedium"), high: tr("helpCenter.prioHigh"), critical: tr("helpCenter.prioCritical") };
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("faq");
  const [faqSearch, setFaqSearch] = useState("");
  const [newTicket, setNewTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");

  /* queries */
  const tickets = useQuery({ queryKey: ["myTickets"], queryFn: api.myTickets });
  const createTicket = useMutation({
    mutationFn: api.createTicket,
    onSuccess: () => {
      setNewTicket(false);
      setSubject("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["myTickets"] });
    },
  });

  /* FAQ filter */
  const filteredFaq = useMemo(() => {
    const q = faqSearch.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) =>
      `${item.q} ${item.a} ${item.tag}`.toLowerCase().includes(q)
    );
  }, [faqSearch, FAQ_ITEMS]);

  function submitTicket(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    createTicket.mutate({ subject, body, category, priority });
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "faq", label: tr("helpCenter.tabFaq"), icon: BookOpen },
    { key: "guides", label: tr("helpCenter.tabGuides"), icon: ChevronRight },
    { key: "tickets", label: `${tr("helpCenter.tabTickets")}${tickets.data?.length ? ` (${tickets.data.length})` : ""}`, icon: MessageSquare },
    { key: "contact", label: tr("helpCenter.tabContact"), icon: LifeBuoy },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-emerald-600">{tr("helpCenter.eyebrow")}</p>
        <h1 className="text-3xl font-black text-ink dark:text-white">{tr("helpCenter.title")}</h1>
        <p className="mt-1 text-sm text-[#717182]">{tr("helpCenter.subtitle")}</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-black/[0.06] bg-white text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* FAQ tab */}
      {tab === "faq" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <Search size={17} className="text-[#717182]" />
            <input
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder={tr("helpCenter.faqSearch")}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#17211f] outline-none placeholder:text-[#717182] dark:text-white"
            />
            {faqSearch && (
              <button onClick={() => setFaqSearch("")}>
                <X size={16} className="text-[#717182]" />
              </button>
            )}
          </div>
          {filteredFaq.length === 0 && (
            <p className="py-8 text-center text-sm text-[#717182]">
              {tr("helpCenter.noResult", { q: faqSearch })}
            </p>
          )}
          <div className="space-y-2">
            {filteredFaq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} tag={item.tag} />
            ))}
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {tr("helpCenter.notFoundAnswer")}{" "}
              <button onClick={() => setTab("contact")} className="underline underline-offset-2">
                {tr("helpCenter.openTicketArrow")}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Guides tab */}
      {tab === "guides" && (
        <div className="space-y-3">
          {GUIDES.map((guide, i) => (
            <GuideCard key={i} guide={guide} />
          ))}
          <div className="rounded-xl border border-sky-100 bg-sky-50 px-5 py-4 dark:border-sky-500/20 dark:bg-sky-500/5">
            <p className="font-semibold text-sky-800 dark:text-sky-200">{tr("helpCenter.fullDocs")}</p>
            <p className="mt-1 text-sm text-sky-700 dark:text-sky-300/80">
              {tr("helpCenter.fullDocsDesc")}
            </p>
            <a
              href="https://docs.kompta.app"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
            >
              <ExternalLink size={14} />
              docs.kompta.app
            </a>
          </div>
        </div>
      )}

      {/* Tickets tab */}
      {tab === "tickets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#717182]">
              {tickets.data?.length ? tr("helpCenter.ticketsCount", { count: tickets.data.length }) : tr("helpCenter.noTicketOpen")}
            </p>
            <button
              onClick={() => { setNewTicket(true); setTab("contact"); }}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Plus size={15} /> {tr("helpCenter.newTicket")}
            </button>
          </div>

          {!tickets.data?.length && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/[0.1] py-14 text-center dark:border-white/[0.1]">
              <LifeBuoy size={36} className="text-emerald-200" />
              <p className="font-semibold text-[#17211f] dark:text-white">{tr("helpCenter.noTicketsTitle")}</p>
              <p className="text-sm text-[#717182]">{tr("helpCenter.noTicketsDesc")}</p>
            </div>
          )}

          <div className="space-y-2">
            {tickets.data?.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.06] dark:bg-[#1e2229]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={STATUS_LABEL[ticket.status] ?? ticket.status}
                        tone={STATUS_TONE[ticket.status] ?? "blue"}
                      />
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#717182] dark:bg-white/10 dark:text-white/50">
                        {ticket.category}
                      </span>
                    </div>
                    <p className="mt-2 font-bold text-[#17211f] dark:text-white">{ticket.subject}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[#717182]">{ticket.body}</p>
                  </div>
                  <div className="text-right text-xs text-[#717182]">
                    <p className="font-semibold">{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</p>
                    <p className="mt-1">{shortDate(ticket.created_at)}</p>
                  </div>
                </div>

                {ticket.messages && ticket.messages.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-black/[0.04] pt-3 dark:border-white/[0.04]">
                    {ticket.messages.slice(-2).map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          msg.is_staff
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                            : "bg-stone-50 text-[#717182] dark:bg-white/[0.04] dark:text-white/60"
                        }`}
                      >
                        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {msg.is_staff ? tr("helpCenter.supportStaff") : tr("helpCenter.you")} · {shortDate(msg.created_at)}
                        </p>
                        <p className="whitespace-pre-wrap leading-5">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact / New ticket tab */}
      {tab === "contact" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Panel title={tr("helpCenter.openTicket")}>
            <form onSubmit={submitTicket} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                  {tr("helpCenter.subject")}
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr("helpCenter.subjectPlaceholder")}
                  required
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                    {tr("helpCenter.category")}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                  >
                    <option value="general">{tr("helpCenter.catGeneral")}</option>
                    <option value="technical">{tr("helpCenter.catTechnical")}</option>
                    <option value="billing">{tr("helpCenter.catBilling")}</option>
                    <option value="feature">{tr("helpCenter.catFeature")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                    {tr("helpCenter.priority")}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                  >
                    <option value="low">{tr("helpCenter.prioLow")}</option>
                    <option value="medium">{tr("helpCenter.prioMedium")}</option>
                    <option value="high">{tr("helpCenter.prioHigh")}</option>
                    <option value="critical">{tr("helpCenter.prioCritical")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                  {tr("helpCenter.descriptionLabel")}
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={tr("helpCenter.descPlaceholder")}
                  required
                  rows={6}
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={createTicket.isPending || !subject.trim() || !body.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300 dark:disabled:bg-white/10"
              >
                <Send size={16} />
                {createTicket.isPending ? tr("helpCenter.sending") : tr("helpCenter.sendTicket")}
              </button>

              {createTicket.isSuccess && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {tr("helpCenter.ticketSent")}
                  </p>
                  <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                    {tr("helpCenter.ticketSentDesc")}{" "}
                    <button onClick={() => setTab("tickets")} className="underline underline-offset-2">
                      {tr("helpCenter.viewMyTickets")}
                    </button>
                  </p>
                </div>
              )}

              {createTicket.error && (
                <p className="text-sm text-red-600">{createTicket.error.message}</p>
              )}
            </form>
          </Panel>

          {/* Sidebar info */}
          <div className="space-y-4">
            <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
              <div className="flex items-center gap-2">
                <LifeBuoy size={20} className="text-emerald-600" />
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("helpCenter.supportTitle")}</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#717182]">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">{tr("helpCenter.responseTime")}</span> {tr("helpCenter.responseTimeVal")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">{tr("helpCenter.criticalPrio")}</span> {tr("helpCenter.criticalPrioVal")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">{tr("helpCenter.emailLabel")}</span> support@kompta.app</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-amber-600 dark:text-amber-400" />
                <h3 className="font-bold text-amber-800 dark:text-amber-200">{tr("helpCenter.tipsTitle")}</h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-300/80">
                <li>• {tr("helpCenter.tip1")}</li>
                <li>• {tr("helpCenter.tip2")}</li>
                <li>• {tr("helpCenter.tip3")}</li>
                <li>• {tr("helpCenter.tip4")}</li>
              </ul>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{tr("helpCenter.quickAccess")}</p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setTab("faq")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <BookOpen size={15} className="text-emerald-600" /> {tr("helpCenter.tabFaq")}
                </button>
                <button
                  onClick={() => setTab("guides")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <BookOpen size={15} className="text-sky-600" /> {tr("helpCenter.guidesStep")}
                </button>
                <button
                  onClick={() => setTab("tickets")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <MessageSquare size={15} className="text-violet-600" /> {tr("helpCenter.myTickets")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
