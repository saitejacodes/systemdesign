import Link from "next/link";
import type { Checkpoint, Flashcard, QuizQuestion, Resource } from "@/lib/content/schemas";
import { SIM_TITLES } from "@/lib/simulators/titles";

const KIND: Record<Resource["kind"], string> = { book: "Book", "free-book": "Free book", docs: "Docs", blog: "Article", paper: "Paper", video: "Video", repo: "Repo" };

export function ResourceList({ items }: { items: Resource[] }) {
  return (
    <section aria-labelledby="res-h" className="my-10">
      <h2 id="res-h" className="fm-h4 mb-3">Further reading</h2>
      <table className="fm-parts">
        <caption>Parts list · Resources</caption>
        <thead><tr><th>Kind</th><th>Title</th><th style={{ textAlign: "right", paddingRight: 0 }}>Cost</th></tr></thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td className="w-24 align-top">{KIND[r.kind]}</td>
              <td className="!normal-case">
                <a href={r.url} target="_blank" rel="noreferrer" className="font-sans text-[15px] font-semibold tracking-normal">{r.title}</a>
                {r.author && <span className="font-sans text-[14px] tracking-normal text-ink-muted"> · {r.author}</span>}
                <p className="m-0 mt-1 font-sans text-[14px] leading-snug tracking-normal text-ink-muted">{r.why}</p>
              </td>
              <td className="align-top" style={{ textAlign: "right", paddingRight: 0 }}>{r.free ? "Free" : "Paid"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Placeholder card until the simulator is registered; links to its page. */
export function SimulatorCard({ id }: { id: string }) {
  return (
    <div className="fm-card my-8">
      <div className="fm-card__head"><span>Simulator</span><span className="fm-spec"><span>S</span><span>{SIM_TITLES[id] ?? id}</span></span></div>
      <div className="fm-card__body">
        <p className="m-0">Try it in the simulator: change the inputs, break it, and watch the numbers move.</p>
      </div>
      <div className="fm-card__foot"><Link href={`/simulators/${id}`}>Open {SIM_TITLES[id] ?? id} <span aria-hidden>→</span></Link></div>
    </div>
  );
}

// Static renderings; Prompt 03 swaps these for interactive, persisted versions.
export function CheckpointListStatic({ items }: { items: Checkpoint[] }) {
  return <ul className="grid gap-3">{items.map((c) => <li key={c.id} className="fm-check"><input type="checkbox" disabled aria-label={c.text} /><span>{c.text}</span></li>)}</ul>;
}
export function QuizStatic({ items }: { items: QuizQuestion[] }) {
  return <ol className="grid gap-4">{items.map((q) => <li key={q.id}>{q.prompt}</li>)}</ol>;
}
export function FlashcardStatic({ items }: { items: Flashcard[] }) {
  return <ul className="grid gap-2">{items.map((f) => <li key={f.id}><b>{f.front}</b> — {f.back}</li>)}</ul>;
}
