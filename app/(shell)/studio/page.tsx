import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Design Studio" };

export default function Page() {
  return (
    <PageHeader code="D-00" spec="Design Studio" before="Draw it, then" em="run" after=" it." lede="Place components, wire them up and push traffic through your design.">
    </PageHeader>
  );
}
