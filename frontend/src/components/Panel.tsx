import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, action, children }: PanelProps) {
  return (
    <section className="min-w-0 rounded-xl border border-black/[0.06] bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1e2229]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.05]">
        <h2 className="text-base font-bold text-[#17211f] dark:text-white">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
