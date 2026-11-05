import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatorLoader } from "@/components/sim/SimulatorLoader";
import { getSectionById, sectionHref } from "@/lib/content";
import { getSim, REGISTRY } from "@/lib/simulators/registry";

export const dynamicParams = false;
export const generateStaticParams = () => REGISTRY.map((s) => ({ id: s.id }));

export async function generateMetadata({ params }: PageProps<"/simulators/[id]">): Promise<Metadata> {
  return { title: getSim((await params).id)?.title ?? "Simulator" };
}

export default async function Page({ params }: PageProps<"/simulators/[id]">) {
  const entry = getSim((await params).id);
  if (!entry) notFound();
  const lessons = entry.sectionIds.map((id) => getSectionById(id)).filter((s) => !!s);
  return (
    <div className="grid gap-4 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="fm-cap">Simulator · Phase {entry.phase}</span>
        {lessons.map((s) => <Link key={s.meta.id} href={sectionHref(s.meta)} className="fm-cap inline-flex min-h-11 items-center">Lesson · {s.meta.title} →</Link>)}
      </div>
      <h1 className="fm-h2">{entry.title}</h1>
      <p className="max-w-[70ch] text-ink-muted">{entry.summary}</p>
      <SimulatorLoader id={entry.id} />
    </div>
  );
}
