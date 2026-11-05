"use client";
import Link from "next/link";
import { useState } from "react";

interface Term { term: string; slug: string; definition: string; href: string; where: string }
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const letterOf = (t: string) => (/[A-Z]/.test(t[0].toUpperCase()) ? t[0].toUpperCase() : "#");

export function GlossaryList({ terms }: { terms: Term[] }) {
  const [f, setF] = useState("");
  const shown = terms.filter((t) => !f || (t.term + " " + t.definition).toLowerCase().includes(f.toLowerCase()));
  const groups = Object.entries(Object.groupBy(shown, (t) => letterOf(t.term)));
  const present = new Set(groups.map(([l]) => l));

  return (
    <div className="grid max-w-3xl gap-6 px-4 py-8 sm:px-8">
      <div className="fm-field">
        <label htmlFor="gf">Filter terms</label>
        <input id="gf" className="fm-input" value={f} onChange={(e) => setF(e.target.value)} placeholder="e.g. latency" />
        <p className="fm-help" aria-live="polite">{shown.length} of {terms.length} terms</p>
      </div>
      <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
        {LETTERS.map((l) =>
          present.has(l) ? (
            <a key={l} href={`#letter-${l}`} className="fm-btn fm-btn--tool no-underline">{l}</a>
          ) : (
            <span key={l} className="fm-btn fm-btn--tool" aria-disabled="true" style={{ borderStyle: "dashed", color: "var(--ink-muted)" }}>{l}</span>
          ),
        )}
      </nav>
      {shown.length === 0 && (
        <p className="m-0 text-ink-muted" data-testid="glossary-empty">
          No term or definition contains “{f}”. Try a shorter word, or <button type="button" className="underline" onClick={() => setF("")}>clear the filter</button> and search lessons too from <Link href={`/search?q=${encodeURIComponent(f)}`}>Search</Link>.
        </p>
      )}
      {groups.map(([l, items]) => (
        <section key={l} id={`letter-${l}`} aria-labelledby={`h-${l}`} className="scroll-mt-4">
          <h2 id={`h-${l}`} className="fm-h2 mb-3 border-b border-ink pb-1">{l}</h2>
          <dl className="grid gap-5">
            {items!.map((t) => (
              <div key={t.slug} id={t.slug} className="scroll-mt-4">
                <dt className="text-[18px] font-bold">{t.term}</dt>
                <dd className="m-0 mt-1 leading-relaxed">{t.definition}</dd>
                <dd className="fm-cap m-0 mt-1"><Link href={t.href}>{t.where}</Link></dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
