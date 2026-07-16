import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, ShieldCheck, Check, X, Users } from "lucide-react";

import { api } from "../../services/api";
import type { CustomRole } from "../../types/domain";

/**
 * Réglages → Rôles & accès (entreprise).
 * - Créer / modifier / supprimer des rôles personnalisés avec permissions par module.
 * - Attribuer un rôle à chaque membre de l'entreprise (limite les modules visibles).
 */

const COLORS = ["#6366f1", "#047857", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function RolesSettings() {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["customRoles"], queryFn: () => api.customRoles("company") });
  const catalog = useQuery({ queryKey: ["rolePermsCatalog"], queryFn: () => api.rolePermissionCatalog("company") });
  const users = useQuery({ queryKey: ["companyUsers"], queryFn: api.companyUsers });

  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [creating, setCreating] = useState(false);

  const deleteRole = useMutation({
    mutationFn: (id: number) => api.deleteCustomRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customRoles"] });
      qc.invalidateQueries({ queryKey: ["companyUsers"] });
    },
  });

  const assign = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number | null }) => api.assignCustomRole(userId, roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companyUsers"] });
      qc.invalidateQueries({ queryKey: ["customRoles"] });
    },
  });

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div>
        <h2 className="text-lg font-black text-[#17211f] dark:text-white">{tr("rolesSettings.title")}</h2>
        <p className="mt-1 text-sm text-[#717182] dark:text-white/60">
          {tr("rolesSettings.subtitle")}
        </p>
      </div>

      {/* ── Rôles personnalisés ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">{tr("rolesSettings.customRoles")}</h3>
          <button
            onClick={() => { setEditing(null); setCreating(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <Plus size={14} /> {tr("rolesSettings.newRole")}
          </button>
        </div>

        {(roles.data ?? []).length === 0 && !roles.isLoading && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-white/15 dark:text-white/40">
            {tr("rolesSettings.noRoles")}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(roles.data ?? []).map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${r.color}22`, color: r.color }}>
                <ShieldCheck size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 dark:text-white">{r.name}</p>
                {r.description && <p className="text-xs text-slate-500 dark:text-white/50">{r.description}</p>}
                <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-white/40">
                  {tr("rolesSettings.accessCount", { count: r.permissions.length, members: r.member_count })}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => { setCreating(false); setEditing(r); }} aria-label={tr("common.edit")} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-black/[0.05] dark:text-white/60 dark:hover:bg-white/10">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => { if (confirm(tr("rolesSettings.confirmDelete", { name: r.name }))) deleteRole.mutate(r.id); }}
                  aria-label={tr("common.delete")}
                  className="grid h-7 w-7 place-items-center rounded-md text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Attribution aux membres ── */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
          <Users size={14} /> {tr("rolesSettings.membersAndAccess")}
        </h3>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
          {(users.data ?? []).map((u) => (
            <div key={u.id} className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-white/5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                {u.full_name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900 dark:text-white">{u.full_name}</p>
                <p className="truncate text-xs text-slate-400 dark:text-white/40">{u.email}</p>
              </div>
              <select
                value={u.custom_role_id ?? ""}
                disabled={assign.isPending}
                onChange={(e) => assign.mutate({ userId: u.id, roleId: e.target.value ? Number(e.target.value) : null })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                <option value="">{tr("rolesSettings.baseRole", { role: u.role })}</option>
                {(roles.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          ))}
          {(users.data ?? []).length === 0 && !users.isLoading && (
            <div className="bg-white px-4 py-6 text-center text-sm text-slate-400 dark:bg-white/5 dark:text-white/40">{tr("rolesSettings.noMembers")}</div>
          )}
        </div>
      </section>

      {(creating || editing) && (
        <RoleEditor
          role={editing}
          catalog={(catalog.data ?? []).map((c) => ({ key: c.key, label: c.label }))}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            setCreating(false); setEditing(null);
            qc.invalidateQueries({ queryKey: ["customRoles"] });
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role, catalog, onClose, onSaved,
}: {
  role: CustomRole | null;
  catalog: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t: tr } = useTranslation();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? COLORS[0]);
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, description, scope: "company", permissions: [...perms], color };
      return role ? api.updateCustomRole(role.id, payload) : api.createCustomRole(payload);
    },
    onSuccess: onSaved,
  });

  const toggle = (key: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const canSave = useMemo(() => name.trim().length >= 2, [name]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d23]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h3 className="font-black text-slate-900 dark:text-white">{role ? tr("rolesSettings.editor.editTitle") : tr("rolesSettings.editor.newTitle")}</h3>
          <button onClick={onClose} aria-label={tr("common.close")} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-black/[0.05] dark:text-white/60 dark:hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">{tr("rolesSettings.editor.nameLabel")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("rolesSettings.editor.namePlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-black/20 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">{tr("rolesSettings.editor.descriptionLabel")}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("rolesSettings.editor.descriptionPlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-black/20 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">{tr("rolesSettings.editor.colorLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} aria-label={c}
                  className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-slate-900 dark:border-white" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              {tr("rolesSettings.editor.modulesLabel", { count: perms.size })}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {catalog.map((p) => {
                const on = perms.has(p.key);
                return (
                  <button key={p.key} onClick={() => toggle(p.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      on ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                         : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                    }`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded ${on ? "bg-emerald-600 text-white" : "border border-slate-300 dark:border-white/20"}`}>
                      {on && <Check size={11} />}
                    </span>
                    <span className="truncate">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/10">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-black/[0.05] dark:text-white/60 dark:hover:bg-white/10">{tr("rolesSettings.editor.cancel")}</button>
          <button onClick={() => save.mutate()} disabled={!canSave || save.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {save.isPending ? tr("rolesSettings.editor.saving") : role ? tr("rolesSettings.editor.save") : tr("rolesSettings.editor.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
