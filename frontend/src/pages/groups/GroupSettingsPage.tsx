import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Settings, Loader2, Save, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { useConfirm } from "../../components/ConfirmProvider";

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

export function GroupSettingsPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [city, setCity] = useState(group?.city ?? "");
  const [closeReason, setCloseReason] = useState("");

  useEffect(() => {
    if (!group) return;
    setName(group.name ?? "");
    setDescription(group.description ?? "");
    setCity(group.city ?? "");
  }, [group]);

  const save = useMutation({
    mutationFn: () => api.updateGroup(id, { name, description, city }),
    onSuccess: () => {
      toast.success(tr("groupPages.settings.saved"));
      qc.invalidateQueries({ queryKey: ["group", id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tr("groupPages.settings.saveFailed")),
  });

  const leave = useMutation({
    mutationFn: () => api.leaveGroup(id),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["groups"] });
      navigate("/groups", { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tr("groupPages.settings.leaveFailed")),
  });

  const close = useMutation({
    mutationFn: () => api.closeGroup(id, closeReason.trim()),
    onSuccess: () => {
      toast.success(tr("groupPages.settings.closed"));
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group", id] });
      navigate("/groups", { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tr("groupPages.settings.closeFailed")),
  });

  async function handleLeave() {
    const ok = await confirm({
      title: tr("groupPages.settings.confirmLeaveTitle", { name: group?.name }),
      message: tr("groupPages.settings.confirmLeaveMessage"),
      confirmLabel: tr("groupPages.settings.leaveGroup"),
      danger: true,
    });
    if (ok) leave.mutate();
  }

  async function handleCloseGroup() {
    const ok = await confirm({
      title: tr("groupPages.settings.confirmCloseTitle", { name: group?.name }),
      message: tr("groupPages.settings.confirmCloseMessage"),
      confirmLabel: tr("groupPages.settings.closeGroup"),
      danger: true,
      requireAcknowledge: tr("groupPages.settings.closeAcknowledge"),
    });
    if (ok) close.mutate();
  }

  if (!group) return <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-blue-700" /></div>;

  const isPresident = group.my_roles?.includes("Président") ?? false;

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div className="flex items-center gap-2"><Settings size={18} className="text-[#717182]" /><h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.settings.title")}</h2></div>
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5 space-y-4">
        <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.settings.groupName")}
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.settings.city")}
          <input value={city} onChange={e => setCity(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.settings.description")}
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
            <p className="text-xs text-[#717182]">{tr("groupPages.meetings.form.type")}</p><p className="font-bold text-[#17211f] dark:text-white capitalize">{tr(GROUP_TYPE_TK[group.type] ?? "groupPages.dashboard.groupTypes.unknown", { defaultValue: group.type })}</p>
          </div>
          <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
            <p className="text-xs text-[#717182]">{tr("groupPages.settings.currency")}</p><p className="font-bold text-[#17211f] dark:text-white">{group.currency}</p>
          </div>
        </div>
      </div>
      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-black text-white hover:bg-blue-900 disabled:opacity-60 transition">
        {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {tr("common.save")}
      </button>

      {/* Zone danger — quitter le groupe */}
      <div className="mt-8 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/5 p-5">
        <h3 className="font-bold text-rose-700 dark:text-rose-400 mb-2">{tr("groupPages.settings.dangerZone")}</h3>
        <p className="text-sm text-[#717182] mb-4">
          {tr("groupPages.settings.leaveWarning")}
        </p>
        <button
          onClick={handleLeave}
          disabled={leave.isPending}
          className="flex items-center gap-2 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-[#1e2229] px-4 py-2.5 text-sm font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50 transition"
        >
          {leave.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
          {tr("groupPages.settings.leaveGroup")}
        </button>

        {isPresident && (
          <div className="mt-5 border-t border-rose-200 pt-5 dark:border-rose-500/20">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="text-sm text-rose-800 dark:text-rose-200">
                {tr("groupPages.settings.presidentCloseInfo")}
              </p>
            </div>
            <label className="block text-xs font-bold uppercase text-rose-700 dark:text-rose-300">
              {tr("groupPages.settings.closeReason")}
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={2}
                placeholder={tr("groupPages.settings.closeReasonPlaceholder")}
                className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none focus:border-rose-500 dark:border-rose-500/30 dark:bg-[#252931] dark:text-white"
              />
            </label>
            <button
              onClick={handleCloseGroup}
              disabled={close.isPending}
              className="mt-3 flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50 transition"
            >
              {close.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              {tr("groupPages.settings.closeGroup")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
