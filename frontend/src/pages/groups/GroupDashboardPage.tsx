import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Wallet, TrendingDown, Clock, Calendar, AlertTriangle, Gift, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#717182]">{label}</p>
          <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-[11px] text-[#717182] mt-0.5">{sub}</p>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${color.includes("violet") ? "bg-blue-50 dark:bg-blue-800/10" : color.includes("emerald") ? "bg-emerald-50 dark:bg-emerald-500/10" : color.includes("rose") ? "bg-rose-50 dark:bg-rose-500/10" : color.includes("amber") ? "bg-amber-50 dark:bg-amber-500/10" : "bg-sky-50 dark:bg-sky-500/10"}`}>
          <Icon size={18} className={color} />
        </div>
      </div>
    </div>
  );
}

const GROUP_TYPE_TK: Record<string, string> = {
  association: "groupPages.dashboard.groupTypes.association",
  tontine: "groupPages.dashboard.groupTypes.tontine",
  mutuelle: "groupPages.dashboard.groupTypes.mutual",
  église: "groupPages.dashboard.groupTypes.church",
  ONG: "groupPages.dashboard.groupTypes.ngo",
  "club sportif": "groupPages.dashboard.groupTypes.sportsClub",
  famille: "groupPages.dashboard.groupTypes.family",
  syndicat: "groupPages.dashboard.groupTypes.union",
  coopérative: "groupPages.dashboard.groupTypes.cooperative",
  "association étudiante": "groupPages.dashboard.groupTypes.studentAssociation",
  "comité de quartier": "groupPages.dashboard.groupTypes.neighborhoodCommittee",
  "organisation professionnelle": "groupPages.dashboard.groupTypes.professionalOrganization",
};

function fmtAmount(v: number, currency = "XAF") {
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency, minimumFractionDigits: 0 }).format(v);
}

export function GroupDashboardPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);

  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: dash, isLoading } = useQuery({ queryKey: ["group-finance-dash", id], queryFn: () => api.groupFinanceDashboard(id) });
  const { data: meetings = [] } = useQuery({ queryKey: ["group-meetings", id], queryFn: () => api.groupMeetings(id) });
  const { data: birthdays = [] } = useQuery({ queryKey: ["group-birthdays", id], queryFn: () => api.groupBirthdays(id) });

  const upcomingMeetings = meetings.filter(m => m.status === "scheduled").slice(0, 3);
  const soonBirthdays = birthdays.filter(b => (b as { days_until?: number }).days_until !== undefined && (b as { days_until: number }).days_until <= 14).slice(0, 5);
  const currency = group?.currency ?? "XAF";
  const groupType = group?.type ? tr(GROUP_TYPE_TK[group.type] ?? "groupPages.dashboard.groupTypes.unknown", { defaultValue: group.type }) : "";

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 size={28} className="animate-spin text-blue-700" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">{group?.name}</h2>
        <p className="text-sm text-[#717182] capitalize">{[groupType, group?.city].filter(Boolean).join(" · ")}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={tr("groupPages.dashboard.cashBalance")} value={fmtAmount(dash?.balance ?? 0, currency)} icon={Wallet} color="text-blue-800" />
        <StatCard label={tr("groupPages.dashboard.activeMembers")} value={dash?.members_count ?? 0} sub={tr("groupPages.dashboard.upToDate", { count: dash?.members_up_to_date ?? 0 })} icon={Users} color="text-sky-600" />
        <StatCard label={tr("groupPages.dashboard.lateMembers")} value={dash?.members_late ?? 0} icon={Clock} color="text-rose-600" />
        <StatCard label={tr("groupPages.dashboard.pendingExpenses")} value={dash?.pending_expenses ?? 0} icon={TrendingDown} color="text-amber-600" />
      </div>

      {/* Progress bar cotisations */}
      {(dash?.total_contributions_expected ?? 0) > 0 && (
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-[#17211f] dark:text-white">{tr("groupPages.dashboard.recoveryRate")}</p>
            <p className="text-sm font-black text-blue-800">
              {Math.round(100 * (dash?.total_contributions_received ?? 0) / (dash?.total_contributions_expected ?? 1))}%
            </p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-700 to-blue-800 transition-all"
              style={{ width: `${Math.min(100, Math.round(100 * (dash?.total_contributions_received ?? 0) / (dash?.total_contributions_expected ?? 1)))}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-[#717182]">
            <span>{tr("groupPages.dashboard.received", { amount: fmtAmount(dash?.total_contributions_received ?? 0, currency) })}</span>
            <span>{tr("groupPages.dashboard.expected", { amount: fmtAmount(dash?.total_contributions_expected ?? 0, currency) })}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prochaines réunions */}
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-sky-500" />
            <h3 className="font-bold text-[#17211f] dark:text-white text-sm">{tr("groupPages.dashboard.nextMeetings")}</h3>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-sm text-[#717182]">{tr("groupPages.meetings.empty")}</p>
          ) : upcomingMeetings.map(m => (
            <div key={m.id} className="flex items-start gap-2 py-2 border-t border-black/[0.04] dark:border-white/[0.04] first:border-0">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-500/15 grid place-items-center">
                <Calendar size={13} className="text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#17211f] dark:text-white">{m.title}</p>
                <p className="text-xs text-[#717182]">{new Date(m.start_datetime).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Anniversaires prochains */}
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} className="text-rose-500" />
            <h3 className="font-bold text-[#17211f] dark:text-white text-sm">{tr("groupPages.dashboard.birthdays14")}</h3>
          </div>
          {soonBirthdays.length === 0 ? (
            <p className="text-sm text-[#717182]">{tr("groupPages.dashboard.noBirthdays14")}</p>
          ) : soonBirthdays.map((b, i) => {
            const ev = b as { member_name?: string; days_until: number; title: string };
            return (
              <div key={i} className="flex items-center gap-2 py-2 border-t border-black/[0.04] dark:border-white/[0.04] first:border-0">
                <span className="text-lg">🎂</span>
                <div>
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white">{ev.member_name}</p>
                  <p className="text-xs text-[#717182]">{ev.days_until === 0 ? tr("groupPages.birthdays.todayBang") : tr("groupPages.birthdays.inDays", { count: ev.days_until, date: "" })}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alertes */}
      {(dash?.members_late ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-bold">{tr("groupPages.dashboard.lateMembersCount", { count: dash?.members_late ?? 0 })}</span> {tr("groupPages.dashboard.lateContribution")}
            {tr("groupPages.dashboard.goTo")} <strong>{tr("groupPages.layout.nav.contributions")}</strong> {tr("groupPages.dashboard.sendReminders")}
          </p>
        </div>
      )}
    </div>
  );
}
