import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldOff, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";

import { api } from "../../services/api";

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const users = useQuery({ queryKey: ["adminUsers", search], queryFn: () => api.adminUsers({ search }) });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminUpdateUserStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminUsers"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">IAM</p>
          <h1 className="text-3xl font-black">Utilisateurs plateforme</h1>
          <p className="mt-1 text-sm text-white/60">Recherche cross-tenant, statut de comptes et roles.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-black">{users.data?.length ?? "..."}</p>
          <p className="text-[10px] font-bold uppercase text-white/40">comptes</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <Search size={18} className="text-white/40" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher nom ou email..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Entreprise</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Equipe</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.data?.map((user) => (
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black">
                        {user.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                      </span>
                      <div>
                        <p className="font-bold">{user.full_name}</p>
                        <p className="text-xs text-white/50">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">{user.company_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-200">{user.role}</span>
                  </td>
                  <td className="px-4 py-3 text-white/60">{user.department} · {user.branch}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${user.account_status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                      {user.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={user.role === "super_admin"}
                      onClick={() => updateStatus.mutate({ id: user.id, status: user.account_status === "active" ? "suspended" : "active" })}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
                    >
                      {user.account_status === "active" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                      {user.account_status === "active" ? "Suspendre" : "Reactiver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!users.data?.length && (
          <div className="grid place-items-center py-16 text-white/40">
            <Users size={36} />
            <p className="mt-3 text-sm font-semibold">Aucun utilisateur trouve.</p>
          </div>
        )}
      </section>
    </div>
  );
}
