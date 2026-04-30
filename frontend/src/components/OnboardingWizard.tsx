/**
 * OnboardingWizard — Tutoriel novice complet KOMPTA
 * 8 étapes interactives avec exemples concrets, démo Limule, et guide pratique
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState, useEffect } from "react";
import {
  ArrowRight, ArrowLeft, Building2, CheckCircle2, Sparkles, UserPlus, X,
  BookOpen, CreditCard, ShoppingCart, Bot, Shield, Zap, ChevronRight,
  FileText, HandCoins, BarChart3, Play, Info, Star
} from "lucide-react";
import { api } from "../services/api";

// ── Types ──────────────────────────────────────────────────────────────────────
const STEPS = [
  "welcome",
  "tour",
  "company",
  "team",
  "modules",
  "limule_demo",
  "teras",
  "done",
] as const;
type Step = (typeof STEPS)[number];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIcon({ icon: Icon, color = "emerald" }: { icon: React.ElementType; color?: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${colors[color] ?? colors.emerald}`}>
      <Icon size={32} />
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
      <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
      <div>{children}</div>
    </div>
  );
}

function ExampleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-[#f7f9fa] px-3 py-2 text-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">{label}</p>
      <p className="mt-0.5 font-medium text-[#17211f]">{value}</p>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Module Feature Cards ────────────────────────────────────────────────────────

const MODULES = [
  { key: "rh", icon: UserPlus, label: "RH & Personnel", desc: "Fiches employés, contrats, accès", color: "emerald" },
  { key: "paie", icon: HandCoins, label: "Paie", desc: "Bulletins, virements, CNSS", color: "blue" },
  { key: "facturation", icon: FileText, label: "Facturation", desc: "Devis, factures, encaissements", color: "violet" },
  { key: "pos", icon: ShoppingCart, label: "POS / Caisse", desc: "Vente directe, caisse, reçus", color: "amber" },
  { key: "declarations", icon: Shield, label: "Déclarations", desc: "Fiscalité CEMAC, SYSCOHADA, conformité", color: "rose" },
  { key: "assistants", icon: Bot, label: "Rédaction IA", desc: "Emails, contrats, courriers", color: "emerald" },
];

// ── Limule Demo prompts ─────────────────────────────────────────────────────────

const DEMO_PROMPTS = [
  {
    label: "📧 Email professionnel",
    prompt: "Rédige un email de bienvenue pour un nouvel employé qui rejoint mon équipe.",
    sampleResponse: `Objet : Bienvenue dans l'équipe !

Bonjour [Prénom],

Nous sommes ravis de vous accueillir au sein de notre équipe. Votre arrivée représente une vraie valeur ajoutée pour notre organisation.

Vous trouverez ci-joint les informations pratiques pour vos premiers jours :
• Vos identifiants d'accès au système KOMPTA
• Le règlement intérieur de l'entreprise
• Le planning d'intégration de la semaine

N'hésitez pas à nous contacter pour toute question.

Cordialement,
La Direction`,
  },
  {
    label: "📋 Rapport hebdo",
    prompt: "Génère un modèle de rapport d'activité hebdomadaire simple.",
    sampleResponse: `RAPPORT D'ACTIVITÉ — Semaine du [date]

**Réalisations de la semaine :**
• [Tâche 1 complétée]
• [Projet X avancé à 80%]
• [Réunion client effectuée]

**En cours :**
• [Tâche en attente de validation]
• [Devis à envoyer avant vendredi]

**Blocages identifiés :**
• [Problème X → solution envisagée]

**Objectifs semaine prochaine :**
1. [Objectif prioritaire]
2. [Objectif secondaire]`,
  },
  {
    label: "⚖️ Clause contrat",
    prompt: "Rédige une clause de confidentialité simple pour un contrat de travail.",
    sampleResponse: `**CLAUSE DE CONFIDENTIALITÉ**

L'employé s'engage à maintenir strictement confidentielle toute information relative aux activités, clients, partenaires, procédés et données financières de l'entreprise, tant pendant la durée du contrat qu'après sa cessation.

Cette obligation s'étend notamment à :
- Les données clients et prospects
- Les informations financières et comptables
- Les méthodes et processus internes
- Les informations techniques ou commerciales

Toute violation de cette clause pourrait entraîner des poursuites judiciaires et engage la responsabilité personnelle du signataire.`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set(["rh", "facturation"]));
  const [demoPromptIdx, setDemoPromptIdx] = useState(0);
  const [demoExpanded, setDemoExpanded] = useState(false);
  const [demoTyping, setDemoTyping] = useState(false);
  const [demoText, setDemoText] = useState("");
  const [animFrame, setAnimFrame] = useState(0);

  const [companyForm, setCompanyForm] = useState({
    legal_name: "",
    industry: "Commerce",
    country: "République du Congo",
    primary_color: "#0f766e",
  });
  const [employeeForm, setEmployeeForm] = useState({
    first_name: "",
    last_name: "",
    job_title: "",
    phone: "",
    email: "",
    employment_type: "CDI",
    department: "Direction",
    branch: "Siege",
    salary: 0,
    access_role: "manager_entreprise",
  });

  const stepIndex = STEPS.indexOf(step);

  const updateCompany = useMutation({
    mutationFn: api.updateCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      setStep("team");
    },
  });

  const createEmployee = useMutation({
    mutationFn: api.quickCreateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      setStep("modules");
    },
  });

  // Simulated typewriter effect for Limule demo
  useEffect(() => {
    if (!demoTyping) return;
    const target = DEMO_PROMPTS[demoPromptIdx].sampleResponse;
    let i = demoText.length;
    if (i >= target.length) {
      setDemoTyping(false);
      return;
    }
    const timer = setTimeout(() => {
      setDemoText(target.slice(0, i + Math.min(8, target.length - i)));
    }, 20);
    return () => clearTimeout(timer);
  }, [demoTyping, demoText, demoPromptIdx]);

  // Blinking cursor
  useEffect(() => {
    const t = setInterval(() => setAnimFrame((f) => f + 1), 500);
    return () => clearInterval(t);
  }, []);

  function startDemo(idx: number) {
    setDemoPromptIdx(idx);
    setDemoText("");
    setDemoTyping(true);
    setDemoExpanded(true);
  }

  function submitCompany(e: FormEvent) {
    e.preventDefault();
    updateCompany.mutate(companyForm);
  }

  function submitEmployee(e: FormEvent) {
    e.preventDefault();
    createEmployee.mutate(employeeForm);
  }

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Nav helpers ───────────────────────────────────────────────────────────

  const stepLabels: Record<Step, string> = {
    welcome: "Bienvenue",
    tour: "Visite",
    company: "Entreprise",
    team: "Équipe",
    modules: "Modules",
    limule_demo: "Limule IA",
    teras: "TERAS",
    done: "Prêt !",
  };

  const canGoBack = stepIndex > 0 && step !== "done";

  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <Sparkles size={22} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">KOMPTA · Démarrage guidé</p>
              <p className="font-black">{stepLabels[step]}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-70">{stepIndex + 1} / {STEPS.length}</span>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-2 bg-emerald-50">
          <ProgressBar current={stepIndex + 1} total={STEPS.length} />
          <div className="mt-1.5 flex justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className={`text-[9px] font-bold uppercase tracking-wide ${i === stepIndex ? "text-emerald-700" : i < stepIndex ? "text-emerald-400" : "text-stone-300"}`}>
                {i < stepIndex ? "✓" : i === stepIndex ? "●" : "○"}
              </div>
            ))}
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="max-h-[70vh] overflow-y-auto p-6">

          {/* ── STEP 1: Welcome ── */}
          {step === "welcome" && (
            <div className="space-y-5 text-center">
              <StepIcon icon={Sparkles} color="emerald" />
              <div>
                <h2 className="text-2xl font-black text-[#17211f]">Bienvenue sur KOMPTA !</h2>
                <p className="mt-2 text-sm text-[#717182]">
                  L'ERP intelligent conçu pour les entreprises africaines.<br />
                  Ce guide de <strong>5 minutes</strong> vous aide à tout configurer correctement.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
                {[
                  { icon: Building2, label: "RH & Personnel", desc: "Gérez vos employés facilement" },
                  { icon: CreditCard, label: "Finance", desc: "Paie, facturation, déclarations" },
                  { icon: Bot, label: "IA Limule", desc: "Rédigez en quelques secondes" },
                  { icon: Shield, label: "TERAS", desc: "Conformité CEMAC/SYSCOHADA automatique" },
                  { icon: ShoppingCart, label: "POS", desc: "Caisse et encaissements" },
                  { icon: BarChart3, label: "Rapports", desc: "Tableaux de bord en temps réel" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex flex-col gap-1 rounded-xl border border-black/[0.06] p-3">
                    <Icon size={18} className="text-emerald-600" />
                    <p className="text-xs font-bold text-[#17211f]">{label}</p>
                    <p className="text-[11px] text-[#717182]">{desc}</p>
                  </div>
                ))}
              </div>

              <TipBox>
                💡 <strong>Pour les débutants :</strong> Chaque écran contient une aide contextuelle. Vous pouvez revenir sur ce tutoriel depuis Paramètres → Aide.
              </TipBox>

              <button
                onClick={() => setStep("tour")}
                className="mx-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 transition"
              >
                Commencer la visite guidée <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Tour ── */}
          {step === "tour" && (
            <div className="space-y-4">
              <StepIcon icon={BookOpen} color="blue" />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">Comment fonctionne KOMPTA ?</h2>
                <p className="mt-1 text-sm text-[#717182]">En 4 points essentiels</p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    num: "1",
                    title: "Tableau de bord central",
                    desc: "Votre écran d'accueil résume tout : score TERAS, chiffres clés, alertes, actions rapides. Il se met à jour automatiquement.",
                    example: "Exemple : « TERAS 81/100 · 3 alertes ouvertes · CA du mois : 4 200 000 XAF »",
                  },
                  {
                    num: "2",
                    title: "Navigation par modules",
                    desc: "Le menu gauche organise les fonctions par thème : Personnel, Finance, Collaboration, Intelligence. Chaque module est indépendant.",
                    example: "Conseil : utilisez ⌘K (ou Ctrl+K) pour chercher n'importe quoi depuis n'importe quel écran.",
                  },
                  {
                    num: "3",
                    title: "TERAS surveille tout",
                    desc: "L'engine TERAS analyse en arrière-plan la conformité de votre entreprise. Il crée des alertes et un score global sur 100.",
                    example: "Exemple d'alerte : « 2 employés sans contrat enregistré — risque RH élevé »",
                  },
                  {
                    num: "4",
                    title: "Limule rédige pour vous",
                    desc: "L'IA Limule génère emails, contrats, rapports, courriers en français professionnel adapté à votre contexte CEMAC.",
                    example: "Exemple : Saisissez « email de bienvenue » et Limule génère un texte complet en 3 secondes.",
                  },
                ].map(({ num, title, desc, example }) => (
                  <div key={num} className="flex gap-3 rounded-xl border border-black/[0.06] p-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                      {num}
                    </span>
                    <div className="space-y-1">
                      <p className="font-bold text-[#17211f]">{title}</p>
                      <p className="text-sm text-[#717182]">{desc}</p>
                      <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800 italic">{example}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: Company ── */}
          {step === "company" && (
            <form onSubmit={submitCompany} className="space-y-4">
              <StepIcon icon={Building2} />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">Votre entreprise</h2>
                <p className="text-sm text-[#717182] mt-1">Ces informations apparaissent sur vos documents officiels.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <ExampleCard label="Exemple raison sociale" value="ACACIA Trading SARL" />
                <ExampleCard label="Exemple secteur" value="Commerce de détail" />
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Raison sociale *</span>
                <input
                  required
                  value={companyForm.legal_name}
                  onChange={(e) => setCompanyForm({ ...companyForm, legal_name: e.target.value })}
                  placeholder="ex : Mon Entreprise SARL"
                  className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Secteur d'activité</span>
                  <select
                    value={companyForm.industry}
                    onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  >
                    <option>Commerce</option>
                    <option>Services</option>
                    <option>Industrie</option>
                    <option>ONG / Programme</option>
                    <option>Restauration</option>
                    <option>BTP / Construction</option>
                    <option>Transport / Logistique</option>
                    <option>Santé</option>
                    <option>Éducation</option>
                    <option>Agriculture</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Pays CEMAC</span>
                  <select
                    value={companyForm.country}
                    onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  >
                    <option>République du Congo</option>
                    <option>Cameroun</option>
                    <option>Gabon</option>
                    <option>Tchad</option>
                    <option>République centrafricaine</option>
                    <option>Guinée équatoriale</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Couleur principale</span>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    value={companyForm.primary_color}
                    onChange={(e) => setCompanyForm({ ...companyForm, primary_color: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-black/[0.06]"
                  />
                  <span className="text-sm text-[#717182]">Apparaît sur vos documents et l'interface</span>
                </div>
              </label>

              <TipBox>
                Vous pourrez modifier ces informations à tout moment dans <strong>Paramètres → Entreprise</strong>.
              </TipBox>

              {updateCompany.error && (
                <p className="rounded bg-red-50 p-2 text-sm text-red-600">{String(updateCompany.error)}</p>
              )}
            </form>
          )}

          {/* ── STEP 4: Team ── */}
          {step === "team" && (
            <form onSubmit={submitEmployee} className="space-y-4">
              <StepIcon icon={UserPlus} color="violet" />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">Premier collaborateur</h2>
                <p className="text-sm text-[#717182] mt-1">
                  Créez votre premier employé. KOMPTA lui génère automatiquement un accès sécurisé.
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-bold">🔐 Accès automatique</p>
                <p className="text-xs mt-0.5">Un identifiant et un mot de passe temporaire seront générés. L'employé devra le changer à la première connexion.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Prénom *</span>
                  <input
                    required
                    placeholder="ex : Marie"
                    value={employeeForm.first_name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, first_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Nom *</span>
                  <input
                    required
                    placeholder="ex : KONAN"
                    value={employeeForm.last_name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, last_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Poste *</span>
                  <input
                    required
                    placeholder="ex : Directeur Commercial"
                    value={employeeForm.job_title}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Email *</span>
                  <input
                    required
                    type="email"
                    placeholder="ex : marie@monentreprise.com"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Téléphone</span>
                  <input
                    placeholder="ex : +242 06 123 4567"
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Salaire brut (XAF)</span>
                  <input
                    type="number"
                    placeholder="ex : 350000"
                    value={employeeForm.salary || ""}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, salary: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Type de contrat</span>
                  <select
                    value={employeeForm.employment_type}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, employment_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  >
                    <option value="CDI">CDI — Durée indéterminée</option>
                    <option value="CDD">CDD — Durée déterminée</option>
                    <option value="Stage">Stage</option>
                    <option value="Prestataire">Prestataire</option>
                    <option value="Consultant">Consultant</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">Rôle d'accès</span>
                  <select
                    value={employeeForm.access_role}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, access_role: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.06] px-3 py-2 outline-none focus:border-emerald-600"
                  >
                    <option value="manager_entreprise">Manager (accès complet)</option>
                    <option value="rh_entreprise">RH (gestion personnel)</option>
                    <option value="comptable">Comptable (finance)</option>
                    <option value="responsable_pos">Responsable POS</option>
                    <option value="caissier_pos">Caissier</option>
                    <option value="employe">Employé (lecture seule)</option>
                  </select>
                </label>
              </div>

              {createEmployee.error && (
                <p className="rounded bg-red-50 p-2 text-sm text-red-600">{String(createEmployee.error)}</p>
              )}
            </form>
          )}

          {/* ── STEP 5: Modules ── */}
          {step === "modules" && (
            <div className="space-y-4">
              <StepIcon icon={Zap} color="amber" />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">Modules actifs</h2>
                <p className="text-sm text-[#717182] mt-1">Choisissez ce dont vous avez besoin maintenant. Vous pouvez activer d'autres modules plus tard.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODULES.map(({ key, icon: Icon, label, desc, color }) => {
                  const active = selectedModules.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleModule(key)}
                      className={`relative rounded-xl border-2 p-3 text-left transition ${
                        active
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-black/[0.06] hover:border-black/[0.12]"
                      }`}
                    >
                      {active && (
                        <CheckCircle2 size={14} className="absolute right-2 top-2 text-emerald-600" />
                      )}
                      <Icon size={20} className={active ? "text-emerald-600" : "text-[#717182]"} />
                      <p className={`mt-1.5 text-xs font-bold ${active ? "text-emerald-800" : "text-[#17211f]"}`}>{label}</p>
                      <p className="text-[11px] text-[#717182] mt-0.5">{desc}</p>
                    </button>
                  );
                })}
              </div>

              <TipBox>
                Tous les modules sont disponibles dans le menu gauche. Cette sélection configure juste les raccourcis de votre tableau de bord.
              </TipBox>
            </div>
          )}

          {/* ── STEP 6: Limule Demo ── */}
          {step === "limule_demo" && (
            <div className="space-y-4">
              <StepIcon icon={Bot} color="violet" />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">Limule — Votre assistant IA</h2>
                <p className="text-sm text-[#717182] mt-1">
                  Limule rédige des documents professionnels en français, adaptés au contexte CEMAC.
                  <br /><strong>Testez-le maintenant :</strong>
                </p>
              </div>

              {/* Prompt selector */}
              <div className="flex flex-wrap gap-2">
                {DEMO_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => startDemo(i)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      demoPromptIdx === i && demoExpanded
                        ? "border-violet-400 bg-violet-50 text-violet-800"
                        : "border-black/[0.08] text-[#17211f] hover:bg-black/[0.03]"
                    }`}
                  >
                    <Play size={12} />
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Demo prompt display */}
              {demoExpanded && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-violet-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-600 mb-1">Votre demande</p>
                    <p className="text-sm text-violet-900 italic">"{DEMO_PROMPTS[demoPromptIdx].prompt}"</p>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-white p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 text-[10px] font-black text-white">L</div>
                      <p className="text-xs font-bold text-[#17211f]">Limule — réponse IA</p>
                      {demoTyping && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                          Génération en cours…
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-[#17211f] leading-relaxed">
                      {demoText}
                      {demoTyping && <span className={`inline-block w-0.5 h-4 bg-emerald-600 ${animFrame % 2 === 0 ? "opacity-100" : "opacity-0"}`} />}
                    </pre>
                    {!demoTyping && demoText && (
                      <p className="mt-3 text-xs text-[#717182] border-t border-black/[0.04] pt-2">
                        ✓ Texte généré par Limule · Accessible depuis <strong>Rédaction IA</strong> dans le menu
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!demoExpanded && (
                <div className="rounded-xl border-2 border-dashed border-violet-200 p-6 text-center">
                  <Bot size={24} className="mx-auto mb-2 text-violet-400" />
                  <p className="text-sm text-[#717182]">Cliquez sur l'un des exemples ci-dessus pour voir Limule en action</p>
                </div>
              )}

              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-bold">💡 Pour accéder à Limule :</p>
                <p className="text-xs mt-0.5">Menu gauche → <strong>Rédaction IA</strong> · Ou demandez à Limule depuis le bouton <strong>Copilot</strong> en bas à droite de l'écran.</p>
              </div>
            </div>
          )}

          {/* ── STEP 7: TERAS ── */}
          {step === "teras" && (
            <div className="space-y-4">
              <StepIcon icon={Shield} color="rose" />
              <div className="text-center">
                <h2 className="text-xl font-black text-[#17211f]">TERAS — Conformité intelligente</h2>
                <p className="text-sm text-[#717182] mt-1">TERAS est votre moteur de conformité. Il surveille votre entreprise 24h/24.</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-black/[0.06] p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black">
                      81
                    </div>
                    <div>
                      <p className="font-bold text-[#17211f]">Score TERAS : 81/100</p>
                      <p className="text-sm text-[#717182]">Votre score de départ. Il s'améliore quand vous complétez vos données.</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div className="h-full w-[81%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
                  </div>
                </div>

                <p className="text-sm font-semibold text-[#17211f]">Ce que TERAS surveille :</p>
                {[
                  { icon: "👤", text: "Employés sans contrat enregistré", risk: "RH · Risque élevé" },
                  { icon: "📊", text: "Déclarations fiscales en retard", risk: "Fiscal · Risque critique" },
                  { icon: "💰", text: "Écarts de paie non justifiés", risk: "Paie · Risque moyen" },
                  { icon: "📄", text: "Documents manquants ou expirés", risk: "Conformité · Risque faible" },
                ].map(({ icon, text, risk }) => (
                  <div key={text} className="flex items-center justify-between rounded-lg border border-black/[0.04] px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span>{icon}</span>
                      <span className="text-[#17211f]">{text}</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#717182]">{risk}</span>
                  </div>
                ))}
              </div>

              <TipBox>
                Pour améliorer votre score TERAS : allez dans <strong>TERAS Connect</strong> dans le menu → <strong>Intelligence</strong>.
              </TipBox>
            </div>
          )}

          {/* ── STEP 8: Done ── */}
          {step === "done" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-emerald-50">
                <CheckCircle2 className="text-emerald-600" size={40} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#17211f]">KOMPTA est prêt !</h2>
                <p className="mt-2 text-sm text-[#717182]">
                  Votre espace est configuré. Voici vos prochaines étapes recommandées :
                </p>
              </div>

              <div className="space-y-2 text-left">
                {[
                  { icon: UserPlus, label: "Ajoutez vos employés", link: "RH → Nouveau collaborateur", done: true },
                  { icon: FileText, label: "Créez votre première facture", link: "Facturation → Nouvelle facture" },
                  { icon: HandCoins, label: "Lancez votre première paie", link: "Paie → Nouveau cycle" },
                  { icon: Bot, label: "Testez Limule pour rédiger", link: "Rédaction IA → Nouveau texte" },
                  { icon: Shield, label: "Consultez votre score TERAS", link: "TERAS Connect → Analyse" },
                ].map(({ icon: Icon, label, link, done }, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50" : "border-black/[0.06]"}`}>
                    {done
                      ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                      : <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-black/20 text-[10px] font-bold text-stone-400">{i + 1}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${done ? "text-emerald-800" : "text-[#17211f]"}`}>{label}</p>
                      <p className="text-xs text-[#717182]">{link}</p>
                    </div>
                    {!done && <ChevronRight size={14} className="text-stone-300 shrink-0" />}
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white">
                <div className="flex items-center gap-2 mb-1">
                  <Star size={16} className="text-yellow-300" />
                  <p className="font-bold text-sm">Astuce KOMPTA</p>
                </div>
                <p className="text-xs opacity-90">
                  Appuyez sur <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd> depuis n'importe quel écran pour rechercher, naviguer ou exécuter une action en moins de 2 secondes.
                </p>
              </div>

              <button
                onClick={onClose}
                className="mx-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white hover:bg-emerald-700 transition"
              >
                Accéder à mon tableau de bord <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {step !== "done" && (
          <div className="flex items-center justify-between border-t border-black/[0.05] px-6 py-3">
            <button
              onClick={canGoBack ? goBack : onClose}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-[#717182] hover:bg-black/[0.04] transition"
            >
              {canGoBack ? (
                <><ArrowLeft size={14} /> Retour</>
              ) : (
                <>Passer pour l'instant</>
              )}
            </button>

            {/* Step-specific continue buttons */}
            {step === "tour" && (
              <button
                onClick={() => setStep("company")}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 transition"
              >
                Configurer mon entreprise <ArrowRight size={14} />
              </button>
            )}
            {step === "company" && (
              <button
                onClick={submitCompany as unknown as React.MouseEventHandler}
                disabled={updateCompany.isPending || !companyForm.legal_name}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white disabled:bg-stone-300 hover:bg-emerald-700 transition"
              >
                {updateCompany.isPending ? "Enregistrement…" : "Continuer"} <ArrowRight size={14} />
              </button>
            )}
            {step === "team" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("modules")}
                  className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm font-bold text-[#717182] hover:bg-black/[0.04]"
                >
                  Passer
                </button>
                <button
                  onClick={submitEmployee as unknown as React.MouseEventHandler}
                  disabled={createEmployee.isPending}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white disabled:bg-stone-300 hover:bg-emerald-700 transition"
                >
                  <UserPlus size={14} />
                  {createEmployee.isPending ? "Création…" : "Créer et continuer"}
                </button>
              </div>
            )}
            {step === "modules" && (
              <button
                onClick={() => setStep("limule_demo")}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 transition"
              >
                Découvrir Limule <ArrowRight size={14} />
              </button>
            )}
            {step === "limule_demo" && (
              <button
                onClick={() => setStep("teras")}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 transition"
              >
                Comprendre TERAS <ArrowRight size={14} />
              </button>
            )}
            {step === "teras" && (
              <button
                onClick={() => setStep("done")}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 transition"
              >
                Terminer la configuration <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
