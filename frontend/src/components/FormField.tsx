import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// text-base sur mobile (≥16px) pour éviter le zoom auto iOS Safari sur focus.
// py-2.5 sur mobile = ~44px de hauteur tactile (recommandation iOS).
export function TextInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-stone-500">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

export function SelectInput({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-stone-500">{label}</span>
      <select
        {...props}
        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      >
        {children}
      </select>
    </label>
  );
}

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }
>(function TextArea({ label, ...props }, ref) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-stone-500">{label}</span>
      <textarea
        ref={ref}
        {...props}
        className="mt-1 min-h-28 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
});
