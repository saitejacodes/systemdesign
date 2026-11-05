import type { ReactNode } from "react";
import { FigureCaption } from "@/components/brand";

// Lesson boxes, styled by design/components (fm-box family). Server components.

export function TradeoffBox({ title, items }: { title?: string; items: { gain: string; cost: string }[] }) {
  return (
    <div className="fm-box my-8">
      <div className="fm-box__head"><span className="fm-box__glyph" aria-hidden="true">⇄</span>Tradeoff{title && ` · ${title}`}</div>
      <div className="fm-tradeoff max-sm:!grid-cols-1">
        <div className="gain"><p className="k">+ Gain</p><ul className="m-0 grid gap-1.5 pl-[18px]">{items.map((i) => <li key={i.gain}>{i.gain}</li>)}</ul></div>
        <div className="cost max-sm:!border-l-0 max-sm:border-t max-sm:border-ink"><p className="k">− Cost</p><ul className="m-0 grid gap-1.5 pl-[18px]">{items.map((i) => <li key={i.cost}>{i.cost}</li>)}</ul></div>
      </div>
    </div>
  );
}

export function NotWhenBox({ title, items }: { title?: string; items: string[] }) {
  return (
    <div className="fm-box fm-box--notwhen my-8">
      <div className="fm-box__head"><span className="fm-box__glyph" aria-hidden="true">✕</span>Not when{title && ` · ${title}`}</div>
      <div className="fm-box__body"><ul>{items.map((i) => <li key={i}><span className="m" aria-hidden="true">✕</span><span>{i}</span></li>)}</ul></div>
    </div>
  );
}

export function Misconception({ wrong, right }: { wrong: string; right: string }) {
  return (
    <div className="fm-box my-6">
      <div className="fm-box__head"><span className="fm-box__glyph" aria-hidden="true">≠</span>Misconception</div>
      <div className="fm-box__body fm-mis">
        <div className="wrong"><span className="tag w">✕ Wrong</span><span className="sr-only">Wrong: </span>{wrong}</div>
        <div><span className="tag r">✓ Right</span><span className="sr-only">Right: </span>{right}</div>
      </div>
    </div>
  );
}

export function InterviewAngle({ title, questions, children }: { title?: string; questions: string[]; children?: ReactNode }) {
  return (
    <div className="fm-box fm-box--interview my-8">
      <div className="fm-box__head"><span className="fm-box__glyph" aria-hidden="true">?</span>Interview angle{title && ` · ${title}`}</div>
      <div className="fm-box__body grid gap-3">
        {children}
        <ol>{questions.map((q) => <li key={q}>{q}</li>)}</ol>
      </div>
    </div>
  );
}

const CALLOUT = { info: ["i", "Note"], warning: ["!", "Warning"], tip: ["→", "Tip"], example: ["#", "Example"], analogy: ["≈", "Analogy"] } as const;
export function Callout({ type = "info", title, children }: { type?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const [g, label] = CALLOUT[type];
  return (
    <aside className="fm-box my-6" aria-label={label}>
      <div className="fm-box__head" style={type === "warning" ? { color: "var(--status-hot)" } : undefined}><span className="fm-box__glyph" aria-hidden="true">{g}</span>{label}{title && ` · ${title}`}</div>
      <div className="fm-box__body [&>p]:m-0 [&>p+p]:mt-3">{children}</div>
    </aside>
  );
}

/** Wraps a diagram with its FIG caption: caption="FIG. 1.1 · SUBJECT · DETAIL". */
export function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  const parts = caption.split("·").map((s) => s.trim());
  return (
    <figure className="my-8 grid gap-3">
      <figcaption><FigureCaption parts={parts} /></figcaption>
      <div className="overflow-x-auto rounded-[4px] border border-ink bg-surface p-4" tabIndex={0} role="region" aria-label={parts[1] ?? caption}>{children}</div>
    </figure>
  );
}

/** A Markdown table in a sideways-scrolling box that keyboard users can focus and scroll. */
export function ScrollTable({ children, className = "my-6" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${className} overflow-x-auto`} tabIndex={0} role="region" aria-label="Table, scrolls sideways">
      <table className="fm-parts">{children}</table>
    </div>
  );
}
