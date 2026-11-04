import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCaseStudies } from "@/lib/content";

export const metadata: Metadata = { title: "Case Studies" };

const LEVEL = { 1: "Warm-up", 2: "Core", 3: "Hard" } as const;

export default function Page() {
  const cases = getCaseStudies().filter((c) => c.rubric).sort((a, b) => a.meta.weekRecommended - b.meta.weekRecommended || a.meta.difficulty - b.meta.difficulty || a.meta.title.localeCompare(b.meta.title));
  return (
    <>
      <PageHeader code="C-00" spec="Case studies" before="Real systems, one" em="method" after="." lede="Each case is a full worked answer in the 7-step framework, a reference design you can run, and a rubric to score your own attempt." />
      <ol className="grid gap-0 px-4 py-6 sm:px-8" aria-label="Case studies">
        {cases.map((c, i) => (
          <li key={c.meta.id} className="grid gap-1 border-b border-line py-4 sm:grid-cols-[3rem_1fr_auto] sm:items-baseline sm:gap-4">
            <span className="fm-cap">C-{String(i + 1).padStart(2, "0")}</span>
            <div className="grid gap-1">
              <Link href={`/case-studies/${c.meta.id}`} className="fm-h4">{c.meta.title}</Link>
              <p className="text-ink-muted">{c.meta.summary}</p>
            </div>
            <span className="fm-cap whitespace-nowrap">Week {c.meta.weekRecommended} · {LEVEL[c.meta.difficulty]}</span>
          </li>
        ))}
      </ol>
      {cases.length === 0 && <p className="px-4 pb-8 text-ink-muted sm:px-8">No case studies yet.</p>}
    </>
  );
}
