import type { Metadata } from "next";
import { LabGrid, type LabCard } from "@/components/labs/LabGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSectionById } from "@/lib/content";
import { PHASES } from "@/lib/curriculum";
import { getLabs } from "@/lib/labs";

export const metadata: Metadata = { title: "Code labs" };

export default function Page() {
  const labs: LabCard[] = getLabs().map(({ meta }) => {
    const s = getSectionById(meta.sectionIds[0]);
    const phase = s?.meta.phase ?? 1;
    return { id: meta.id, title: meta.title, summary: meta.summary, phase, phaseShort: PHASES[phase - 1].short, lesson: s?.meta.title ?? "" };
  });
  return (
    <>
      <PageHeader title="Build the parts yourself" lede="Small, testable versions of the data structures and algorithms behind the lessons: caches, rate limiters, hash rings, clocks and more.">
        <ul className="grid max-w-[70ch] list-disc gap-1.5 pl-5 text-[15px] text-ink-muted">
          <li>Code runs in your browser, in a Web Worker. Nothing is sent anywhere, and your code is saved on this device.</li>
          <li>Python runs on Pyodide (about 10 MB, downloaded the first time you run). JavaScript runs as is; TypeScript is compiled in the browser first.</li>
          <li>Java and C++ download as one runnable file with the tests, for your own JDK or compiler.</li>
          <li>Each run stops after 5 seconds, so an infinite loop can&apos;t freeze the page. Up to three hints, then the reference solution.</li>
        </ul>
      </PageHeader>
      <div className="px-4 py-8 sm:px-8"><LabGrid labs={labs} /></div>
    </>
  );
}
