import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Interview" };

export default async function Page({ params }: PageProps<"/interview/[caseId]">) {
  const p = await params;
  const ref = p.caseId;
  return (
    <PageHeader code="C-00" spec="Interview" before="Defend your" em="design" after="." lede="A timed mock interview with a rubric.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
