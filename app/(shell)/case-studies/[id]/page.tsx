import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Case study" };

export default async function Page({ params }: PageProps<"/case-studies/[id]">) {
  const p = await params;
  const ref = p.id;
  return (
    <PageHeader code="C-00" spec="Case study" before="One system, one" em="method" after="." lede="A worked design with its rubric.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
