import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabExplanation } from "@/components/labs/LabExplanation";
import { labCode } from "@/components/labs/labCode";
import { LabWorkbench } from "@/components/labs/LabWorkbench";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSectionById, sectionHref } from "@/lib/content";
import { getLab, getLabs } from "@/lib/labs";

export const dynamicParams = false;
export const generateStaticParams = () => getLabs().map((l) => ({ labId: l.meta.id }));

export async function generateMetadata({ params }: PageProps<"/simulators/code-labs/[labId]">): Promise<Metadata> {
  return { title: getLab((await params).labId)?.meta.title ?? "Code lab" };
}

const harness = (f: string) => fs.readFileSync(path.join(process.cwd(), "public", "labs", f), "utf8");

export default async function Page({ params }: PageProps<"/simulators/code-labs/[labId]">) {
  const lab = getLab((await params).labId);
  if (!lab) notFound();
  const { meta } = lab;
  const lessons = meta.sectionIds.map((id) => getSectionById(id)).filter((s) => !!s);
  const words = meta.title.split(" ");
  const em = words.pop() ?? meta.title;
  return (
    <>
      <PageHeader code={labCode(meta.order)} spec="Code lab" before={words.join(" ")} em={em} lede={meta.summary}>
        {lessons.length > 0 && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Related lessons">
            {lessons.map((s) => <li key={s.meta.id}><Link href={sectionHref(s.meta)} className="fm-cap">Lesson · §{s.meta.phase}.{s.meta.order} {s.meta.title} →</Link></li>)}
          </ul>
        )}
      </PageHeader>
      <div className="grid gap-10 px-4 py-8 sm:px-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,68ch)_minmax(0,1fr)]">
          <LabExplanation source={lab.explanation} />
          <div className="self-start overflow-x-auto">
            <table className="fm-parts">
              <caption>Complexity targets</caption>
              <thead><tr><th scope="col">Operation</th><th scope="col">Time</th><th scope="col">Space</th></tr></thead>
              <tbody>{meta.complexity.map((c) => <tr key={c.op}><td>{c.op}</td><td>{c.time || "–"}</td><td>{c.space || "–"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <section aria-labelledby="workbench-h" className="grid gap-4">
          <h2 id="workbench-h" className="fm-h4">Workbench</h2>
          <LabWorkbench labId={meta.id} hints={meta.hints} code={lab.code} harness={{ java: harness("harness.java"), cpp: harness("harness.hpp") }} />
        </section>
      </div>
    </>
  );
}
