import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import { TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";

export function CompanyPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["company"], queryFn: api.company });
  const [form, setForm] = useState({ name: "", legal_name: "", industry: "", country: "", primary_color: "", accent_color: "" });
  const mutation = useMutation({
    mutationFn: api.updateCompany,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] })
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        legal_name: data.legal_name,
        industry: data.industry,
        country: data.country,
        primary_color: data.primary_color,
        accent_color: data.accent_color
      });
    }
  }, [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(form);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Entreprise et gouvernance</p>
        <h1 className="text-3xl font-black text-ink">Identite, marque et structure</h1>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Profil entreprise">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <TextInput label="Nom commercial" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <TextInput
              label="Raison sociale"
              value={form.legal_name}
              onChange={(event) => setForm({ ...form, legal_name: event.target.value })}
            />
            <TextInput
              label="Secteur"
              value={form.industry}
              onChange={(event) => setForm({ ...form, industry: event.target.value })}
            />
            <TextInput label="Pays" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
            <TextInput
              label="Couleur principale"
              value={form.primary_color}
              onChange={(event) => setForm({ ...form, primary_color: event.target.value })}
            />
            <TextInput
              label="Couleur accent"
              value={form.accent_color}
              onChange={(event) => setForm({ ...form, accent_color: event.target.value })}
            />
            <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white md:col-span-2">Enregistrer</button>
          </form>
        </Panel>
        <Panel title="Apercu documents">
          <div className="rounded-lg border border-stone-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black">{form.name || "KOMPTA"}</p>
                <p className="text-sm text-stone-500">{form.legal_name}</p>
              </div>
              <div className="h-10 w-10 rounded-lg" style={{ background: form.primary_color || "#0f766e" }} />
            </div>
            <div className="mt-6 space-y-2">
              <div className="h-3 rounded bg-stone-100" />
              <div className="h-3 w-3/4 rounded bg-stone-100" />
              <div className="h-3 w-1/2 rounded" style={{ background: form.accent_color || "#f59e0b" }} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <StatusBadge label={`Completion ${data?.completion_score ?? 0}%`} tone="green" />
            <StatusBadge label={data?.organization_type ?? "PME"} tone="blue" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
