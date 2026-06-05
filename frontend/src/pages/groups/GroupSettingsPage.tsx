import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Settings, Loader2, Save, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { useConfirm } from "../../components/ConfirmProvider";

export function GroupSettingsPage() {
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
      toast.success("Paramètres enregistrés");
      qc.invalidateQueries({ queryKey: ["group", id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer les paramètres"),
  });

  const leave = useMutation({
    mutationFn: () => api.leaveGroup(id),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["groups"] });
      navigate("/groups", { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Impossible de quitter le groupe"),
  });

  const close = useMutation({
    mutationFn: () => api.closeGroup(id, closeReason.trim()),
    onSuccess: () => {
      toast.success("Groupe fermé. Il ne sera plus listé dans les groupes actifs.");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group", id] });
      navigate("/groups", { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Impossible de fermer le groupe"),
  });

  async function handleLeave() {
    const ok = await confirm({
      title: `Quitter "${group?.name}" ?`,
      message: "Tu perdras l'accès au groupe (chat, cotisations, documents). Tu pourras être réinvité plus tard.",
      confirmLabel: "Quitter le groupe",
      danger: true,
    });
    if (ok) leave.mutate();
  }

  async function handleCloseGroup() {
    const ok = await confirm({
      title: `Fermer définitivement "${group?.name}" ?`,
      message: "Le groupe sortira de la liste active. Les historiques, paiements, documents et audits restent conservés.",
      confirmLabel: "Fermer le groupe",
      danger: true,
      requireAcknowledge: "Je comprends que cette action retire le groupe des groupes actifs.",
    });
    if (ok) close.mutate();
  }

  if (!group) return <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-blue-700" /></div>;

  const isPresident = group.my_roles?.includes("Président") ?? false;

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div className="flex items-center gap-2"><Settings size={18} className="text-[#717182]" /><h2 className="text-xl font-black text-[#17211f] dark:text-white">Paramètres du groupe</h2></div>
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5 space-y-4">
        <label className="block text-xs font-bold uppercase text-[#717182]">Nom du groupe
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">Ville
          <input value={city} onChange={e => setCity(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
            <p className="text-xs text-[#717182]">Type</p><p className="font-bold text-[#17211f] dark:text-white capitalize">{group.type}</p>
          </div>
          <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
            <p className="text-xs text-[#717182]">Devise</p><p className="font-bold text-[#17211f] dark:text-white">{group.currency}</p>
          </div>
        </div>
      </div>
      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-black text-white hover:bg-blue-900 disabled:opacity-60 transition">
        {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Sauvegarder
      </button>

      {/* Zone danger — quitter le groupe */}
      <div className="mt-8 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/5 p-5">
        <h3 className="font-bold text-rose-700 dark:text-rose-400 mb-2">Zone sensible</h3>
        <p className="text-sm text-[#717182] mb-4">
          Quitter ce groupe est définitif — tu perdras l'accès au chat, cotisations, documents.
          Tes paiements passés et l'historique restent dans le groupe.
        </p>
        <button
          onClick={handleLeave}
          disabled={leave.isPending}
          className="flex items-center gap-2 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-[#1e2229] px-4 py-2.5 text-sm font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50 transition"
        >
          {leave.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
          Quitter le groupe
        </button>

        {isPresident && (
          <div className="mt-5 border-t border-rose-200 pt-5 dark:border-rose-500/20">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="text-sm text-rose-800 dark:text-rose-200">
                En tant que Président, tu peux fermer le groupe. Cette action désactive le groupe actif sans supprimer les historiques.
              </p>
            </div>
            <label className="block text-xs font-bold uppercase text-rose-700 dark:text-rose-300">
              Motif de fermeture
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={2}
                placeholder="Ex: fusion avec un autre groupe, activité terminée..."
                className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none focus:border-rose-500 dark:border-rose-500/30 dark:bg-[#252931] dark:text-white"
              />
            </label>
            <button
              onClick={handleCloseGroup}
              disabled={close.isPending}
              className="mt-3 flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50 transition"
            >
              {close.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Fermer le groupe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
