import { describe, expect, it } from "vitest";
import { createRng, EventQueue, Histogram, MetricsRegistry, percentile, RingBuffer, SimClock } from ".";

describe("rng", () => {
  it("same seed, same sequence; different seed, different sequence", () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const seq = (r: ReturnType<typeof createRng>) => Array.from({ length: 5 }, () => r.next());
    const sa = seq(a);
    expect(sa).toEqual(seq(b));
    expect(sa).not.toEqual(seq(c));
    sa.forEach((x) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); });
  });
  it("distributions have the right means", () => {
    const r = createRng(1);
    const mean = (f: () => number, n = 20000) => Array.from({ length: n }, f).reduce((s, x) => s + x, 0) / n;
    expect(mean(() => r.exponential(4))).toBeCloseTo(0.25, 1);
    expect(mean(() => r.normal(10, 2))).toBeCloseTo(10, 0);
    expect(mean(() => r.poisson(3))).toBeCloseTo(3, 0);
    expect(mean(() => r.poisson(100))).toBeCloseTo(100, -1);
    expect(mean(() => r.uniform(2, 4))).toBeCloseTo(3, 1);
    const ints = new Set(Array.from({ length: 200 }, () => r.int(1, 3)));
    expect([...ints].sort()).toEqual([1, 2, 3]);
    expect(["a", "b"]).toContain(r.pick(["a", "b"]));
  });
});

describe("clock", () => {
  it("returns no ticks while paused, scales by speed, carries remainders", () => {
    const c = new SimClock(10);
    expect(c.advance(16)).toBe(0);
    c.paused = false;
    expect(c.advance(16)).toBe(1); // 6 ms carried
    expect(c.advance(4)).toBe(1);
    c.setSpeed(4);
    expect(c.advance(10)).toBe(4);
    c.setSpeed(10);
    expect(c.speed).toBe(4);
  });
  it("caps a long frame so a background tab doesn't burst", () => {
    const c = new SimClock(10);
    c.paused = false;
    expect(c.advance(5000)).toBe(10);
  });
  it("tick and reset", () => {
    const c = new SimClock(10);
    c.tick(); c.tick();
    expect(c.t).toBe(20);
    c.reset();
    expect(c.t).toBe(0);
  });
});

describe("event queue", () => {
  it("pops by time, ties in insertion order", () => {
    const q = new EventQueue<string>();
    [[5, "e"], [1, "a"], [3, "c1"], [3, "c2"], [2, "b"], [3, "c3"]].forEach(([t, e]) => q.push(t as number, e as string));
    expect([...q.drain(3)].map((x) => x.e)).toEqual(["a", "b", "c1", "c2", "c3"]);
    expect(q.size).toBe(1);
    expect(q.peekTime()).toBe(5);
  });
  it("stays ordered under random load", () => {
    const r = createRng(9);
    const q = new EventQueue<number>();
    for (let i = 0; i < 1000; i++) q.push(r.uniform(0, 100), i);
    let last = -1;
    for (const { t } of q.drain(Infinity)) { expect(t).toBeGreaterThanOrEqual(last); last = t; }
  });
});

describe("metrics", () => {
  it("nearest-rank percentiles", () => {
    const v = Array.from({ length: 100 }, (_, i) => 100 - i); // 1..100 shuffled order
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([], 99)).toBe(0);
  });
  it("histogram reservoir keeps the latest values; mean covers everything", () => {
    const h = new Histogram(10);
    for (let i = 1; i <= 20; i++) h.observe(i);
    expect(h.percentiles().p50).toBe(15);
    expect(h.mean).toBe(10.5);
  });
  it("ring buffer overwrites the oldest", () => {
    const b = new RingBuffer<number>(3);
    [1, 2, 3, 4].forEach((x) => b.push(x));
    expect(b.toArray()).toEqual([2, 3, 4]);
    expect(b.last()).toBe(4);
  });
  it("counter rate over the last second", () => {
    const m = new MetricsRegistry();
    for (let t = 250; t <= 2000; t += 250) { m.inc("req", 10); m.sample(t, {}); }
    expect(m.rate("req", 2000)).toBe(40); // 10 per 250 ms
  });
});
