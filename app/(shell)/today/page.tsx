import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return (
    <PageHeader code="T-01" spec="Today" before="What to do" em="next" after="." lede="Flashcards due, the next lesson, the next challenge and your weak spots, in one list.">
    </PageHeader>
  );
}
