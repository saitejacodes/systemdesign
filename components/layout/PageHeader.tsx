import type { ReactNode } from "react";
import { FigureCaption, SpecLabel } from "@/components/brand";

/** Page title block: spec label, headline with one accent word, short lede. */
export function PageHeader({ code, spec, before, em, after = "", lede, children }: { code: string; spec: string; before: string; em: string; after?: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="grid gap-5 border-b border-ink px-4 pb-8 pt-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FigureCaption parts={[code, spec]} />
        <SpecLabel code={code} parts={[spec]} note="Rev. A" />
      </div>
      <h1 className="fm-h1 max-sm:text-[44px]">{before} <span className="fm-em">{em}</span>{after}</h1>
      {lede && <p className="max-w-[60ch] text-[18px] leading-relaxed text-ink-muted">{lede}</p>}
      {children}
    </header>
  );
}
