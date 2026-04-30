import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

export function AdminLogsPage() {
  const [search, setSearch] = useState("");
  const logs = useQuery({ queryKey: ["adminAuditLogs"], queryFn: () => api.adminAuditLogs(150) });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs.data ?? []).filter((log) => {
      if (!q) return true;
      return `${log.actor_name} ${log.target_name} ${log.action} ${log.details}`.toLowerCase().includes(q);
    });
  }, [logs.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Observabilite</p>
          <h1 className="text-3xl font-black">Audit & logs</h1>
          <p className="mt-1 text-sm text-white/60">Journal centralise des actions sensibles et operations support.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-black">{filtered.length}</p>
          <p className="text-[10px] font-bold uppercase text-white/40">evenements</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <Search size={18} className="text-white/40" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filtrer action, acteur, details..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
        />
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-2">
          {filtered.map((log) => (
            <article key={log.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-200">
                  <Activity size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{log.action}</p>
                  <p className="truncate text-xs text-white/50">
                    {log.actor_name} {"->"} {log.target_name || "systeme"} · {log.details}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-white/45">
                <Database size={14} />
                tenant #{log.company_id} · {shortDate(log.created_at)}
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && <p className="py-12 text-center text-sm font-semibold text-white/40">Aucun log disponible.</p>}
      </section>
    </div>
  );
}
