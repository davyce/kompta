import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, Vote, Gift, Loader2 } from "lucide-react";
import { api } from "../../services/api";
import type { GroupCalendarEvent } from "../../types/domain";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  meeting:  { icon: Calendar, color: "text-sky-600", bg: "bg-sky-100 dark:bg-sky-500/15" },
  activity: { icon: Users,    color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-500/15" },
  vote:     { icon: Vote,     color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-500/15" },
  birthday: { icon: Gift,     color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-500/15" },
};

function fmtDate(dateStr: string) {
  try { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateStr)); }
  catch { return dateStr; }
}

export function GroupCalendarPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { data, isLoading } = useQuery({ queryKey: ["group-calendar", id], queryFn: () => api.groupCalendar(id) });
  const events = data?.events ?? [];
  const byDate: Record<string, GroupCalendarEvent[]> = {};
  for (const e of events) {
    const d = e.start ? String(e.start).split("T")[0] : "?";
    (byDate[d] = byDate[d] ?? []).push(e);
  }

  return (
    <div className="p-6 space-y-5">
      <h2 className="text-xl font-black text-[#17211f] dark:text-white">Calendrier du groupe</h2>
      <div className="flex gap-3 flex-wrap">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
          <div key={type} className={`flex items-center gap-1.5 rounded-full ${cfg.bg} px-3 py-1 text-xs font-bold ${cfg.color}`}>
            <cfg.icon size={11} /> {type === "meeting" ? "Réunions" : type === "activity" ? "Activités" : type === "vote" ? "Votes" : "Anniversaires"}
          </div>
        ))}
      </div>
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-violet-500" /></div> :
        events.length === 0 ? <p className="text-center text-sm text-[#717182] py-12">Aucun événement à venir.</p> :
        <div className="space-y-4">
          {Object.entries(byDate).sort().map(([date, evs]) => (
            <div key={date}>
              <p className="text-xs font-bold uppercase text-[#717182] mb-2">{date === "?" ? "Date inconnue" : new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              <div className="space-y-2">
                {evs.map((ev, i) => {
                  const cfg = TYPE_CONFIG[ev.type] ?? { icon: Calendar, color: "text-gray-600", bg: "bg-gray-100" };
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`flex items-start gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3`}>
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cfg.bg}`}><Icon size={16} className={cfg.color} /></div>
                      <div>
                        <p className="font-bold text-sm text-[#17211f] dark:text-white">{ev.title}</p>
                        {ev.start && typeof ev.start === "string" && ev.start.includes("T") && <p className="text-xs text-[#717182]">{fmtDate(ev.start)}</p>}
                        {ev.location && <p className="text-xs text-[#717182]">📍 {ev.location}</p>}
                        {(ev as { days_until?: number }).days_until !== undefined && <p className="text-xs font-semibold text-rose-600">{(ev as { days_until: number }).days_until === 0 ? "🎉 Aujourd'hui !" : `Dans ${(ev as { days_until: number }).days_until} jour(s)`}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
