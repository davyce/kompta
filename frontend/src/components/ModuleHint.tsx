import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { LimuleIcon } from "./LimuleAvatar";

/**
 * Indice contextuel « première visite » pour un module donné.
 *
 * Contrairement à la visite guidée (GuidedTour, 30 étapes) qui couvre toute
 * l'application d'un coup à la première connexion, ModuleHint affiche une
 * courte bannière non bloquante la première fois qu'un utilisateur ouvre
 * CE module précis — l'utilisateur peut interagir avec la page immédiatement
 * et l'indice ne réapparaît plus une fois fermé.
 *
 * Persistance : localStorage, scopée par utilisateur (id) + module, pour
 * éviter qu'un compte masque l'indice pour un autre sur un poste partagé.
 */

function storageKey(userId: string | number | undefined, moduleId: string): string {
  return `kompta_hint_seen_${userId ?? "anon"}_${moduleId}`;
}

export function ModuleHint({
  moduleId,
  title,
  body,
}: {
  moduleId: string;
  title: string;
  body: string;
}) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    let seen = false;
    try { seen = localStorage.getItem(storageKey(user.id, moduleId)) === "1"; } catch { /* */ }
    setVisible(!seen);
  }, [user, moduleId]);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(storageKey(user?.id, moduleId), "1"); } catch { /* */ }
  }

  if (!visible || !user) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <LimuleIcon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-emerald-800/90 dark:text-emerald-100/80">{body}</p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Fermer"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-emerald-700/70 hover:bg-emerald-600/10 dark:text-emerald-200/70 dark:hover:bg-white/10"
      >
        <X size={15} />
      </button>
    </div>
  );
}
