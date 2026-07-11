/**
 * Classes partagées pour les tableaux de données (finance, RH, inventaire…).
 * Objectif : une seule convention de densité/typo pour tous les tableaux,
 * au lieu de chaque page qui réinvente son propre px-4/py-3.
 * Adoption incrémentale : ces classes remplacent les classes ad-hoc
 * existantes page par page, sans changer la structure <table>/<tr>/<td>.
 */

export const tableWrap = "overflow-x-auto";
export const table = "w-full text-sm";

export const theadRow =
  "border-b border-black/[0.06] dark:border-white/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-[#717182]";
export const th = "px-4 py-3.5";
export const thSortable = `${th} cursor-pointer select-none`;
export const thRight = `${th} text-right`;
export const thSortableRight = `${thSortable} text-right`;

export const tbody = "divide-y divide-black/[0.04] dark:divide-white/[0.04]";
export const tr = "group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition";
export const td = "px-4 py-3.5";
export const tdRight = `${td} text-right`;
export const tdMuted = `${td} text-xs text-[#717182]`;
