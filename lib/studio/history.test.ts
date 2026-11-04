import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, undo } from "./history";

describe("history", () => {
  it("undoes and redoes in order", () => {
    let h = createHistory(0);
    h = commit(h, 1, { now: 0 });
    h = commit(h, 2, { now: 5_000 });
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  it("clears redo on a new change", () => {
    let h = commit(commit(createHistory("a"), "b", { now: 0 }), "c", { now: 5_000 });
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = commit(h, "d", { now: 10_000 });
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a", "b"]);
  });

  it(`caps the undo stack at ${HISTORY_LIMIT}`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i, { now: i * 10_000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(50);
    let steps = 0;
    while (canUndo(h)) { h = undo(h); steps++; }
    expect(steps).toBe(100);
    expect(h.present).toBe(50);
  });

  it("coalesces a burst with the same key into one entry", () => {
    let h = createHistory({ x: 0 });
    for (let i = 1; i <= 10; i++) h = commit(h, { x: i }, { key: "nudge:n1", now: i * 100 });
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual({ x: 10 });
    // a different key, or a pause longer than the window, starts a new entry
    h = commit(h, { x: 11 }, { key: "prop:n1:label", now: 1_100 });
    h = commit(h, { x: 12 }, { key: "prop:n1:label", now: 5_000 });
    expect(h.past).toHaveLength(3);
    expect(undo(h).present).toEqual({ x: 11 });
    expect(undo(undo(undo(h))).present).toEqual({ x: 0 });
  });

  it("ignores a commit of the same snapshot", () => {
    const g = { n: 1 };
    const h = createHistory(g);
    expect(commit(h, g)).toBe(h);
  });
});
