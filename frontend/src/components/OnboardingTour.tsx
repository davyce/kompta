import { useEffect, useState } from "react";
import { LayoutDashboard, ShoppingCart, ReceiptText, ArrowRight, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { LimuleIcon } from "./LimuleAvatar";

const STORAGE_KEY = "kompta_onboarding_done";

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  /** Affiche l'icône Limule (mascotte) au lieu d'une icône Lucide */
  limule?: boolean;
};

const STEPS: Step[] = [
  {
    icon: LayoutDashboard,
    title: "Voici ton tableau de bord",
    description:
      "Tu y vois ton chiffre d'affaires, ta trésorerie et les alertes importantes en un seul coup d'œil.",
    accent: "from-emerald-500 to-emerald-700",
  },
  {
    icon: ShoppingCart,
    title: "Faire une vente — POS / Caisse",
    description:
      "Pour faire une vente, clique sur Caisse dans le menu. Le POS fonctionne même hors-ligne.",
    accent: "from-sky-500 to-indigo-600",
  },
  {
    icon: ReceiptText,
    title: "Facturer un client",
    description:
      "Pour facturer un client, vas dans Factures. Tu peux créer, envoyer et suivre tes encaissements.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    icon: LayoutDashboard, // remplacé visuellement par l'icône Limule (limule:true)
    title: "Limule, ton assistant IA",
    description:
      "Limule est ton assistant IA. Pose-lui n'importe quelle question sur ton entreprise — paie, fiscalité, clients, stocks…",
    accent: "from-[#0b1f3a] to-[#1a3a5c]",
    limule: true,
  },
];

/**
 * Marque la visite guidée comme terminée — utilisé par la page Paramètres
 * pour relancer la visite manuellement.
 */
export function resetOnboardingTour() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * OnboardingTour — visite guidée 4 étapes au premier login.
 * Carte flottante centrée + overlay sombre semi-transparent.
 */
export function OnboardingTour() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.must_change_password) return; // pas durant l'activation
    let done = false;
    try {
      done = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      done = false;
    }
    if (!done) {
      // Petit délai pour laisser le Shell se monter avant d'afficher
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [user]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* no-op */
    }
    setVisible(false);
    setStep(0);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  if (!visible) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-[#1a1d23]">
        {/* Skip */}
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] dark:text-white/60"
          aria-label="Fermer la visite guidée"
        >
          <X size={16} />
        </button>

        {/* Header w/ accent gradient */}
        <div className={`bg-gradient-to-br ${current.accent} px-6 pb-5 pt-7 text-white`}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
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
          <p className="text-sm leading-relaxed text-[#3f4a55] dark:text-white/75">
            {current.description}
          </p>

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === step
                    ? "w-6 bg-emerald-600"
                    : idx < step
                    ? "w-1.5 bg-emerald-300"
                    : "w-1.5 bg-stone-300 dark:bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] bg-stone-50 px-6 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-[#717182] hover:text-[#17211f] dark:hover:text-white"
          >
            Passer
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            {isLast ? "Terminé" : "Suivant"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
