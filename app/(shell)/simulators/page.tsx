import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Simulators" };

export default function Page() {
  return (
    <PageHeader code="S-00" spec="Simulators" before="Break it on" em="purpose" after="." lede="Working models with a seed, a speed control and a Break it menu.">
    </PageHeader>
  );
}
