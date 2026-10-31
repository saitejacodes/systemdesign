import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { TodayView } from "@/components/plan/TodayView";
import { getPlanView } from "@/lib/content";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  const { weeks, sections } = getPlanView();
  return (
    <>
      <PageHeader code="T-01" spec="Today" before="What to do" em="next" after="." lede="Flashcards due, the next lesson, the next challenge and your weak spots, in one list." />
      <TodayView weeks={weeks} sections={sections} />
    </>
  );
}
