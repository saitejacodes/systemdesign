import type { Challenge } from "@/lib/sim/engine";
import { TOGGLES, savings, type RjConfig, type RjState } from "./model";

const far = { rtt: 150, cdnRtt: 35, resolverRtt: 20, nsRtt: 40, appMs: 20, dbMs: 8 };
const label = (k: string) => TOGGLES.find((x) => x.key === k)?.label ?? k;

export const challenges: Challenge<RjConfig, RjState>[] = [
  {
    id: "fast-first-byte",
    title: "First byte under 100 ms",
    description: "The user is 150 ms from your data centre and 35 ms from the nearest CDN edge. Get time to first byte under 100 ms using the toggles.",
    setup: far,
    durationMs: 180_000,
    done: (s) => s.ttfb < 100,
    winCondition(_h, s) {
      const ms = Math.round(s.ttfb);
      return s.ttfb < 100
        ? { passed: true, value: ms, detail: `${ms} ms. A cached DNS answer, a reused connection and a nearby edge together remove every trip to the far data centre.` }
        : { passed: false, value: ms, detail: `${ms} ms. Any trip to the origin costs at least 150 ms, and each handshake or DNS lookup adds more.` };
    },
    hint: "Nothing that goes to the origin can be under 150 ms. Serve from the edge, then remove every extra round trip before the request.",
  },
  {
    id: "biggest-saver",
    title: "Which toggle saves the most?",
    description: "Starting with every toggle off, which single change cuts time to first byte the most for this user? Answer in the panel under the drawing.",
    setup: { ...far, dnsCached: false, reuse: false, http2: false, cacheHit: false, cdn: false },
    durationMs: 180_000,
    done: (s) => s.answer !== null,
    winCondition(_h, s) {
      const ranked = savings(s.config).sort((a, b) => b.saved - a.saved);
      const list = ranked.map((r) => `${label(r.key)} −${Math.round(r.saved)} ms`).join(", ");
      return s.answer === ranked[0].key
        ? { passed: true, value: Math.round(ranked[0].saved), detail: `Right: ${list}. Moving the server closer beats shaving work off it.` }
        : { passed: false, value: 0, detail: `Not quite: ${list}.${s.answer === "http2" ? " HTTP/2 helps the page's later assets, not the first byte." : ""}` };
    },
    hint: "Count round trips to the far data centre: the TCP handshake, the TLS handshake and the request itself are each one.",
  },
];
