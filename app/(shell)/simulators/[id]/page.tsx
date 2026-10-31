import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Simulator" };

export default async function Page({ params }: PageProps<"/simulators/[id]">) {
  const p = await params;
  const ref = p.id;
  return (
    <PageHeader code="S-00" spec="Simulator" before="Run it, then" em="break" after=" it." lede="Each simulator is a pure, seeded model you can pause, step and replay.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
