import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Lesson" };

export default async function Page({ params }: PageProps<"/phase/[phase]/[section]">) {
  const p = await params;
  const ref = p.phase + " / " + p.section;
  return (
    <PageHeader code="B-00" spec="Lesson" before="Read it, then" em="test" after=" it." lede="Lessons appear here as each phase is written.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
