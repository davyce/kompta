import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
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

  // Démarrage : 1ʳᵉ connexion (flag compte) ou relance manuelle.
  useEffect(() => {
    if (!user || user.must_change_password) return;
    let forced = false;
    try { forced = localStorage.getItem("kompta_force_tour") === "1"; } catch { /* */ }
    if (!user.onboarding_done || forced) {
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
      if (tries < 14) timer = window.setTimeout(tick, 160);
      else { targetElRef.current = null; setRect(null); } // fallback : bulle centrée
    };
    tick();
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
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let bubbleStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + 16 + 230 < vh;
    const top = below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - 230);
    let left = rect.left + rect.width / 2 - 170;
    left = Math.max(12, Math.min(left, vw - 352));
    bubbleStyle = { position: "fixed", top, left, width: 340 };
  } else {
    bubbleStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 340 };
  }

  const Icon = step.limule ? null : Sparkles;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
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
        className="overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d23]"
      >
        <div className="flex items-start gap-3 bg-gradient-to-br from-emerald-500 to-emerald-700 px-5 pb-4 pt-5 text-white">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
            {step.limule ? <LimuleIcon size={24} /> : Icon && <Icon size={20} />}
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
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-[#3f4a55] dark:text-white/75">{tr(step.bodyTk)}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between">
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
    </div>
  );
}
