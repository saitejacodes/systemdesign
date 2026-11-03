import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { SimGrid } from "./SimGrid";

export const metadata: Metadata = { title: "Simulators" };

export default function Page() {
  return (
    <>
      <PageHeader code="S-00" spec="Simulators" before="Break it on" em="purpose" after="." lede="Working models with a seed, a speed control and a Break it menu. Each has challenges with a pass condition the app checks for you.">
        <Link href="/simulators/code-labs" className="fm-cap">Code labs · build the data structures yourself, with tests →</Link>
      </PageHeader>
      <SimGrid />
    </>
  );
}
