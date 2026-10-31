import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DepthStamp, FigureCaption, SpecLabel } from "@/components/brand";
import { SetHud } from "@/components/layout/SetHud";
import { LessonRenderer, lessonHeadings } from "@/components/learn/LessonRenderer";
import { getAllSections, getSection, sectionHref } from "@/lib/content";
import { PHASES } from "@/lib/curriculum";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSections().map((s) => ({ phase: String(s.meta.phase), section: s.meta.slug }));
}

export async function generateMetadata({ params }: PageProps<"/phase/[phase]/[section]">): Promise<Metadata> {
  const p = await params;
  return { title: getSection(Number(p.phase), p.section)?.meta.title ?? "Lesson" };
}

const words = (s: string) => s.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export default async function Page({ params }: PageProps<"/phase/[phase]/[section]">) {
  const p = await params;
  const section = getSection(Number(p.phase), p.section);
  if (!section) notFound();
  const { meta } = section;
  const all = getAllSections();
  const i = all.indexOf(section);
  const prev = all[i - 1];
  const next = all[i + 1];
  const num = `§${meta.phase}.${meta.order}`;
  const readMin = Math.max(1, Math.round(words(section.lesson) / 230));
  const toc = [...lessonHeadings(section.lesson), { id: "checkpoints-h", title: "Checkpoints" }, { id: "quiz-h", title: "Quiz" }, { id: "flashcards-h", title: "Flashcards" }];
  const phase = PHASES[meta.phase - 1];

  return (
    <article className="px-4 pb-16 pt-8 sm:px-8">
      <SetHud live={`Week ${String(meta.week).padStart(2, "0")} · ${phase.short}`} items={[{ k: "READ", v: `${readMin} min` }, { k: "EST", v: `${meta.estimatedMinutes} min` }]} right={num} />
      <header className="grid max-w-[68ch] gap-5 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`fm-sq fm-sq--${meta.phase}`}>{meta.phase}</span>
          <FigureCaption parts={[num, `Phase ${meta.phase} · ${phase.short}`, `Week ${meta.week}`, `${meta.estimatedMinutes} min`]} />
        </div>
        <h1 className="fm-h1 max-sm:text-[40px]">{meta.title}</h1>
        <SpecLabel code={`B-${meta.phase}.${meta.order}`} parts={[meta.title]} note={`${readMin} min read`} />
        <ul className="grid gap-2" aria-label="Topics">
          {meta.topics.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3"><DepthStamp depth={t.depth} /><span>{t.title}</span></li>
          ))}
        </ul>
      </header>

      <div className="flex gap-12">
        <div className="min-w-0 flex-1"><LessonRenderer section={section} /></div>
        <nav aria-label="On this page" className="sticky top-6 hidden w-56 shrink-0 self-start xl:block">
          <div className="fm-cap mb-2 border-b border-ink pb-1">On this page</div>
          <ol className="grid gap-1.5 text-[14px]">
            {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="no-underline" style={{ color: "var(--ink)" }}>{h.title}</a></li>)}
          </ol>
        </nav>
      </div>

      <nav aria-label="Section navigation" className="mt-12 grid max-w-[68ch] gap-4 border-t border-ink pt-6 sm:grid-cols-2">
        {prev ? <Link className="fm-card p-4 no-underline" style={{ color: "var(--ink)" }} href={sectionHref(prev.meta)}><span className="fm-cap">← Previous · §{prev.meta.phase}.{prev.meta.order}</span><span className="mt-1 block font-semibold">{prev.meta.title}</span></Link> : <span />}
        {next && <Link className="fm-card p-4 text-right no-underline" style={{ color: "var(--ink)" }} href={sectionHref(next.meta)}><span className="fm-cap">Next · §{next.meta.phase}.{next.meta.order} →</span><span className="mt-1 block font-semibold">{next.meta.title}</span></Link>}
      </nav>
    </article>
  );
}
