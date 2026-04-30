/**
 * EmployeeProfilePage — Fiche individuelle d'un employé
 * Route: /employees/:id
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, DollarSign,
  Shield, User, FileText, Key, AlertTriangle, CheckCircle2,
  Clock, Calendar, CreditCard, RefreshCw, Download, Edit3,
  MoreHorizontal, ExternalLink
} from "lucide-react";
import { api } from "../services/api";
import type { Employee } from "../types/domain";
import { money, shortDate } from "../utils/format";

const formatCurrency = money;
const formatDate = shortDate;

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Actif", cls: "bg-emerald-100 text-emerald-700" },
    inactive: { label: "Inactif", cls: "bg-stone-100 text-stone-600" },
    on_leave: { label: "En congé", cls: "bg-amber-100 text-amber-700" },
    suspended: { label: "Suspendu", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-stone-100 text-stone-600" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function accountBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Accès actif", cls: "bg-emerald-100 text-emerald-700" },
    draft: { label: "Pas d'accès", cls: "bg-stone-100 text-stone-500" },
    invited: { label: "Invité", cls: "bg-blue-100 text-blue-700" },
    suspended: { label: "Suspendu", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-stone-100 text-stone-600" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    admin_entreprise: "Admin entreprise",
    manager_entreprise: "Manager / DG",
    rh_entreprise: "RH entreprise",
    comptable: "Comptable",
    responsable_pos: "Responsable POS",
    caissier_pos: "Caissier",
    employe: "Employé",
  };
  return map[role] ?? role;
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/[0.04] last:border-0">
      {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-[#717182]" />}
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="text-sm text-[#717182]">{label}</span>
        <span className="text-sm font-medium text-[#17211f] text-right">{value ?? "—"}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#717182]">{title}</h3>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════════════════════

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employeeId = Number(id);

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => api.employees().then((list) => list.find((e) => e.id === employeeId) ?? null),
    enabled: !isNaN(employeeId),
  });

  const resetAccess = useMutation({
    mutationFn: () => api.resetEmployeeAccess(employeeId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      alert(`✅ Accès réinitialisé\n\nIdentifiant : ${result.login_identifier}\nMot de passe temporaire : ${result.temporary_password}\n\nCommuniquez ces informations à l'employé.`);
    },
  });

  const downloadContract = async () => {
    try {
      const blob = await api.downloadEmployeeContract(employeeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrat_${employee?.last_name}_${employee?.first_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Impossible de télécharger le contrat.");
    }
  };

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="font-semibold text-[#17211f]">Employé introuvable</p>
        <p className="text-sm text-[#717182]">Cet employé n'existe pas ou vous n'avez pas accès.</p>
        <button onClick={() => navigate("/employees")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
          Retour à la liste
        </button>
      </div>
    );
  }

  const fullName = `${employee.first_name} ${employee.last_name}`;
  const initials = `${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#717182]">
        <button onClick={() => navigate("/employees")} className="flex items-center gap-1.5 hover:text-emerald-700 transition">
          <ArrowLeft size={14} />
          RH / Employés
        </button>
        <span>/</span>
        <span className="text-[#17211f] font-medium">{fullName}</span>
      </div>

      {/* Hero card */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-[#071407] to-[#0f2a0f] p-6 text-white sm:flex-row sm:items-center">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-black text-white shadow-lg"
          style={{ backgroundColor: employee.badge_color || "#2563eb" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black">{fullName}</h1>
            {statusBadge(employee.status)}
            {accountBadge(employee.account_status)}
          </div>
          <p className="mt-0.5 text-sm text-white/70">{employee.job_title} · {employee.department} · {employee.branch}</p>
          <p className="text-xs text-white/50 mt-0.5">#{employee.id} · {employee.employment_type}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={downloadContract}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20 transition"
          >
            <Download size={14} /> Contrat
          </button>
          <button
            onClick={() => resetAccess.mutate()}
            disabled={resetAccess.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-semibold hover:bg-amber-500 transition disabled:opacity-60"
          >
            <RefreshCw size={14} className={resetAccess.isPending ? "animate-spin" : ""} />
            {resetAccess.isPending ? "En cours…" : "Réinitialiser l'accès"}
          </button>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Left — 2 cols */}
        <div className="space-y-5 lg:col-span-2">

          {/* Identity */}
          <Section title="Identité & contact">
            <InfoRow label="Prénom" value={employee.first_name} icon={User} />
            <InfoRow label="Nom" value={employee.last_name} />
            <InfoRow label="Email" value={
              <a href={`mailto:${employee.email}`} className="text-emerald-600 hover:underline flex items-center gap-1">
                {employee.email} <ExternalLink size={11} />
              </a>
            } icon={Mail} />
            <InfoRow label="Téléphone" value={employee.phone || "Non renseigné"} icon={Phone} />
          </Section>

          {/* Employment */}
          <Section title="Poste & contrat">
            <InfoRow label="Intitulé du poste" value={employee.job_title} icon={Briefcase} />
            <InfoRow label="Type de contrat" value={employee.employment_type} />
            <InfoRow label="Département" value={employee.department} icon={Building2} />
            <InfoRow label="Site / Agence" value={employee.branch} />
            <InfoRow label="Manager" value={employee.manager_name || "Non défini"} />
            <InfoRow
              label="Salaire brut"
              value={employee.salary ? formatCurrency(employee.salary) : "Non renseigné"}
              icon={DollarSign}
            />
          </Section>

          {/* Payout */}
          <Section title="Mode de paiement de la paie">
            <InfoRow label="Méthode" value={employee.payout_method || "Non défini"} icon={CreditCard} />
            {employee.payout_method === "mobile_money" && (
              <InfoRow label="Téléphone Mobile Money" value={employee.payout_phone || "—"} />
            )}
            {employee.payout_method === "bank" && (
              <>
                <InfoRow label="Banque" value={employee.payout_bank_name || "—"} />
                <InfoRow label="N° de compte" value={employee.payout_account_number || "—"} />
              </>
            )}
            {employee.payout_method === "paypal" && (
              <InfoRow label="Email PayPal" value={employee.payout_paypal_email || "—"} />
            )}
          </Section>
        </div>

        {/* Right — 1 col */}
        <div className="space-y-5">

          {/* Access */}
          <Section title="Accès & sécurité">
            <InfoRow label="Rôle" value={roleLabel(employee.access_role)} icon={Shield} />
            <InfoRow label="Périmètre" value={employee.access_scope} />
            <InfoRow label="Statut compte" value={accountBadge(employee.account_status)} icon={Key} />
            <InfoRow
              label="Dernière connexion"
              value={employee.last_login_at ? formatDate(employee.last_login_at) : "Jamais"}
              icon={Clock}
            />
            <InfoRow
              label="Invité le"
              value={employee.invited_at ? formatDate(employee.invited_at) : "—"}
              icon={Calendar}
            />
            <InfoRow
              label="Activé le"
              value={employee.activated_at ? formatDate(employee.activated_at) : "—"}
            />
          </Section>

          {/* Quick actions */}
          <Section title="Actions rapides">
            <div className="space-y-2">
              <Link
                to={`/documents?employee=${employeeId}`}
                className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-black/[0.02] transition"
              >
                <FileText size={15} className="text-[#717182]" />
                Voir les documents
              </Link>
              <button
                onClick={downloadContract}
                className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-black/[0.02] transition"
              >
                <Download size={15} className="text-[#717182]" />
                Télécharger le contrat
              </button>
              <button
                onClick={() => resetAccess.mutate()}
                disabled={resetAccess.isPending}
                className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 transition disabled:opacity-60"
              >
                <RefreshCw size={15} className={resetAccess.isPending ? "animate-spin" : ""} />
                Réinitialiser l'accès
              </button>
            </div>
          </Section>

          {/* Meta */}
          <Section title="Métadonnées">
            <InfoRow label="ID employé" value={`#${employee.id}`} />
            <InfoRow label="Créé le" value={formatDate(employee.created_at)} icon={Calendar} />
            {employee.user_id && (
              <InfoRow label="ID utilisateur" value={`#${employee.user_id}`} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
