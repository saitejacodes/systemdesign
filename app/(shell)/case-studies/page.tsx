import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Case Studies" };

export default function Page() {
  return (
    <PageHeader code="C-00" spec="Case studies" before="Fifteen systems, one" em="method" after="." lede="Worked designs for real products, each with a rubric.">
    </PageHeader>
  );
}
