/**
 * ChartWrapper — enveloppe standard pour tous les graphiques Recharts.
 *
 * Règle le problème de width(-1)/height(-1) qui génère des warnings et des charts
 * vides au premier rendu. Recharts a besoin d'un conteneur avec des dimensions
 * stables avant de s'initialiser. Ce composant :
 *  - force un min-height via la prop `minH`
 *  - affiche un skeleton animé pendant que les données chargent
 *  - affiche un empty-state si les données sont vides
 */
import { useTranslation } from "react-i18next";
import { BarChart2 } from "lucide-react";

interface ChartWrapperProps {
  /** Hauteur minimale du conteneur (tailwind class, ex: "h-64") */
  minH?: string;
  /** Affiche le skeleton de chargement */
  loading?: boolean;
  /** Affiche l'état vide si true */
  empty?: boolean;
  /** Message d'état vide (i18n key OU texte brut) */
  emptyLabel?: string;
  children: React.ReactNode;
}

export function ChartWrapper({
  minH = "h-64",
  loading = false,
  empty = false,
  emptyLabel,
  children,
}: ChartWrapperProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className={`${minH} w-full animate-pulse rounded-xl bg-[#f1f5f9] dark:bg-white/[0.05]`} />
    );
  }

  if (empty) {
    const label = emptyLabel
      ? (t(emptyLabel, { defaultValue: emptyLabel }))
      : t("chart.noData", { defaultValue: "Pas encore assez de données" });
    return (
      <div
        className={`${minH} flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#e2e8f0] dark:border-white/10`}
      >
        <BarChart2 size={28} className="text-[#94a3b8] dark:text-white/30" />
        <p className="text-sm font-medium text-[#94a3b8] dark:text-white/40">{label}</p>
      </div>
    );
  }

  return (
    <div className={`${minH} w-full`}>
      {children}
    </div>
  );
}
