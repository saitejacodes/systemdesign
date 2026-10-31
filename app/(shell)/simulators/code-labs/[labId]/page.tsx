import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Code lab" };

export default async function Page({ params }: PageProps<"/simulators/code-labs/[labId]">) {
  const p = await params;
  const ref = p.labId;
  return (
    <PageHeader code="L-00" spec="Code lab" before="Write it in" em="Python" after="." lede="Each lab runs in your browser with tests you can see.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
