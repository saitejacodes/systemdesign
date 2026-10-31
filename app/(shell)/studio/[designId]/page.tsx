import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Design" };

export default async function Page({ params }: PageProps<"/studio/[designId]">) {
  const p = await params;
  const ref = p.designId;
  return (
    <PageHeader code="D-00" spec="Design" before="Draw it, then" em="run" after=" it." lede="Your saved design, ready to edit or run.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
