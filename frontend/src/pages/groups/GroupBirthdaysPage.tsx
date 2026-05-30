import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import { api } from "../../services/api";

export function GroupBirthdaysPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { data: birthdays = [], isLoading } = useQuery({ queryKey: ["group-birthdays-all", id], queryFn: () => api.groupBirthdays(id) });
  const today = birthdays.filter(b => (b as { days_until: number }).days_until === 0);
  const week = birthdays.filter(b => { const d = (b as { days_until: number }).days_until; return d > 0 && d <= 7; });
  const month = birthdays.filter(b => { const d = (b as { days_until: number }).days_until; return d > 7 && d <= 30; });

  function Section({ title, items, accent }: { title: string; items: typeof birthdays; accent: string }) {
    if (!items.length) return null;
    return (
      <div>
        <p className="text-xs font-bold uppercase text-[#717182] mb-2">{title}</p>
        <div className="space-y-2">
          {items.map((b, i) => {
            const ev = b as { member_name?: string; days_until: number; start?: string };
            return (
              <div key={i} className={`flex items-center gap-3 rounded-xl border ${accent} bg-white dark:bg-[#1e2229] p-3`}>
                <span className="text-2xl">🎂</span>
                <div>
                  <p className="font-bold text-[#17211f] dark:text-white">{ev.member_name}</p>
                  <p className="text-xs text-[#717182]">{ev.days_until === 0 ? "🎉 Aujourd'hui !" : `Dans ${ev.days_until} jour(s)${ev.start ? ` · ${new Date(ev.start + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}`}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Gift size={20} className="text-rose-500" />
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">Anniversaires</h2>
      </div>
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-rose-500" /></div> : (
        <div className="space-y-5">
          <Section title="🎉 Aujourd'hui" items={today} accent="border-rose-300 dark:border-rose-500/40" />
          <Section title="Cette semaine" items={week} accent="border-amber-200 dark:border-amber-500/30" />
          <Section title="Ce mois" items={month} accent="border-black/[0.06] dark:border-white/[0.06]" />
          {birthdays.length === 0 && <p className="text-center text-sm text-[#717182] py-10">Aucune date de naissance renseignée chez les membres.</p>}
        </div>
      )}
    </div>
  );
}
