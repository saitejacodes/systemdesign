import type { Section } from "@/lib/content";
import { CheckpointListStatic, FlashcardStatic, QuizStatic } from "./static";

const TITLES = { checkpoints: "Checkpoints", quiz: "Quiz", flashcards: "Flashcards" } as const;

/** Lesson learning blocks with a heading each (ids match the TOC). */
export function LearnWidgets({ kind, section }: { kind: keyof typeof TITLES; section: Section }) {
  return (
    <section aria-labelledby={`${kind}-h`} className="my-10">
      <h2 id={`${kind}-h`} className="fm-h4 mb-4">{TITLES[kind]}</h2>
      {kind === "checkpoints" && <CheckpointListStatic items={section.checkpoints} />}
      {kind === "quiz" && <QuizStatic items={section.quiz} />}
      {kind === "flashcards" && <FlashcardStatic items={section.flashcards} />}
    </section>
  );
}
