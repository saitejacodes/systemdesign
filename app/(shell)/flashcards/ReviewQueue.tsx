"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FlashcardView } from "@/components/learn/Flashcard";
import { getAdapter } from "@/lib/db/adapter";
import { saveSettings, useCardReviews, useCards, useSettings } from "@/lib/db/hooks";
import { cardStage, GRADES, isDue, review } from "@/lib/learning/sm2";
import { PHASES } from "@/lib/curriculum";

export interface CardContent { id: string; front: string; back: string; phase: number; label: string }
const BUTTONS = [["Again", GRADES.again], ["Hard", GRADES.hard], ["Good", GRADES.good], ["Easy", GRADES.easy]] as const;
const today = () => new Date().toDateString();

export function ReviewQueue({ cards }: { cards: CardContent[] }) {
  const states = useCards();
  const reviews = useCardReviews();
  const settings = useSettings();
  const [phase, setPhase] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const content = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // Due cards, with new cards capped by the daily limit (minus new cards already started today).
  const queue = useMemo(() => {
    if (!states || !reviews) return [];
    const newToday = reviews.filter((r) => r.wasNew && new Date(r.at).toDateString() === today()).length;
    const due = states.filter((s) => content.has(s.cardId) && isDue(s) && (!phase || content.get(s.cardId)!.phase === phase));
    const old = due.filter((s) => cardStage(s) !== "new").sort((a, b) => a.due.localeCompare(b.due));
    const fresh = due.filter((s) => cardStage(s) === "new").slice(0, Math.max(0, settings.newCardsPerDay - newToday));
    return [...old, ...fresh];
  }, [states, reviews, content, phase, settings.newCardsPerDay]);

  const counts = { new: 0, learning: 0, review: 0 };
  for (const s of queue) counts[cardStage(s)]++;
  const cur = queue[0];
  const c = cur && content.get(cur.cardId)!;

  const grade = async (q: number) => {
    if (!cur) return;
    const db = getAdapter();
    await db.put("cards", review(cur, q));
    await db.put("cardReviews", { id: crypto.randomUUID(), cardId: cur.cardId, grade: q, wasNew: cardStage(cur) === "new", at: new Date().toISOString() });
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === " " && !(e.target instanceof HTMLElement && e.target.getAttribute("role") === "button")) { e.preventDefault(); setFlipped((f) => !f); }
      const n = Number(e.key);
      if (flipped && n >= 1 && n <= 4) grade(BUTTONS[n - 1][1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid max-w-3xl gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end gap-6">
        {(["new", "learning", "review"] as const).map((k) => (
          <div key={k}><div className="fm-metric">{counts[k]}</div><div className="fm-cap mt-1">{k}</div></div>
        ))}
        <span className="flex-1" />
        <div className="fm-field !min-w-0">
          <label htmlFor="phase">Phase</label>
          <select id="phase" className="fm-input" value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
            <option value={0}>All phases</option>
            {PHASES.map((p) => <option key={p.n} value={p.n}>Phase {p.n} · {p.short}</option>)}
          </select>
        </div>
        <div className="fm-field !min-w-0 w-36">
          <label htmlFor="limit">New cards / day</label>
          <input id="limit" type="number" min={0} max={200} className="fm-input fm-input--mono" value={settings.newCardsPerDay} onChange={(e) => saveSettings({ newCardsPerDay: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
      </div>

      {!states ? null : !c ? (
        <div className="fm-card p-6">
          <p className="fm-h4 m-0">Nothing due right now.</p>
          <p className="m-0 mt-2 text-ink-muted">{states.length === 0 ? "Open a lesson and press “Add all to review” under its flashcards to start." : "Come back tomorrow, or add another lesson's cards."}</p>
          {states.length === 0 && <Link href="/phase/1/client-server" className="mt-3 inline-block">Start with lesson 1.1 Client–server →</Link>}
        </div>
      ) : (
        <div className="grid gap-4">
          <FlashcardView front={c.front} back={c.back} label={`${queue.length} due · ${c.label}`} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
          {flipped ? (
            <div className="fm-grade flex-wrap" role="group" aria-label="Grade this card">
              {BUTTONS.map(([label, q], k) => <button key={label} type="button" className="fm-btn fm-btn--tool" onClick={() => grade(q)}>{k + 1} {label}</button>)}
            </div>
          ) : (
            <button type="button" className="fm-btn fm-btn--primary justify-self-start" onClick={() => setFlipped(true)}>Show answer <span className="fm-cap !text-paper">Space</span></button>
          )}
          <p className="fm-help">Keyboard: Space flips, 1–4 grades (Again, Hard, Good, Easy).</p>
        </div>
      )}
    </div>
  );
}
