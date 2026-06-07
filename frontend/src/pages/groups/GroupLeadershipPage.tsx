import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, X, Loader2, History, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

export function GroupLeadershipPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [showChange, setShowChange] = useState(false);
  const [form, setForm] = useState({ president_member_id: "", vice_president_member_id: "", secretary_member_id: "", treasurer_member_id: "", mandate_start: "", elected_by: "", election_notes: "" });

  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: leadership } = useQuery({ queryKey: ["group-leadership", id], queryFn: () => api.groupLeadership(id) });
  const { data: members = [] } = useQuery({ queryKey: ["group-members", id], queryFn: () => api.groupMembers(id) });

  const change = useMutation({
    mutationFn: () => api.changeLeadership(id, {
      president_member_id: form.president_member_id ? Number(form.president_member_id) : undefined,
      vice_president_member_id: form.vice_president_member_id ? Number(form.vice_president_member_id) : undefined,
      secretary_member_id: form.secretary_member_id ? Number(form.secretary_member_id) : undefined,
      treasurer_member_id: form.treasurer_member_id ? Number(form.treasurer_member_id) : undefined,
      mandate_start: form.mandate_start || undefined,
      elected_by: form.elected_by, election_notes: form.election_notes,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-leadership", id] }); setShowChange(false); },
  });

  const memberName = (mid: number | null) => members.find(m => m.id === mid)?.full_name ?? "—";
  const current = leadership?.current;
  const history = leadership?.history ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.leadership.title")}</h2>
        {group?.can_manage && (
          <button onClick={() => setShowChange(true)} className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 transition">
            <Crown size={15} /> {tr("groupPages.leadership.changeOffice")}
          </button>
        )}
      </div>

      {/* Bureau actuel */}
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5">
        <div className="flex items-center gap-2 mb-4"><Crown size={16} className="text-amber-500" /><h3 className="font-black text-[#17211f] dark:text-white">{tr("groupPages.leadership.currentOffice")}</h3></div>
        {current ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { tk: "groupPages.leadership.roles.president", mid: current.president_member_id },
              { tk: "groupPages.leadership.roles.vicePresident", mid: current.vice_president_member_id },
              { tk: "groupPages.leadership.roles.secretary", mid: current.secretary_member_id },
              { tk: "groupPages.leadership.roles.treasurer", mid: current.treasurer_member_id },
            ].map(({ tk, mid }) => (
              <div key={tk} className="flex items-center gap-2.5 rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3 min-w-0">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 dark:bg-amber-500/15"><Crown size={14} className="text-amber-600" /></div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-[#717182] truncate">{tr(tk)}</p>
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{memberName(mid)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[#717182]">{tr("groupPages.leadership.noCurrentOffice")}</p>}
        {current?.mandate_start && <p className="mt-3 text-xs text-[#717182]">{tr("groupPages.leadership.mandateSince", { date: new Date(current.mandate_start + "T12:00:00").toLocaleDateString(i18n.language, { dateStyle: "long" }) })}</p>}
      </div>

      {/* Historique */}
      {history.filter(h => !h.is_current).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3"><History size={14} className="text-[#717182]" /><p className="text-sm font-bold uppercase text-[#717182]">{tr("groupPages.leadership.oldOffices")}</p></div>
          <div className="space-y-2">
            {history.filter(h => !h.is_current).map(h => (
              <div key={h.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3">
                <p className="text-xs text-[#717182]">
                  {h.mandate_start ? new Date(h.mandate_start + "T12:00:00").toLocaleDateString(i18n.language) : tr("groupPages.leadership.unknownDate")} — {h.mandate_end ? new Date(h.mandate_end + "T12:00:00").toLocaleDateString(i18n.language) : tr("groupPages.leadership.unknownDate")}
                </p>
                <p className="text-sm font-semibold text-[#17211f] dark:text-white">{tr("groupPages.leadership.presidentShort")} {memberName(h.president_member_id)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal changement bureau */}
      {showChange && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.leadership.changeOffice")}</h3><button onClick={() => setShowChange(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              {[
                { label: tr("groupPages.leadership.roles.president"), field: "president_member_id" },
                { label: tr("groupPages.leadership.roles.vicePresident"), field: "vice_president_member_id" },
                { label: tr("groupPages.leadership.roles.secretary"), field: "secretary_member_id" },
                { label: tr("groupPages.leadership.roles.treasurer"), field: "treasurer_member_id" },
              ].map(({ label, field }) => (
                <label key={field} className="block text-xs font-bold uppercase text-[#717182]">
                  {label}
                  <select value={(form as Record<string, string>)[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">
                    <option value="">{tr("groupPages.leadership.notDefined")}</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </label>
              ))}
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.leadership.form.startDate")}<input type="date" value={form.mandate_start} onChange={e => setForm(f => ({...f, mandate_start: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.leadership.form.electedBy")}<input value={form.elected_by} onChange={e => setForm(f => ({...f, elected_by: e.target.value}))} placeholder={tr("groupPages.leadership.form.electedByPlaceholder")} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.leadership.form.electionNotes")}<textarea value={form.election_notes} onChange={e => setForm(f => ({...f, election_notes: e.target.value}))} rows={2} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
            </div>
            <button disabled={change.isPending} onClick={() => change.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:bg-stone-300 transition">
              {change.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />} {tr("groupPages.leadership.confirmChange")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
