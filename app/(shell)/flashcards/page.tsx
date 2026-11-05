import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAllSections } from "@/lib/content";
import { ReviewQueue, type CardContent } from "./ReviewQueue";

export const metadata: Metadata = { title: "Flashcards" };

export default function Page() {
  const cards: CardContent[] = getAllSections().flatMap(({ meta, flashcards }) =>
    flashcards.map((f) => ({ id: `${meta.id}:${f.id}`, front: f.front, back: f.back, phase: meta.phase, label: `${meta.phase}.${meta.order} ${meta.title}` })),
  );
  return (
    <>
      <PageHeader title="Review it before you forget it" lede="Today's spaced-repetition queue across every lesson you added. SM-2 schedules each card." />
      <ReviewQueue cards={cards} />
    </>
  );
}
