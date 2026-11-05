import type { Section } from "@/lib/content";
import { CheckpointList } from "./CheckpointList";
import { FlashcardDeck } from "./FlashcardDeck";
import { QuizPlayer } from "./QuizPlayer";

const TITLES = { checkpoints: "Checkpoints", quiz: "Quiz", flashcards: "Flashcards" } as const;

export const sectionInfo = ({ meta, checkpoints }: Section) => ({ id: meta.id, phase: meta.phase, checkpointIds: checkpoints.map((c) => c.id), simulatorIds: meta.simulatorIds });

/** Lesson learning blocks with a heading each (ids match the TOC). */
export function LearnWidgets({ kind, section }: { kind: keyof typeof TITLES; section: Section }) {
  const info = sectionInfo(section);
  return (
    <section aria-labelledby={`${kind}-h`} className="my-10 scroll-mt-4" id={`${kind}`}>
      <h2 id={`${kind}-h`} className="fm-h4 mb-4">{TITLES[kind]}</h2>
      {kind === "checkpoints" && <CheckpointList section={info} items={section.checkpoints} />}
      {kind === "quiz" && <QuizPlayer section={info} questions={section.quiz} topics={Object.fromEntries(section.meta.topics.map((t) => [t.id, t.title]))} />}
      {kind === "flashcards" && <FlashcardDeck sectionId={section.meta.id} sectionLabel={`${section.meta.phase}.${section.meta.order} ${section.meta.title}`} cards={section.flashcards} />}
    </section>
  );
}
