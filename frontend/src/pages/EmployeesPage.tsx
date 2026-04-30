import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase, CalendarDays, Clipboard, Clock3, ExternalLink, FileCheck2, FileText,
  KeyRound, Search, Send, ShieldOff, UserPlus, Users, Wallet, X,
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { SelectInput, TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { money } from "../utils/format";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_title: "",
  employment_type: "CDI",
  department: "Opérations",
  branch: "Siège",
  manager_name: "",
  salary: 0,
  access_role: "employe",
  payout_method: "mobile_money",
  payout_phone: "",
  payout_bank_name: "",
  payout_account_number: "",
  payout_paypal_email: "",
};

/* ─── Drawer ───────────────────────────────────────────────────────────── */
function EmployeeDrawer({
  open,
  onClose,
  onCreate,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (form: typeof EMPTY_FORM) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [section, setSection] = useState<"identity" | "position" | "payment" | "access">("identity");
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setSection("identity");
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate(form);
  }

  const SECTIONS = [
    { key: "identity", label: "Identité", icon: Users },
    { key: "position", label: "Poste & structure", icon: Briefcase },
    { key: "payment", label: "Paiement", icon: Wallet },
    { key: "access", label: "Accès & rôle", icon: ShieldOff },
  ] as const;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        aria-modal="true"
        role="dialog"
        aria-label="Créer un employé"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-250 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-5">
          <div>
            <h2 className="text-lg font-black text-ink">Nouvel employé</h2>
            <p className="text-sm font-medium text-[#717182]">
              Compte + accès générés automatiquement
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.06] text-[#717182] hover:bg-stone-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-black/[0.05] px-6 py-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                section === s.key
                  ? "bg-emerald-600 text-white"
                  : "text-[#717182] hover:bg-stone-50"
              }`}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Form body */}
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ── SECTION : Identité ── */}
            {section === "identity" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <TextInput
                    label="Prénom *"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    autoFocus
                  />
                  <TextInput
                    label="Nom *"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                  />
                </div>
                <TextInput
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="employe@entreprise.com"
                />
                <TextInput
                  label="Téléphone (SMS / notifications)"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+242 06 XXX XX XX"
                />
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <strong>Note :</strong> un identifiant de connexion et un mot de passe temporaire seront générés automatiquement à la création.
                </div>
              </div>
            )}

            {/* ── SECTION : Poste ── */}
            {section === "position" && (
              <div className="space-y-4">
                <TextInput
                  label="Poste / Fonction *"
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder="Ex : Responsable commercial"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <TextInput
                    label="Service / Département"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                  <TextInput
                    label="Agence / Site"
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  />
                </div>
                <TextInput
                  label="DG / responsable référent"
                  value={form.manager_name}
                  onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                  placeholder="Nom du responsable hiérarchique"
                />
                <SelectInput
                  label="Type de contrat"
                  value={form.employment_type}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                >
                  <option value="CDI">CDI — Contrat à durée indéterminée</option>
                  <option value="CDD">CDD — Contrat à durée déterminée</option>
                  <option value="Mission">Mission / Prestation</option>
                  <option value="Journalier">Journalier / Vacataire</option>
                  <option value="Stage">Stage / Alternance</option>
                </SelectInput>
                <TextInput
                  label="Salaire de base (F CFA)"
                  type="number"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
                  placeholder="Ex : 350000"
                />
              </div>
            )}

            {/* ── SECTION : Paiement ── */}
            {section === "payment" && (
              <div className="space-y-4">
                <SelectInput
                  label="Mode de versement salaire"
                  value={form.payout_method}
                  onChange={(e) => setForm({ ...form, payout_method: e.target.value })}
                >
                  <option value="mobile_money">Mobile money</option>
                  <option value="zola">Zola</option>
                  <option value="bank">Virement bancaire</option>
                  <option value="paypal">PayPal</option>
                </SelectInput>
                {(form.payout_method === "mobile_money" || form.payout_method === "zola") && (
                  <TextInput
                    label="Téléphone de versement"
                    value={form.payout_phone}
                    onChange={(e) => setForm({ ...form, payout_phone: e.target.value })}
                    placeholder={form.phone || "+242 06 XXX XX XX"}
                  />
                )}
                {form.payout_method === "bank" && (
                  <>
                    <TextInput
                      label="Banque"
                      value={form.payout_bank_name}
                      onChange={(e) => setForm({ ...form, payout_bank_name: e.target.value })}
                      placeholder="Nom de la banque"
                    />
                    <TextInput
                      label="Numéro de compte / RIB"
                      value={form.payout_account_number}
                      onChange={(e) => setForm({ ...form, payout_account_number: e.target.value })}
                      placeholder="Compte bancaire de l'employé"
                    />
                  </>
                )}
                {form.payout_method === "paypal" && (
                  <TextInput
                    label="Email PayPal"
                    type="email"
                    value={form.payout_paypal_email}
                    onChange={(e) => setForm({ ...form, payout_paypal_email: e.target.value })}
                    placeholder="employe@email.com"
                  />
                )}
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  Ces informations servent à préparer les versements de paie et à signaler les dossiers incomplets avant validation.
                </div>
              </div>
            )}

            {/* ── SECTION : Accès ── */}
            {section === "access" && (
              <div className="space-y-4">
                <SelectInput
                  label="Rôle d'accès KOMPTA"
                  value={form.access_role}
                  onChange={(e) => setForm({ ...form, access_role: e.target.value })}
                >
                  <option value="employe">Employé standard — accès limité à son espace</option>
                  <option value="manager_entreprise">DG — accès équipe + tâches</option>
                  <option value="rh_entreprise">RH entreprise — dossiers, contrats, paie</option>
                  <option value="comptable">Comptable — finance, facturation, écritures</option>
                  <option value="caissier_pos">Caissier / POS — caisse uniquement</option>
                  <option value="admin_entreprise">Admin entreprise — accès complet</option>
                </SelectInput>

                <div className="space-y-2 rounded-lg border border-black/[0.05] bg-stone-50 p-4 text-sm">
                  <p className="font-semibold text-ink">Périmètre de données par rôle :</p>
                  <ul className="space-y-1 text-[#17211f]">
                    {form.access_role === "employe" && (
                      <>
                        <li>✓ Son profil, ses tâches, ses bulletins</li>
                        <li>✗ Données des autres employés</li>
                        <li>✗ Comptabilité, facturation</li>
                      </>
                    )}
                    {form.access_role === "manager_entreprise" && (
                      <>
                        <li>✓ Équipe, pilotage et tâches</li>
                        <li>✓ Rapports d'activité limités</li>
                        <li>✗ Paie complète, comptabilité</li>
                      </>
                    )}
                    {form.access_role === "rh_entreprise" && (
                      <>
                        <li>✓ Tous les dossiers employés</li>
                        <li>✓ Contrats, congés, présences</li>
                        <li>✓ Paie (lecture + validation)</li>
                      </>
                    )}
                    {form.access_role === "comptable" && (
                      <>
                        <li>✓ Comptabilité, facturation, écritures</li>
                        <li>✓ Rapports financiers</li>
                        <li>✗ RH confidentiel</li>
                      </>
                    )}
                    {form.access_role === "caissier_pos" && (
                      <>
                        <li>✓ POS / Caisse uniquement</li>
                        <li>✗ RH, comptabilité, admin</li>
                      </>
                    )}
                    {form.access_role === "admin_entreprise" && (
                      <>
                        <li>✓ Accès complet à tous les modules</li>
                        <li>✓ Création / gestion des comptes</li>
                        <li>✓ Paramètres entreprise</li>
                      </>
                    )}
                  </ul>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t border-black/[0.05] px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {section !== "identity" && (
                  <button
                    type="button"
                    onClick={() =>
                      setSection(section === "access" ? "payment" : section === "payment" ? "position" : "identity")
                    }
                    className="rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50"
                  >
                    ← Précédent
                  </button>
                )}
                {section !== "access" && (
                  <button
                    type="button"
                    onClick={() =>
                      setSection(section === "identity" ? "position" : section === "position" ? "payment" : "access")
                    }
                    className="rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-semibold text-[#17211f] hover:bg-stone-50"
                  >
                    Suivant →
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isPending || !form.first_name || !form.last_name || !form.job_title}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:bg-stone-300"
              >
                <UserPlus size={17} />
                {isPending ? "Création…" : "Créer + générer accès"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─── Page principale ──────────────────────────────────────────────────── */
export function EmployeesPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "presence" | "leaves" | "contracts">("list");
  const [search, setSearch] = useState("");
  const [provisioning, setProvisioning] = useState<null | {
    employeeName: string;
    employeeId: number;
    login: string;
    password: string;
    note: string;
  }>(null);

  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const create = useMutation({
    mutationFn: api.quickCreateEmployee,
    onSuccess: (result) => {
      setDrawerOpen(false);
      setProvisioning({
        employeeName: `${result.employee.first_name} ${result.employee.last_name}`,
        employeeId: result.employee.id,
        login: result.login_identifier,
        password: result.temporary_password,
        note: result.access_note,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const resetAccess = useMutation({
    mutationFn: api.resetEmployeeAccess,
    onSuccess: (result) => {
      setProvisioning({
        employeeName: `${result.employee.first_name} ${result.employee.last_name}`,
        employeeId: result.employee.id,
        login: result.login_identifier,
        password: result.temporary_password,
        note: result.access_note,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
  const updateStatus = useMutation({
    mutationFn: ({ employeeId, status }: { employeeId: number; status: string }) =>
      api.updateEmployeeAccountStatus(employeeId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });
  const employability = useMutation({
    mutationFn: api.submitEmployability,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employabilityChecks"] }),
  });

  async function openContract(employeeId: number) {
    const blob = await api.downloadEmployeeContract(employeeId);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyProvisioning() {
    if (!provisioning) return;
    navigator.clipboard.writeText(
      `Identifiant : ${provisioning.login}\nMot de passe temporaire : ${provisioning.password}`
    );
  }

  const filteredEmployees = employees.data?.filter((emp) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.job_title} ${emp.department} ${emp.branch}`
      .toLowerCase()
      .includes(q);
  });

  const TABS = [
    { key: "list", label: "Employés", icon: Users },
    { key: "presence", label: "Présence", icon: Clock3 },
    { key: "leaves", label: "Congés", icon: CalendarDays },
    { key: "contracts", label: "Contrats", icon: FileCheck2 },
  ] as const;

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-600">RH et espace employé</p>
            <h1 className="text-3xl font-black text-ink">Dossiers du personnel</h1>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            <UserPlus size={18} />
            Nouvel employé
          </button>
        </div>

        {/* Résultat provisioning */}
        {provisioning && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-emerald-900">✓ Compte créé — {provisioning.employeeName}</p>
                <div className="mt-3 grid gap-1.5 rounded-lg bg-white p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Identifiant</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.login}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Mot de passe temporaire</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.password}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-emerald-700">{provisioning.note}</p>
              </div>
              <button onClick={() => setProvisioning(null)} className="text-emerald-600 hover:text-emerald-900">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={copyProvisioning}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
              >
                <Clipboard size={15} />
                Copier les identifiants
              </button>
              <button
                onClick={() => openContract(provisioning.employeeId)}
                className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
              >
                <FileText size={15} />
                Ouvrir le contrat
              </button>
            </div>
          </div>
        )}

        <Panel
          title="Espace RH"
          action={
            <StatusBadge label={`${employees.data?.length ?? 0} employés`} tone="blue" />
          }
        >
          {/* Tabs */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  tab === t.key
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-50 text-[#17211f] hover:bg-black/[0.04]"
                }`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Recherche */}
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-3 py-2">
            <Search size={17} className="text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un employé, un poste, un service…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {/* Tab : Liste */}
          {tab === "list" && filteredEmployees?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase text-stone-400">
                  <tr>
                    <th className="pb-2">Nom</th>
                    <th className="pb-2">Contact</th>
                    <th className="pb-2">Rôle</th>
                    <th className="pb-2">Service</th>
                    <th className="pb-2">Agence</th>
                    <th className="pb-2">Salaire</th>
                    <th className="pb-2">Paiement</th>
                    <th className="pb-2">Compte</th>
                    <th className="pb-2">Accès</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-stone-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                            style={{ background: emp.badge_color }}
                          >
                            {emp.first_name[0]}{emp.last_name[0]}
                          </span>
                          <div>
                            <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                            <p className="text-xs text-[#717182]">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p>{emp.phone || "Non renseigné"}</p>
                        <p className="text-xs text-[#717182]">SMS</p>
                      </td>
                      <td className="font-medium">{emp.job_title}</td>
                      <td>{emp.department}</td>
                      <td>{emp.branch}</td>
                      <td className="font-semibold text-emerald-600">{money(emp.salary)}</td>
                      <td>
                        <p className="font-medium">{emp.payout_method || "—"}</p>
                        <p className="text-xs text-[#717182]">
                          {emp.payout_phone || emp.payout_bank_name || emp.payout_paypal_email || "À compléter"}
                        </p>
                      </td>
                      <td>
                        <StatusBadge
                          label={emp.account_status}
                          tone={emp.account_status === "active" ? "green" : emp.account_status === "suspended" ? "red" : "amber"}
                        />
                      </td>
                      <td>
                        <p className="font-medium">{emp.access_role}</p>
                        <p className="text-xs text-[#717182]">{emp.access_scope}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Link to={`/employees/${emp.id}`} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title="Voir la fiche"><ExternalLink size={15} /></Link>
                          <button onClick={() => resetAccess.mutate(emp.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title="Régénérer accès"><KeyRound size={15} /></button>
                          <button onClick={() => openContract(emp.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title="Contrat imprimable"><FileText size={15} /></button>
                          <button onClick={() => employability.mutate(emp.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600" title="Employabilité TERAS"><Send size={15} /></button>
                          <button
                            onClick={() => updateStatus.mutate({ employeeId: emp.id, status: emp.account_status === "suspended" ? "active" : "suspended" })}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-rose-500 hover:text-rose-600"
                            title="Suspendre / réactiver"
                          >
                            <ShieldOff size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tab === "presence" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {(filteredEmployees ?? []).slice(0, 8).map((emp, i) => (
                <article key={emp.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                      {emp.first_name[0]}{emp.last_name[0]}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-[#717182]">{emp.branch} · arrivée 08:{String(10 + i * 4).padStart(2, "0")}</p>
                    </div>
                  </div>
                  <StatusBadge label={i % 5 === 0 ? "à vérifier" : "présent"} tone={i % 5 === 0 ? "amber" : "green"} />
                </article>
              ))}
            </div>
          ) : tab === "leaves" ? (
            <div className="space-y-3">
              {[
                { who: "Amina Tamba", kind: "Congés annuels", dates: "05 mai → 09 mai", status: "en attente" },
                { who: "Junior Makaya", kind: "Repos compensateur", dates: "02 mai", status: "approuvé" },
                { who: "Mireille Ngoma", kind: "Mission terrain", dates: "30 avr → 04 mai", status: "planifié" },
              ].map((leave) => (
                <article key={leave.who} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                  <div>
                    <p className="font-semibold text-ink">{leave.who}</p>
                    <p className="text-sm text-[#717182]">{leave.kind} · {leave.dates}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge label={leave.status} tone={leave.status === "en attente" ? "amber" : "green"} />
                    {leave.status === "en attente" && (
                      <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">Approuver</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : tab === "contracts" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-black/[0.05] bg-stone-50 p-4">
                <p className="text-2xl font-black text-ink">{employees.data?.length ?? 0}</p>
                <p className="text-sm font-medium text-[#717182]">contrats actifs</p>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <p className="text-2xl font-black text-amber-700">3</p>
                <p className="text-sm font-medium text-amber-800">à renouveler sous 30 jours</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-2xl font-black text-emerald-600">IA</p>
                <p className="text-sm font-medium text-emerald-700">génération et archivage auto</p>
              </div>
            </div>
          ) : (
            <EmptyState icon={Users} title="Aucun employé" />
          )}
        </Panel>
      </div>

      {/* Drawer modal */}
      <EmployeeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreate={(form) => create.mutate(form)}
        isPending={create.isPending}
        error={create.error?.message ?? null}
      />
    </>
  );
}
