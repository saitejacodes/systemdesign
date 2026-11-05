import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAllSections, getGlossary, sectionHref } from "@/lib/content";
import { GlossaryList } from "./GlossaryList";

export const metadata: Metadata = { title: "Glossary" };

export default function Page() {
  const sections = new Map(getAllSections().map((s) => [s.meta.id, s.meta]));
  const terms = getGlossary().map((g) => {
    const m = sections.get(g.sectionId)!;
    return { ...g, href: sectionHref(m), where: `${m.phase}.${m.order} ${m.title}` };
  });
  return (
    <>
      <PageHeader title="Every term, defined" lede={`${terms.length} terms. Each links back to the lesson that introduces it.`} />
      <GlossaryList terms={terms} />
    </>
  );
}
