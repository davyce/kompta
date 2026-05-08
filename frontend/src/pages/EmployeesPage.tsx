import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase, CalendarDays, Clipboard, Clock3, ExternalLink, FileCheck2, FileDown, FileText,
  KeyRound, Loader2, Maximize2, Search, Send, ShieldOff, Upload, UserPlus, Users, Wallet, X,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { SelectInput, TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { money, currencyLabel } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";

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
                  label={`Salaire de base (${currencyLabel()})`}
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
  useCurrency();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "presence" | "leaves" | "contracts">("list");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "department" | "salary" | "branch" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(field: "name" | "department" | "salary" | "branch") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: "name" | "department" | "salary" | "branch" }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp size={12} className="ml-1 text-emerald-500" />
      : <ArrowDown size={12} className="ml-1 text-emerald-500" />;
  }
  const [contractModal, setContractModal] = useState<{ html: string; name: string } | null>(null);
  const [contractLoading, setContractLoading] = useState<number | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<null | {
    employeeName: string;
    employeeId: number;
    login: string;
    email: string;
    phone: string;
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
        email: result.employee.email,
        phone: result.employee.phone,
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
        email: result.employee.email,
        phone: result.employee.phone,
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
  const importCsv = useMutation({
    mutationFn: api.importEmployeesCsv,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      alert(`✅ ${result.imported} employés importés${result.errors.length ? `\n⚠️ ${result.errors.length} erreurs` : ""}`);
    },
  });

  async function openContract(employeeId: number, employeeName?: string) {
    setContractError(null);
    setContractLoading(employeeId);
    try {
      const blob = await api.downloadEmployeeContract(employeeId);
      const html = await blob.text();
      setContractModal({ html, name: employeeName ?? "Contrat" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossible de charger le contrat.";
      setContractError(msg);
    } finally {
      setContractLoading(null);
    }
  }

  function copyProvisioning() {
    if (!provisioning) return;
    navigator.clipboard.writeText(
      `Identifiant recommandé : ${provisioning.login}\nEmail : ${provisioning.email}\nTéléphone : ${provisioning.phone || "Non renseigné"}\nMot de passe temporaire : ${provisioning.password}`
    );
  }

  const filteredEmployees = (() => {
    const filtered = (employees.data ?? []).filter((emp) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.job_title} ${emp.department} ${emp.branch}`
        .toLowerCase()
        .includes(q);
    });
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "name")       { va = `${a.last_name} ${a.first_name}`; vb = `${b.last_name} ${b.first_name}`; }
      if (sortField === "department") { va = a.department ?? ""; vb = b.department ?? ""; }
      if (sortField === "salary")     { va = a.salary ?? 0; vb = b.salary ?? 0; }
      if (sortField === "branch")     { va = a.branch ?? ""; vb = b.branch ?? ""; }
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const csv = "first_name,last_name,job_title,department,branch,salary,employment_type,phone,email\nJean,Dupont,Développeur,Tech,Siège,500000,CDI,+237600000000,jean.dupont@example.com";
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "modele_employes.csv"; a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-stone-50 dark:bg-white/5 dark:border-white/[0.08]"
            >
              <FileDown size={15} />
              Modèle CSV
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] hover:bg-stone-50 dark:bg-white/5 dark:text-white dark:border-white/[0.08]">
              <Upload size={15} />
              Importer CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importCsv.mutate(file);
                e.target.value = "";
              }} />
            </label>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              <UserPlus size={18} />
              Nouvel employé
            </button>
          </div>
        </div>

        {/* Résultat provisioning */}
        {provisioning && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-emerald-900">✓ Compte créé — {provisioning.employeeName}</p>
                <div className="mt-3 grid gap-1.5 rounded-lg bg-white p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Identifiant recommandé</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.login}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Mot de passe temporaire</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.password}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Email utilisable</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-stone-400">Téléphone utilisable</p>
                    <p className="font-mono font-semibold text-ink">{provisioning.phone || "Non renseigné"}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-emerald-700">
                  {provisioning.note} Le login accepte aussi le téléphone avec ou sans espaces et avec ou sans indicatif.
                </p>
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
                onClick={() => openContract(provisioning.employeeId, provisioning.employeeName)}
                disabled={contractLoading === provisioning.employeeId}
                className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {contractLoading === provisioning.employeeId ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {contractLoading === provisioning.employeeId ? "Génération…" : "Ouvrir le contrat"}
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
                    <th className="pb-2">
                      <button onClick={() => toggleSort("name")} className="flex items-center hover:text-emerald-600 transition">
                        Nom <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="pb-2">Contact</th>
                    <th className="pb-2">Rôle</th>
                    <th className="pb-2">
                      <button onClick={() => toggleSort("department")} className="flex items-center hover:text-emerald-600 transition">
                        Service <SortIcon field="department" />
                      </button>
                    </th>
                    <th className="pb-2">
                      <button onClick={() => toggleSort("branch")} className="flex items-center hover:text-emerald-600 transition">
                        Agence <SortIcon field="branch" />
                      </button>
                    </th>
                    <th className="pb-2">
                      <button onClick={() => toggleSort("salary")} className="flex items-center hover:text-emerald-600 transition">
                        Salaire <SortIcon field="salary" />
                      </button>
                    </th>
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
                          <button onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)} disabled={contractLoading === emp.id} className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.06] bg-white text-[#17211f] hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50" title="Contrat imprimable">{contractLoading === emp.id ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}</button>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-stone-50 px-4 py-2 text-sm">
                <span className="font-semibold text-ink">Présence du jour — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date())}</span>
                <span className="font-bold text-emerald-600">{(filteredEmployees ?? []).filter((e) => e.account_status === "active").length} actifs</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(filteredEmployees ?? []).map((emp) => {
                  const isActive = emp.account_status === "active";
                  const isSuspended = emp.account_status === "suspended";
                  return (
                    <article key={emp.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                          {emp.first_name[0]}{emp.last_name[0]}
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-[#717182]">{emp.branch} · {emp.job_title}</p>
                        </div>
                      </div>
                      <StatusBadge
                        label={isSuspended ? "suspendu" : isActive ? "actif" : "inactif"}
                        tone={isSuspended ? "red" : isActive ? "green" : "amber"}
                      />
                    </article>
                  );
                })}
              </div>
              {!(filteredEmployees ?? []).length && <EmptyState icon={Users} title="Aucun employé trouvé" />}
            </div>
          ) : tab === "leaves" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 mb-2">
                <div className="rounded-lg border border-black/[0.05] bg-stone-50 p-3 text-center">
                  <p className="text-2xl font-black text-ink">{(employees.data ?? []).filter((e) => e.employment_type === "CDI").length}</p>
                  <p className="text-xs text-[#717182]">CDI actifs</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-black text-amber-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDD").length}</p>
                  <p className="text-xs text-amber-700">CDD — à surveiller</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{(employees.data ?? []).filter((e) => e.employment_type === "Stage").length}</p>
                  <p className="text-xs text-emerald-700">Stagiaires</p>
                </div>
              </div>
              {(filteredEmployees ?? []).map((emp) => (
                <article key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                      {emp.first_name[0]}{emp.last_name[0]}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                      <p className="text-sm text-[#717182]">{emp.employment_type} · {emp.department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={emp.employment_type === "CDD" ? "CDD" : emp.employment_type === "Stage" ? "Stage" : "CDI"}
                      tone={emp.employment_type === "CDD" ? "amber" : emp.employment_type === "Stage" ? "blue" : "green"}
                    />
                    <button
                      onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)}
                      disabled={contractLoading === emp.id}
                      className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-stone-50 disabled:opacity-50"
                    >
                      {contractLoading === emp.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                      Contrat
                    </button>
                  </div>
                </article>
              ))}
              {!(filteredEmployees ?? []).length && <EmptyState icon={Users} title="Aucun employé trouvé" />}
            </div>
          ) : tab === "contracts" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-black/[0.05] bg-stone-50 p-4">
                  <p className="text-2xl font-black text-ink">{employees.data?.length ?? 0}</p>
                  <p className="text-sm font-medium text-[#717182]">contrats actifs</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-2xl font-black text-emerald-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDI").length}</p>
                  <p className="text-sm font-medium text-emerald-700">CDI</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <p className="text-2xl font-black text-amber-700">{(employees.data ?? []).filter((e) => e.employment_type === "CDD").length}</p>
                  <p className="text-sm font-medium text-amber-800">CDD · à renouveler</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                  <p className="text-2xl font-black text-sky-700">{(employees.data ?? []).filter((e) => e.employment_type === "Stage" || e.employment_type === "Mission").length}</p>
                  <p className="text-sm font-medium text-sky-700">Stages / Missions</p>
                </div>
              </div>
              <div className="space-y-2">
                {(filteredEmployees ?? []).map((emp) => (
                  <div key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: emp.badge_color }}>
                        {emp.first_name[0]}{emp.last_name[0]}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-[#717182]">{emp.job_title} · {emp.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={emp.employment_type}
                        tone={emp.employment_type === "CDI" ? "green" : emp.employment_type === "CDD" ? "amber" : "blue"}
                      />
                      <button
                        onClick={() => openContract(emp.id, `${emp.first_name} ${emp.last_name}`)}
                        disabled={contractLoading === emp.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {contractLoading === emp.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                        {contractLoading === emp.id ? "Génération…" : "Voir contrat IA"}
                      </button>
                    </div>
                  </div>
                ))}
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

      {/* Contract error toast */}
      {contractError && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-red-200 bg-white px-5 py-3 shadow-xl">
          <span className="text-sm font-semibold text-red-700">{contractError}</span>
          <button onClick={() => setContractError(null)} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
        </div>
      )}

      {/* Contract preview modal */}
      {contractModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setContractModal(null)}>
          <div
            className="relative mx-auto mt-8 flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ maxHeight: "calc(100vh - 4rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100">
                  <FileText size={18} className="text-emerald-700" />
                </div>
                <div>
                  <p className="font-bold text-ink">Contrat — {contractModal.name}</p>
                  <p className="text-xs text-[#717182]">Généré par Limule IA · Valeur juridique conditionnelle à la signature</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([contractModal.html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `contrat_${contractModal.name.replace(/\s+/g, "_")}.html`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-stone-50 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-stone-100"
                  title="Télécharger"
                >
                  <Maximize2 size={15} />
                  Télécharger
                </button>
                <button
                  onClick={() => setContractModal(null)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.06] text-[#717182] hover:bg-stone-50"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Iframe content */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={contractModal.html}
                title={`Contrat ${contractModal.name}`}
                className="h-full w-full border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
