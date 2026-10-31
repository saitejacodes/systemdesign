"use client";
import { useState } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { useCards } from "@/lib/db/hooks";
import type { Flashcard } from "@/lib/content/schemas";
import { newCard } from "@/lib/learning/sm2";
import { FlashcardView } from "./Flashcard";

/** Browse mode inside a lesson: flip, prev/next, and add the deck to spaced review. */
export function FlashcardDeck({ sectionId, sectionLabel, cards }: { sectionId: string; sectionLabel: string; cards: Flashcard[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const states = useCards();
  const ids = cards.map((c) => `${sectionId}:${c.id}`);
  const inReview = states ? ids.filter((id) => states.some((s) => s.cardId === id)).length : 0;
  const card = cards[i];
  const go = (d: number) => { setI((i + d + cards.length) % cards.length); setFlipped(false); };

  const addAll = async () => {
    const have = new Set(states?.map((s) => s.cardId));
    await getAdapter().bulkPut("cards", ids.filter((id) => !have.has(id)).map((id) => newCard(id)));
  };

  return (
    <div className="grid gap-4">
      <FlashcardView front={card.front} back={card.back} label={`Card ${i + 1} / ${cards.length} · ${sectionLabel}`} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool" onClick={() => go(-1)} aria-label="Previous card">← Prev</button>
        <button type="button" className="fm-btn fm-btn--tool" onClick={() => go(1)} aria-label="Next card">Next →</button>
        <span className="flex-1" />
        {inReview === ids.length ? (
          <span className="fm-status fm-status--ok"><span className="g" aria-hidden>✓</span>All {ids.length} in review</span>
        ) : (
          <button type="button" className="fm-btn fm-btn--primary" onClick={addAll} disabled={!states}>Add all to review ({ids.length - inReview})</button>
        )}
      </div>
    </div>
  );
}
