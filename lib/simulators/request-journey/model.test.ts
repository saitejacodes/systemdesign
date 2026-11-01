import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { assetsMs, biggestSaver, rjModel, ttfb, type RjConfig } from "./model";

const off: RjConfig = { rtt: 150, cdnRtt: 35, resolverRtt: 20, nsRtt: 40, appMs: 20, dbMs: 8, dnsCached: false, reuse: false, http2: false, cacheHit: false, cdn: false };

describe("request journey", () => {
  it("adds up a cold request: DNS walk + TCP + TLS + one round trip + server work", () => {
    // DNS 20 + 3×40, TCP 150, TLS 150, request 75 + LB 1 + app 20 + cache 1 + DB 8 + response 75
    expect(ttfb(off)).toBe(620);
  });

  it("each toggle removes the right cost", () => {
    expect(ttfb({ ...off, dnsCached: true })).toBe(480);
    expect(ttfb({ ...off, reuse: true })).toBe(320);
    expect(ttfb({ ...off, cacheHit: true })).toBe(612);
    expect(ttfb({ ...off, http2: true })).toBe(620);
    expect(ttfb({ ...off, cdn: true })).toBe(140 + 35 + 35 + 35 + 1);
  });

  it("HTTP/2 needs one round of asset requests instead of two plus extra handshakes", () => {
    expect(assetsMs({ ...off, http2: true })).toBe(150);
    expect(assetsMs(off)).toBe(600);
  });

  it("a lost SYN costs the 1 s retransmission timeout", () => {
    const s = new Simulation(rjModel, off, 1);
    s.toggleFault("syn-loss");
    s.step();
    expect(s.state.ttfb).toBe(1620);
  });

  it("the animation cursor loops and steps between stages", () => {
    const s = new Simulation(rjModel, off, 1);
    s.act("next");
    expect(s.state.cursor).toBe(20);
    s.act("next");
    expect(s.state.cursor).toBe(60);
    s.act("prev");
    expect(s.state.cursor).toBe(20);
    s.runFor(4_000); // past TTFB + the pause, so it wrapped
    expect(s.state.cursor).toBeLessThan(620);
  });

  it("challenges: all three of CDN, reuse and DNS cache are needed; CDN saves the most", () => {
    const [fast, saver] = challenges;
    const go = (c: Partial<RjConfig>) => { const s = new Simulation(rjModel, { ...off, ...c, ...fast.setup }, 1); s.step(); return fast.winCondition(s.metrics.history(), s.state).passed; };
    expect(go({ cdn: true, reuse: true, dnsCached: true })).toBe(true);
    expect(go({ cdn: true, reuse: true })).toBe(false);
    expect(go({ cdn: true, dnsCached: true })).toBe(false);
    expect(go({ reuse: true, dnsCached: true, cacheHit: true })).toBe(false);
    expect(biggestSaver(off)).toBe("cdn");
    const s = new Simulation(rjModel, { ...off, ...saver.setup }, 1);
    s.act("answer", "reuse");
    expect(saver.done!(s.state)).toBe(true);
    expect(saver.winCondition(s.metrics.history(), s.state).passed).toBe(false);
    s.act("answer", "cdn");
    expect(saver.winCondition(s.metrics.history(), s.state).passed).toBe(true);
  });
});
