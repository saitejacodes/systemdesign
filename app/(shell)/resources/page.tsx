import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Resources" };

export default function Page() {
  return (
    <PageHeader code="R-01" spec="Resources" before="Read the" em="sources" after="." lede="Books, papers, docs and talks worth your time.">
    </PageHeader>
  );
}
