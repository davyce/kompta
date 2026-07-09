import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { LimuleIcon } from "./LimuleAvatar";

/**
 * Visite guidée interactive « spotlight » :
 * - navigue vers la bonne page à chaque étape,
 * - surligne le VRAI élément (bouton, formulaire) avec une découpe lumineuse,
 * - place une bulle explicative à côté.
 * S'affiche une seule fois (champ compte `onboarding_done`).
 */

type TourStep = {
  route?: string;       // page à ouvrir avant l'étape
  selector?: string;    // élément à surligner (data-tour)
  titleTk: string;
  bodyTk: string;
  limule?: boolean;
};

const STEPS: TourStep[] = [
  {
    titleTk: "components.guidedTour.steps.welcome.title",
    bodyTk: "components.guidedTour.steps.welcome.body",
  },
  {
    route: "/", selector: "[data-tour='nav']",
    titleTk: "components.guidedTour.steps.menu.title",
    bodyTk: "components.guidedTour.steps.menu.body",
  },
  {
    route: "/", selector: "[data-tour='kpis']",
    titleTk: "components.guidedTour.steps.dashboard.title",
    bodyTk: "components.guidedTour.steps.dashboard.body",
  },
  {
    route: "/clients",
    titleTk: "components.guidedTour.steps.clients.title",
    bodyTk: "components.guidedTour.steps.clients.body",
  },
  {
    route: "/pos", selector: "[data-tour='pos-checkout']",
    titleTk: "components.guidedTour.steps.pos.title",
    bodyTk: "components.guidedTour.steps.pos.body",
  },
  {
    route: "/billing", selector: "[data-tour='new-invoice']",
    titleTk: "components.guidedTour.steps.invoice.title",
    bodyTk: "components.guidedTour.steps.invoice.body",
  },
  {
    route: "/inventory", selector: "[data-tour='add-product']",
    titleTk: "components.guidedTour.steps.stock.title",
    bodyTk: "components.guidedTour.steps.stock.body",
  },
  {
    route: "/employees",
    titleTk: "components.guidedTour.steps.employees.title",
    bodyTk: "components.guidedTour.steps.employees.body",
  },
  {
    route: "/payroll",
    titleTk: "components.guidedTour.steps.payroll.title",
    bodyTk: "components.guidedTour.steps.payroll.body",
  },
  {
    route: "/projects",
    titleTk: "components.guidedTour.steps.projects.title",
    bodyTk: "components.guidedTour.steps.projects.body",
  },
  {
    route: "/transactions",
    titleTk: "components.guidedTour.steps.transactions.title",
    bodyTk: "components.guidedTour.steps.transactions.body",
  },
  {
    route: "/accounting",
    titleTk: "components.guidedTour.steps.accounting.title",
    bodyTk: "components.guidedTour.steps.accounting.body",
  },
  {
    route: "/investments",
    titleTk: "components.guidedTour.steps.investments.title",
    bodyTk: "components.guidedTour.steps.investments.body",
  },
  {
    route: "/budget",
    titleTk: "components.guidedTour.steps.budget.title",
    bodyTk: "components.guidedTour.steps.budget.body",
  },
  {
    route: "/analytics",
    titleTk: "components.guidedTour.steps.analytics.title",
    bodyTk: "components.guidedTour.steps.analytics.body",
  },
  {
    route: "/documents",
    titleTk: "components.guidedTour.steps.documents.title",
    bodyTk: "components.guidedTour.steps.documents.body",
  },
  {
    route: "/declarations",
    titleTk: "components.guidedTour.steps.declarations.title",
    bodyTk: "components.guidedTour.steps.declarations.body",
  },
  {
    route: "/audit",
    titleTk: "components.guidedTour.steps.audit.title",
    bodyTk: "components.guidedTour.steps.audit.body",
  },
  {
    route: "/reports",
    titleTk: "components.guidedTour.steps.reports.title",
    bodyTk: "components.guidedTour.steps.reports.body",
  },
  {
    route: "/fiscal",
    titleTk: "components.guidedTour.steps.fiscal.title",
    bodyTk: "components.guidedTour.steps.fiscal.body",
  },
  {
    route: "/legislation",
    titleTk: "components.guidedTour.steps.legislation.title",
    bodyTk: "components.guidedTour.steps.legislation.body",
  },
  {
    route: "/chat",
    titleTk: "components.guidedTour.steps.chat.title",
    bodyTk: "components.guidedTour.steps.chat.body",
  },
  {
    route: "/kanban",
    titleTk: "components.guidedTour.steps.tasks.title",
    bodyTk: "components.guidedTour.steps.tasks.body",
  },
  {
    route: "/calendar",
    titleTk: "components.guidedTour.steps.calendar.title",
    bodyTk: "components.guidedTour.steps.calendar.body",
  },
  {
    route: "/meetings",
    titleTk: "components.guidedTour.steps.meetings.title",
    bodyTk: "components.guidedTour.steps.meetings.body",
  },
  {
    route: "/notes",
    titleTk: "components.guidedTour.steps.notes.title",
    bodyTk: "components.guidedTour.steps.notes.body",
  },
  {
    route: "/groups",
    titleTk: "components.guidedTour.steps.groups.title",
    bodyTk: "components.guidedTour.steps.groups.body",
  },
  {
    route: "/help",
    titleTk: "components.guidedTour.steps.help.title",
    bodyTk: "components.guidedTour.steps.help.body",
  },
  {
    route: "/", selector: "[data-tour='limule']",
    titleTk: "components.guidedTour.steps.limule.title",
    bodyTk: "components.guidedTour.steps.limule.body",
    limule: true,
  },
  {
    route: "/settings?tab=subscription", selector: "[data-tour='settings-content']",
    titleTk: "components.guidedTour.steps.settings.title",
    bodyTk: "components.guidedTour.steps.settings.body",
  },
];

const PAD = 8;

/** Relance la visite manuellement (depuis Paramètres). */
export function resetOnboardingTour() {
  try { localStorage.setItem("kompta_force_tour", "1"); } catch { /* no-op */ }
}

const DISCOVER_BANNER_DISMISS_KEY = "kompta_discover_banner_dismissed";

/**
 * Petite bannière non bloquante proposant la visite guidée complète en
 * opt-in (au lieu du lancement automatique et forcé d'avant). Affichée sur
 * le tableau de bord tant qu'elle n'a pas été fermée ou que la visite n'a
 * pas déjà été suivie.
 */
export function DiscoverTourBanner() {
  const { t: tr } = useTranslation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user) return;
    let hidden = false;
    try { hidden = localStorage.getItem(DISCOVER_BANNER_DISMISS_KEY) === "1"; } catch { /* */ }
    setDismissed(user.onboarding_done === true || hidden);
  }, [user]);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISCOVER_BANNER_DISMISS_KEY, "1"); } catch { /* */ }
  }

  function start() {
    resetOnboardingTour();
    setDismissed(true);
    window.location.reload();
  }

  if (dismissed || !user || user.role === "super_admin") return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm dark:border-emerald-500/25 dark:bg-[#1a1d23]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <LimuleIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#17211f] dark:text-white">{tr("components.guidedTour.discoverTitle")}</p>
        <p className="text-xs text-[#717182]">{tr("components.guidedTour.discoverBody")}</p>
      </div>
      <button
        onClick={start}
        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
      >
        {tr("components.guidedTour.discoverCta")}
      </button>
      <button onClick={dismiss} aria-label="Fermer" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
        <X size={15} />
      </button>
    </div>
  );
}

function findVisible(selector?: string): HTMLElement | null {
  if (!selector) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return els.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? els[0] ?? null;
}

export function GuidedTour() {
  const { t: tr } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const targetElRef = useRef<HTMLElement | null>(null);

  // Démarrage : uniquement sur relance manuelle (bouton "Faire le tour complet"
  // depuis le tableau de bord ou Paramètres). La visite ne se lance plus
  // automatiquement à la première connexion — cette charge est désormais
  // portée par les indices contextuels par module (ModuleHint), affichés
  // progressivement à la première visite de chaque page.
  useEffect(() => {
    if (!user || user.must_change_password) return;
    let forced = false;
    try { forced = localStorage.getItem("kompta_force_tour") === "1"; } catch { /* */ }
    if (forced) {
      const t = setTimeout(() => setActive(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [user]);

  const step = STEPS[idx];

  // Localise l'élément cible de l'étape (navigue d'abord, puis cherche avec retries).
  const locate = useCallback(() => {
    if (!step.selector) { targetElRef.current = null; setRect(null); return; }
    let tries = 0;
    let timer: number;
    // Certaines pages sont chargées à la demande (React.lazy) : le chunk
    // peut ne pas être encore monté juste après navigate(). On laisse donc
    // plus de marge (jusqu'à ~4.8s) avant d'abandonner et de retomber sur
    // une bulle centrée.
    const tick = () => {
      const el = findVisible(step.selector);
      if (el) {
        targetElRef.current = el;
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        // laisse le scroll se faire avant de mesurer
        window.setTimeout(() => setRect(el.getBoundingClientRect()), 320);
        return;
      }
      tries += 1;
      if (tries < 24) timer = window.setTimeout(tick, 200);
      else { targetElRef.current = null; setRect(null); } // fallback : bulle centrée
    };
    timer = window.setTimeout(tick, 150);
    return () => window.clearTimeout(timer);
  }, [step.selector]);

  useEffect(() => {
    if (!active) return;
    if (step.route) navigate(step.route);
    const cleanup = locate();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx]);

  // Recalcule la position si on scrolle / redimensionne.
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      if (targetElRef.current) setRect(targetElRef.current.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, idx]);

  function finish() {
    setActive(false);
    setIdx(0);
    try { localStorage.removeItem("kompta_force_tour"); } catch { /* */ }
    api.markOnboardingDone().then(setUser).catch(() => {
      if (user) setUser({ ...user, onboarding_done: true });
    });
  }
  function next() { idx >= STEPS.length - 1 ? finish() : setIdx((i) => i + 1); }
  function prev() { setIdx((i) => Math.max(0, i - 1)); }

  if (!active || !user || user.role === "super_admin") return null;

  const isLast = idx === STEPS.length - 1;
  const progress = Math.round(((idx + 1) / STEPS.length) * 100);

  // Position de la bulle : sous la cible si place, sinon au-dessus ; sinon centrée.
  // Largeur et hauteur responsives pour ne jamais déborder / rogner sur mobile.
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const bubbleW = Math.min(340, vw - 24);
  const bubbleMaxH = Math.min(440, vh - 24);
  const estH = Math.min(300, bubbleMaxH);
  let bubbleStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + 16 + estH < vh;
    const top = below
      ? Math.min(rect.bottom + 14, vh - estH - 12)
      : Math.max(12, rect.top - 14 - estH);
    let left = rect.left + rect.width / 2 - bubbleW / 2;
    left = Math.max(12, Math.min(left, vw - bubbleW - 12));
    bubbleStyle = { position: "fixed", top, left, width: bubbleW, maxHeight: bubbleMaxH };
  } else {
    bubbleStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: bubbleW, maxHeight: bubbleMaxH };
  }

  return (
    // z-[120] : au-dessus de CompanySetupWizard (z-85) et SubscriptionGate
    // (z-100), sinon la visite se lance mais reste cachée derrière ces
    // overlays plein écran — ce qui la rendait invisible pour les comptes
    // fraîchement créés (assistant de configuration encore actif).
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      {/* Spotlight : assombrit tout sauf la cible (découpe via box-shadow) */}
      {rect ? (
        <div
          style={{
            position: "fixed",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(10,15,25,0.72)",
            border: "2px solid #34d399",
            transition: "all 0.25s ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(10,15,25,0.72)]" />
      )}

      {/* Bulle explicative */}
      <div
        style={bubbleStyle}
        className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d23]"
      >
        <div className="flex shrink-0 items-start gap-3 bg-gradient-to-br from-emerald-500 to-emerald-700 px-5 pb-4 pt-5 text-white">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
            <LimuleIcon size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
              {tr("components.guidedTour.stepCount", { current: idx + 1, total: STEPS.length })}
            </p>
            <h3 className="text-base font-black leading-tight">{tr(step.titleTk)}</h3>
          </div>
          <button onClick={finish} aria-label={tr("common.close")} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/15">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-relaxed text-[#3f4a55] dark:text-white/75">{tr(step.bodyTk)}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {/* Pied — toujours visible (shrink-0), jamais masqué par le scroll du corps.
            Garantit une échappatoire "Passer" atteignable en 1 tap dès l'étape 1. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-3 dark:border-white/10">
          <button onClick={finish} className="text-xs font-semibold text-[#717182] hover:text-[#17211f] dark:hover:text-white">
            {tr("components.guidedTour.skip")}
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={prev} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                {tr("components.guidedTour.previous")}
              </button>
            )}
            <button onClick={next} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              {isLast ? tr("components.guidedTour.finish") : tr("components.guidedTour.next")}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
