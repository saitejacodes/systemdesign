import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Flashcards" };

export default function Page() {
  return (
    <PageHeader code="F-00" spec="Flashcards" before="Review it before you" em="forget" after=" it." lede="Spaced repetition across every section you have studied.">
    </PageHeader>
  );
}
