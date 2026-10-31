import { describe, expect, it } from "vitest";
import { GRADES, MIN_EASE, cardStage, isDue, newCard, review } from "./sm2";

const now = new Date("2026-01-01T10:00:00Z");
const days = (iso: string) => Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);

describe("SM-2", () => {
  it("starts at ease 2.5, due now", () => {
    const c = newCard("x", now);
    expect(c).toMatchObject({ ease: 2.5, interval: 0, repetitions: 0, lapses: 0 });
    expect(isDue(c, now)).toBe(true);
    expect(cardStage(c)).toBe("new");
  });

  it("good answers: 1 day, 6 days, then interval × EF", () => {
    let c = review(newCard("x", now), GRADES.good, now);
    expect([c.repetitions, c.interval, days(c.due)]).toEqual([1, 1, 1]);
    expect(c.ease).toBeCloseTo(2.5); // q=4 leaves EF unchanged
    c = review(c, GRADES.good, now);
    expect([c.repetitions, c.interval]).toEqual([2, 6]);
    c = review(c, GRADES.good, now);
    expect(c.interval).toBe(15); // round(6 × 2.5)
    expect(cardStage(c)).toBe("review");
  });

  it("applies EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)) for each grade", () => {
    const base = { ...newCard("x", now), repetitions: 2, interval: 6 };
    expect(review(base, GRADES.easy, now).ease).toBeCloseTo(2.6);
    expect(review(base, GRADES.good, now).ease).toBeCloseTo(2.5);
    expect(review(base, GRADES.hard, now).ease).toBeCloseTo(2.36);
    expect(review(base, GRADES.easy, now).interval).toBe(Math.round(6 * 2.6));
  });

  it("again resets repetitions and interval, counts a lapse, keeps EF", () => {
    const c = review({ ...newCard("x", now), repetitions: 4, interval: 40, ease: 2.2 }, GRADES.again, now);
    expect(c).toMatchObject({ repetitions: 0, interval: 1, lapses: 1, ease: 2.2 });
    expect(days(c.due)).toBe(1);
    expect(cardStage(c)).toBe("learning");
  });

  it("never drops ease below 1.3", () => {
    let c = { ...newCard("x", now), ease: 1.35, repetitions: 3, interval: 10 };
    for (let i = 0; i < 5; i++) c = review(c, GRADES.hard, now);
    expect(c.ease).toBe(MIN_EASE);
  });
});
