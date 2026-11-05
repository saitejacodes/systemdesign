"use client";

/** One card (design/components/Flashcard). Click, Enter or Space flips it; only the face showing is in its accessible name. */
export function FlashcardView({ front, back, label, flipped, onFlip }: { front: string; back: string; label: string; flipped: boolean; onFlip: () => void }) {
  return (
    <div
      className={`fm-flash !w-full max-w-[520px] ${flipped ? "is-flipped" : ""}`}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      onClick={onFlip}
      onKeyDown={(e) => { if (e.key === "Enter" || (e.key === " " && e.currentTarget === e.target)) { e.preventDefault(); onFlip(); } }}
    >
      <div className="fm-flash__inner">
        <div className="fm-flash__face fm-flash__face--front" aria-hidden={flipped}>
          <span className="fm-flash__corner tl" /><span className="fm-flash__corner br" />
          <span className="fm-cap">{label}</span>
          <div className="fm-flash__q">{front}</div>
          <span className="fm-cap">Space to flip</span>
        </div>
        <div className="fm-flash__face fm-flash__face--back" aria-hidden={!flipped}>
          <span className="fm-cap">Answer</span>
          <div className="fm-flash__a">{back}</div>
          <span />
        </div>
      </div>
    </div>
  );
}
