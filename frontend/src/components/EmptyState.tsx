import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
      <div>
        <Icon className="mx-auto text-stone-400" size={28} />
        <p className="mt-2 font-medium text-stone-600">{title}</p>
      </div>
    </div>
  );
}
