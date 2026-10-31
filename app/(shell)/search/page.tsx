import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <PageHeader code="Q-00" spec="Search" before="Find it" em="fast" after="." lede="Search lessons, glossary terms, flashcards, case studies and resources.">
    </PageHeader>
  );
}
