import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignViewer } from "@/components/case-studies/DesignViewer";
import { SolutionRenderer } from "@/components/case-studies/SolutionRenderer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCaseStudy, getSectionById, sectionHref } from "@/lib/content";
import { templateById } from "@/lib/studio/templates";

export async function generateMetadata({ params }: PageProps<"/case-studies/[id]">): Promise<Metadata> {
  const c = getCaseStudy(decodeURIComponent((await params).id));
  return { title: c ? c.meta.title : "Case study" };
}

export default async function Page({ params }: PageProps<"/case-studies/[id]">) {
  const c = getCaseStudy(decodeURIComponent((await params).id));
  if (!c || !c.rubric) notFound();
  const { meta } = c;
  const related = meta.relatedSectionIds.map(getSectionById).filter((s) => s !== undefined);
  const tp = meta.trafficProfile;
  return (
    <>
      <PageHeader title={meta.title} lede={meta.summary}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/interview/${meta.id}`} className="fm-btn fm-btn--primary">Mock interview</Link>
          {templateById(meta.id) && <Link href={`/studio/new?template=${meta.id}`} className="fm-btn fm-btn--tool">Practise in Design Studio</Link>}
        </div>
      </PageHeader>
      <div className="grid gap-8 px-4 py-6 sm:px-8 xl:grid-cols-[minmax(0,75ch)_1fr]">
        <article className="min-w-0">
          <details className="mb-8 border border-ink p-4" style={{ borderRadius: 4 }}>
            <summary className="fm-cap cursor-pointer !text-ink">Try it first · the interviewer&apos;s prompt</summary>
            <p className="mt-3 text-[18px] leading-relaxed">{meta.interviewerPrompt}</p>
            <p className="fm-help mt-2">Spend 10 minutes on requirements and a sketch before reading on. The answer sticks far better once you have been stuck on it.</p>
          </details>
          <SolutionRenderer source={c.solution} />
        </article>
        <aside className="grid content-start gap-6 xl:sticky xl:top-4">
          {c.design && <DesignViewer graph={c.design} label="Reference design" height={420} />}
          <dl className="grid grid-cols-2 gap-px border border-ink bg-line" style={{ borderRadius: 2 }}>
            {[["Avg QPS", tp.qps.toLocaleString("en-US")], ["Peak", `${tp.peakMultiplier}×`], ["Read:write", `${tp.readWriteRatio}:1`], ["Week", String(meta.weekRecommended)]].map(([k, v]) => (
              <div key={k} className="bg-paper p-3"><dt className="fm-cap">{k}</dt><dd className="fm-metric mt-1 text-[20px]">{v}</dd></div>
            ))}
          </dl>
          <section aria-labelledby="rc-h" className="grid gap-1">
            <h2 id="rc-h" className="fm-cap border-b border-ink pb-1">Run challenge</h2>
            <p className="font-medium">{meta.runChallenge.title}</p>
            <p className="text-[15px] text-ink-muted">{meta.runChallenge.description}</p>
          </section>
          {related.length > 0 && (
            <section aria-labelledby="rel-h" className="grid gap-1">
              <h2 id="rel-h" className="fm-cap border-b border-ink pb-1">Lessons it draws on</h2>
              <ul className="grid gap-1">{related.map((s) => <li key={s.meta.id}><Link href={sectionHref(s.meta)}>{s.meta.title}</Link></li>)}</ul>
            </section>
          )}
          <section aria-labelledby="cm-h" className="grid gap-1">
            <h2 id="cm-h" className="fm-cap border-b border-ink pb-1">Common mistakes</h2>
            <ul className="grid list-disc gap-1 pl-5 text-[15px]">{meta.commonMistakes.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
        </aside>
      </div>
    </>
  );
}
