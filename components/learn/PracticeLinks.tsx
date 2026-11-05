import Link from "next/link";
import { getCaseStudy } from "@/lib/content";

/** Content Standard item 12: where to practise this section, from meta.practiceCaseStudyIds. */
export function PracticeLinks({ caseIds }: { caseIds: string[] }) {
  const cases = caseIds.map(getCaseStudy).filter((c) => !!c);
  return (
    <section aria-labelledby="practice-h" className="mt-12 grid max-w-[68ch] gap-4">
      <h2 id="practice-h" className="fm-h4">Practice</h2>
      <ul className="grid gap-3">
        {cases.map((c) => (
          <li key={c.meta.id}>
            <Link href={`/case-studies/${c.meta.id}`} className="fm-card block p-4 no-underline" style={{ color: "var(--ink)" }}>
              <span className="fm-cap">Case study →</span>
              <span className="mt-1 block font-semibold">{c.meta.title}</span>
              <span className="mt-1 block text-[15px] text-ink-muted">{c.meta.summary}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/studio" className="fm-card block p-4 no-underline" style={{ color: "var(--ink)" }}>
            <span className="fm-cap">Design Studio →</span>
            <span className="mt-1 block font-semibold">Draw it yourself</span>
            <span className="mt-1 block text-[15px] text-ink-muted">Sketch the design, then run traffic through it to find the bottleneck.</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
