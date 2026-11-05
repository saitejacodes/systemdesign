import type { ReactNode } from "react";

/** Page title block: the headline, a short lede, and whatever the page adds below (filters, progress). */
export function PageHeader({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="grid gap-4 border-b border-ink px-4 pb-8 pt-10 sm:px-8">
      <h1 className="fm-h1 max-w-[22ch] max-sm:text-[40px]">{title}</h1>
      {lede && <p className="max-w-[60ch] text-[18px] leading-relaxed text-ink-muted">{lede}</p>}
      {children}
    </header>
  );
}
