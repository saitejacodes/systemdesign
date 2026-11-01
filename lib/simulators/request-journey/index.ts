import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { rjModel, type RjConfig, type RjState } from "./model";
import { RjView } from "./view";

const ttfbTone = (v: number) => (v >= 500 ? "over" : v >= 200 ? "hot" : "ok");

export const definition: SimDefinition<RjConfig, RjState> = {
  model: rjModel,
  defaultConfig: { rtt: 150, cdnRtt: 35, resolverRtt: 20, nsRtt: 40, appMs: 20, dbMs: 8, dnsCached: false, reuse: false, http2: false, cacheHit: false, cdn: false },
  controls: [
    { key: "dnsCached", label: "DNS cached", type: "toggle" },
    { key: "reuse", label: "Connection reused", type: "toggle" },
    { key: "http2", label: "HTTP/2", type: "toggle" },
    { key: "cacheHit", label: "App cache hit", type: "toggle" },
    { key: "cdn", label: "CDN in front", type: "toggle" },
    { key: "rtt", label: "RTT to origin", type: "number", min: 5, max: 300, step: 5, unit: " ms", help: "Same city ≈ 5–20 ms; across a continent ≈ 60–100; across an ocean ≈ 150+." },
    { key: "cdnRtt", label: "RTT to CDN edge", type: "number", min: 5, max: 100, step: 5, unit: " ms" },
    { key: "resolverRtt", label: "RTT to DNS resolver", type: "number", min: 5, max: 100, step: 5, unit: " ms" },
    { key: "nsRtt", label: "Resolver to nameserver", type: "number", min: 5, max: 150, step: 5, unit: " ms" },
    { key: "appMs", label: "App work", type: "number", min: 1, max: 200, step: 1, unit: " ms" },
    { key: "dbMs", label: "DB query", type: "number", min: 1, max: 200, step: 1, unit: " ms" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Follow one request", body: "Press Play and watch the dot: DNS lookup, TCP and TLS handshakes, then the request to the server and back. The table shows what each step costs." },
    { target: "canvas", title: "Step through it", body: "Use Next step or click a row to stop on any stage and read what happens there." },
    { target: "controls", title: "Flip the toggles", body: "Turn on DNS caching, connection reuse or a CDN. Struck-through rows are steps you no longer pay for." },
    { target: "faults", title: "Lose a packet", body: "Drop the first SYN. TCP waits a full second before retrying, more than everything else put together." },
    { target: "challenges", title: "Prove it", body: "Get a far-away user's first byte under 100 ms, then name the toggle that saves the most." },
  ],
  View: RjView,
  cards: [
    { key: "ttfb", label: "First byte", unit: "ms", digits: 0, tone: ttfbTone },
    { key: "page", label: "Full page", unit: "ms", digits: 0 },
    { key: "dns", label: "DNS", unit: "ms", digits: 0 },
    { key: "connect", label: "Handshakes", unit: "ms", digits: 0 },
    { key: "network", label: "Request + response", unit: "ms", digits: 0 },
    { key: "server", label: "Server work", unit: "ms", digits: 0 },
  ],
  charts: [{ title: "Latency", unit: "ms", keys: [{ key: "ttfb", label: "First byte", color: "var(--cobalt)" }, { key: "page", label: "Page", color: "var(--phase-3)" }] }],
  hud: (m) => [
    { k: "TTFB", v: `${Math.round(m.ttfb ?? 0)} ms`, tone: ttfbTone(m.ttfb ?? 0) === "ok" ? undefined : ttfbTone(m.ttfb ?? 0) },
    { k: "Page", v: `${Math.round(m.page ?? 0)} ms` },
  ],
};
