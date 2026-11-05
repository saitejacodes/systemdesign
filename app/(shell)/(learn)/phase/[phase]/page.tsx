import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSectionsByPhase, sectionHref } from "@/lib/content";
import { PHASES, weekLabel } from "@/lib/curriculum";

export const dynamicParams = false;
export const generateStaticParams = () => PHASES.map((p) => ({ phase: String(p.n) }));

export async function generateMetadata({ params }: PageProps<"/phase/[phase]">): Promise<Metadata> {
  return { title: `Phase ${(await params).phase}` };
}

export default async function Page({ params }: PageProps<"/phase/[phase]">) {
  const n = (await params).phase;
  const phase = PHASES.find((p) => String(p.n) === n);
  if (!phase) notFound();
  const sections = getSectionsByPhase(phase.n);
  return (
    <>
      <PageHeader title={phase.name} lede={`Phase ${phase.n} · ${weekLabel(phase.weeks)}`} />
      <div className="grid max-w-3xl gap-3 px-4 py-8 sm:px-8">
        {sections.length === 0 && <p className="fm-cap">Coming soon · lessons for this phase are being written</p>}
        {sections.map(({ meta }) => (
          <Link key={meta.id} href={sectionHref(meta)} className="fm-card block p-4 no-underline" style={{ color: "var(--ink)" }}>
            <span className="fm-cap">{meta.phase}.{meta.order} · Week {meta.week} · {meta.estimatedMinutes} min</span>
            <span className="mt-1 block text-[18px] font-bold">{meta.title}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
