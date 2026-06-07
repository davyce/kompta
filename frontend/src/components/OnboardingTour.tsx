import { useEffect, useState } from "react";
import {
  ArrowRight, BarChart3, Building2, FileText, Landmark, LayoutDashboard,
  Package, ReceiptText, ShoppingCart, Users, Users2, Wallet, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { LimuleIcon } from "./LimuleAvatar";

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  limule?: boolean;
};

const STEPS: Step[] = [
  {
    icon: Building2,
    title: "Bienvenue sur KOMPTA 👋",
    description:
      "KOMPTA gère toute ton entreprise au même endroit : ventes, factures, stock, paie, comptabilité et IA. Voici une visite rapide des grandes fonctions. (≈ 1 min)",
    accent: "from-emerald-500 to-emerald-700",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord",
    description:
      "Ton cockpit : chiffre d'affaires, trésorerie, marges et alertes importantes en un coup d'œil. Tout se met à jour automatiquement.",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    icon: ShoppingCart,
    title: "Caisse (POS)",
    description:
      "Encaisse tes ventes en quelques secondes — espèces, carte ou Mobile Money. La caisse fonctionne même sans connexion et se synchronise au retour du réseau.",
    accent: "from-sky-500 to-indigo-600",
  },
  {
    icon: ReceiptText,
    title: "Factures",
    description:
      "Crée des factures avec TVA, suis les paiements, envoie des relances. Chaque encaissement met à jour ta trésorerie et ta comptabilité.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    icon: Package,
    title: "Inventaire & stock",
    description:
      "Gère tes produits et ton stock en temps réel. KOMPTA t'alerte quand un article passe sous son seuil de réapprovisionnement.",
    accent: "from-cyan-500 to-blue-600",
  },
  {
    icon: Users,
    title: "RH & Paie",
    description:
      "Gère tes employés et génère les bulletins de paie (CNSS + IRPP calculés automatiquement), avec export PDF conforme.",
    accent: "from-violet-500 to-purple-700",
  },
  {
    icon: Landmark,
    title: "Comptabilité SYSCOHADA",
    description:
      "Chaque vente et facture génère son écriture comptable équilibrée automatiquement. Grand livre, balance et bilan toujours à jour.",
    accent: "from-teal-600 to-emerald-700",
  },
  {
    icon: Wallet,
    title: "Transactions & trésorerie",
    description:
      "Toutes tes entrées et sorties d'argent au même endroit (caisse, factures, imports bancaires). Importe ton relevé, Limule l'analyse.",
    accent: "from-emerald-500 to-green-700",
  },
  {
    icon: FileText,
    title: "Déclarations fiscales",
    description:
      "TVA, CNSS, impôts… KOMPTA prépare tes déclarations et génère les documents prêts à déposer, avec une checklist de conformité.",
    accent: "from-rose-500 to-red-600",
  },
  {
    icon: BarChart3,
    title: "Rapports & analyses",
    description:
      "Visualise tes performances : revenus, marges, top clients, rentabilité par produit. Exporte en PDF, Excel ou CSV.",
    accent: "from-indigo-500 to-blue-700",
  },
  {
    icon: Users2,
    title: "Groupes & organisations",
    description:
      "Gère tontines, mutuelles, ONG et associations : membres, cotisations, caisse, réunions, votes et chat — avec leur propre comptabilité.",
    accent: "from-fuchsia-500 to-violet-700",
  },
  {
    icon: LayoutDashboard, // remplacé visuellement par l'icône Limule
    title: "Limule, ton assistant IA",
    description:
      "Pose n'importe quelle question sur ton entreprise — paie, fiscalité, clients, trésorerie. Limule analyse tes données et te conseille. Tu es prêt ! 🚀",
    accent: "from-[#0b1f3a] to-[#1a3a5c]",
    limule: true,
  },
];

/**
 * Relance manuelle de la visite (depuis Paramètres). Remet le flag local ;
 * le flag serveur sera mis à jour à la prochaine complétion.
 */
export function resetOnboardingTour() {
  try {
    localStorage.setItem("kompta_force_tour", "1");
  } catch {
    /* no-op */
  }
}

/**
 * OnboardingTour — visite guidée profonde de toute l'app.
 * S'affiche UNE seule fois, à la première connexion de chaque utilisateur
 * (flag `onboarding_done` stocké sur le compte, robuste multi-appareils).
 */
export function OnboardingTour() {
  const { user, setUser } = useAuth();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.must_change_password) return; // pas durant l'activation
    let forced = false;
    try {
      forced = localStorage.getItem("kompta_force_tour") === "1";
    } catch {
      forced = false;
    }
    if (!user.onboarding_done || forced) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [user]);

  function finish() {
    setVisible(false);
    setStep(0);
    try {
      localStorage.removeItem("kompta_force_tour");
    } catch {
      /* no-op */
    }
    // Marque définitivement la visite comme vue pour cet utilisateur.
    api.markOnboardingDone()
      .then((u) => setUser(u))
      .catch(() => {
        if (user) setUser({ ...user, onboarding_done: true });
      });
  }

  function next() {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  }

  if (!visible) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-[#1a1d23]">
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/15"
          aria-label="Fermer la visite guidée"
        >
          <X size={16} />
        </button>

        {/* Header w/ accent gradient */}
        <div className={`bg-gradient-to-br ${current.accent} px-6 pb-5 pt-7 text-white`}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
              {current.limule ? <LimuleIcon size={30} /> : <Icon size={24} />}
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                Étape {step + 1} / {STEPS.length}
              </p>
              <h2 id="onboarding-title" className="text-lg font-black leading-tight">
                {current.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="min-h-[88px] text-sm leading-relaxed text-[#3f4a55] dark:text-white/75">
            {current.description}
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] bg-stone-50 px-6 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-[#717182] hover:text-[#17211f] dark:hover:text-white"
          >
            Passer la visite
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                Précédent
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              {isLast ? "Terminer" : "Suivant"}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
