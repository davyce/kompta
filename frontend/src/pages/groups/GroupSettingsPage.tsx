import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { api } from "../../services/api";

export function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [city, setCity] = useState(group?.city ?? "");

  const save = useMutation({
    mutationFn: () => api.updateGroup(id, { name, description, city }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", id] }),
  });

  if (!group) return <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-violet-500" /></div>;

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div className="flex items-center gap-2"><Settings size={18} className="text-[#717182]" /><h2 className="text-xl font-black text-[#17211f] dark:text-white">Paramètres du groupe</h2></div>
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5 space-y-4">
        <label className="block text-xs font-bold uppercase text-[#717182]">Nom du groupe
          <input value={name || group.name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-violet-500" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">Ville
          <input value={city || group.city} onChange={e => setCity(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
        </label>
        <label className="block text-xs font-bold uppercase text-[#717182]">Description
          <textarea value={description || group.description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
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
        className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60 transition">
        {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Sauvegarder
      </button>
      {save.isSuccess && <p className="text-sm text-emerald-600 font-semibold">✅ Modifications enregistrées</p>}
    </div>
  );
}
