import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <PageHeader code="P-16" spec="The plan" before="Sixteen weeks, one" em="system" after="." lede="Seven phases in the order you should learn them, about eight hours a week.">
    </PageHeader>
  );
}
