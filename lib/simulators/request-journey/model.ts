import type { SimModel } from "@/lib/sim/engine";

export interface RjConfig {
  /** Round trip between the user and the origin data centre, ms. */
  rtt: number;
  /** Round trip to the nearest CDN edge. */
  cdnRtt: number;
  /** Round trip to the recursive resolver, and from it to each nameserver. */
  resolverRtt: number;
  nsRtt: number;
  appMs: number;
  dbMs: number;
  dnsCached: boolean;
  reuse: boolean;
  http2: boolean;
  cacheHit: boolean;
  cdn: boolean;
}

export type Toggle = "dnsCached" | "reuse" | "http2" | "cacheHit" | "cdn";
export const TOGGLES: { key: Toggle; label: string }[] = [
  { key: "dnsCached", label: "DNS cached" },
  { key: "reuse", label: "Connection reused" },
  { key: "http2", label: "HTTP/2" },
  { key: "cacheHit", label: "App cache hit" },
  { key: "cdn", label: "CDN in front" },
];

export type Zone = "client" | "dns" | "edge" | "origin";
export interface Step { id: string; label: string; ms: number; zone: Zone; skipped?: boolean; explain: string }

const ASSETS = 12;
const CACHE_MS = 1, LB_MS = 1, EDGE_MS = 1;

/** The ordered steps to the first byte of the HTML, with their cost in ms. Pure: the whole simulator is this function. */
export interface RjFaults { synLoss: boolean; cacheDown: boolean }
const NO_FAULTS: RjFaults = { synLoss: false, cacheDown: false };
const RTO_MS = 1000; // TCP's initial retransmission timeout (RFC 6298)

export function journey(c: RjConfig, f: RjFaults = NO_FAULTS): Step[] {
  if (f.cacheDown) c = { ...c, cacheHit: false };
  const edge = c.cdn ? c.cdnRtt : c.rtt;
  const where = c.cdn ? "the CDN edge" : "the origin";
  const steps: Step[] = [
    { id: "browser", label: "Browser cache", ms: 0, zone: "client", explain: "The browser checks its own HTTP cache first. The HTML page is usually marked no-cache, so this is a miss and the journey continues." },
    { id: "resolver", label: "DNS · recursive resolver", ms: c.dnsCached ? 0 : c.resolverRtt, zone: "dns", skipped: c.dnsCached, explain: c.dnsCached ? "The operating system already has the IP address cached from an earlier visit, within its TTL. No DNS traffic at all." : "The OS asks a recursive resolver (your ISP's, or one like 1.1.1.1) for the address. That costs one round trip to the resolver." },
    { id: "root", label: "DNS · root server", ms: c.dnsCached ? 0 : c.nsRtt, zone: "dns", skipped: c.dnsCached, explain: "The resolver asks a root server, which answers with the servers for the top-level domain. Real resolvers usually have this cached; here we show the full cold walk." },
    { id: "tld", label: "DNS · TLD server", ms: c.dnsCached ? 0 : c.nsRtt, zone: "dns", skipped: c.dnsCached, explain: "The .com servers answer with the domain's own authoritative nameservers." },
    { id: "auth", label: "DNS · authoritative", ms: c.dnsCached ? 0 : c.nsRtt, zone: "dns", skipped: c.dnsCached, explain: "The authoritative nameserver returns the actual A or AAAA record. The resolver caches it for its TTL and hands it back." },
    { id: "tcp", label: f.synLoss && !c.reuse ? "TCP handshake · SYN lost" : "TCP handshake", ms: c.reuse ? 0 : edge + (f.synLoss ? RTO_MS : 0), zone: "edge", skipped: c.reuse, explain: c.reuse ? "An open keep-alive connection is reused, so there is no handshake." : f.synLoss ? `The first SYN was lost. The client waits its 1 s retransmission timeout, then retries: one dropped packet costs more than everything else combined.` : `SYN, SYN-ACK, ACK with ${where}: one full round trip before any data can flow.` },
    { id: "tls", label: "TLS 1.3 handshake", ms: c.reuse ? 0 : edge, zone: "edge", skipped: c.reuse, explain: c.reuse ? "The reused connection is already encrypted." : `Key exchange and certificate check with ${where}: one more round trip in TLS 1.3 (two in TLS 1.2).` },
    { id: "send", label: "Request travels", ms: edge / 2, zone: "edge", explain: `The HTTP request crosses the network to ${where}: half a round trip.` },
  ];
  if (c.cdn) {
    steps.push({ id: "edge", label: "CDN edge cache hit", ms: EDGE_MS, zone: "edge", explain: "The edge already has a cached copy, so the origin is never contacted. That is why a CDN can beat the speed of light to a far-away origin." });
  } else {
    steps.push(
      { id: "lb", label: "Load balancer", ms: LB_MS, zone: "origin", explain: "The load balancer terminates the connection and picks a healthy app server." },
      { id: "app", label: "App server", ms: c.appMs, zone: "origin", explain: "The application parses the request, checks auth and builds the response." },
      { id: "cache", label: c.cacheHit ? "Cache hit" : "Cache miss", ms: CACHE_MS, zone: "origin", explain: c.cacheHit ? "The data is in an in-memory cache such as Redis: about a millisecond." : "The cache doesn't have it, so the app must go to the database." },
      { id: "db", label: "Database query", ms: c.cacheHit ? 0 : c.dbMs, zone: "origin", skipped: c.cacheHit, explain: c.cacheHit ? "Skipped: the cache answered." : "An indexed query on the primary database. The result is written back to the cache for next time." },
    );
  }
  steps.push({ id: "recv", label: "First byte arrives", ms: edge / 2, zone: "edge", explain: "The first byte of the response crosses back: the other half of the round trip. Time to first byte ends here." });
  return steps;
}

export const total = (steps: Step[]) => steps.reduce((a, s) => a + s.ms, 0);
export const ttfb = (c: RjConfig, f?: RjFaults) => total(journey(c, f));

/** After the HTML: fetching 12 assets. HTTP/1.1 uses 6 parallel connections (two rounds); HTTP/2 multiplexes them in one. */
export function assetsMs(c: RjConfig) {
  const edge = c.cdn ? c.cdnRtt : c.rtt;
  if (c.http2) return edge;
  return (c.reuse ? 0 : 2 * edge) + Math.ceil(ASSETS / 6) * edge;
}
export const pageMs = (c: RjConfig, f?: RjFaults) => ttfb(c, f) + assetsMs(c);

const OFF: Record<Toggle, false> = { dnsCached: false, reuse: false, http2: false, cacheHit: false, cdn: false };

/** Time to first byte saved by turning on each toggle alone, from all toggles off. */
export function savings(c: RjConfig) {
  const base = ttfb({ ...c, ...OFF });
  return TOGGLES.map(({ key }) => ({ key, saved: base - ttfb({ ...c, ...OFF, [key]: true }) }));
}
export const biggestSaver = (c: RjConfig) => savings(c).reduce((a, b) => (b.saved > a.saved ? b : a)).key;

const SLOW = 4; // each journey ms plays over 4 ms of sim time
const PAUSE = 1_200;

export interface RjState { cursor: number; ttfb: number; page: number; answer: Toggle | null; correct: Toggle; config: RjConfig; faults: RjFaults }

export const rjModel: SimModel<RjConfig, RjState> = {
  init(c) { return { cursor: 0, ttfb: ttfb(c), page: pageMs(c), answer: null, correct: biggestSaver(c), config: c, faults: { ...NO_FAULTS } }; },

  tick(s, ctx) {
    const c = ctx.config;
    const t = ttfb(c, s.faults);
    if (t !== s.ttfb) ctx.log("info", `Time to first byte ${Math.round(s.ttfb)} → ${Math.round(t)} ms`);
    s.ttfb = t;
    s.page = pageMs(c, s.faults);
    s.correct = biggestSaver(c);
    s.config = c;
    s.cursor += ctx.dt / SLOW;
    if (s.cursor > t + PAUSE / SLOW) s.cursor = 0; // loop the animation
    return s;
  },

  actions: {
    next(s) {
      let at = 0;
      for (const st of journey(s.config, s.faults)) { if (at > s.cursor + 0.001 && st.ms > 0) { s.cursor = at; return s; } at += st.ms; }
      s.cursor = at;
      return s;
    },
    prev(s) {
      let at = 0, prev = 0;
      for (const st of journey(s.config, s.faults)) { if (at >= s.cursor - 0.001) break; if (st.ms > 0) prev = at; at += st.ms; }
      s.cursor = prev;
      return s;
    },
    restart(s) { s.cursor = 0; return s; },
    seek(s, ms) { s.cursor = Number(ms); return s; },
    answer(s, key) { s.answer = key as Toggle; return s; },
  },

  faults: [
    {
      id: "syn-loss",
      label: "Lose the first SYN",
      description: "One packet dropped on a congested link. TCP waits a full second before retrying the handshake.",
      apply: (s) => ({ ...s, faults: { ...s.faults, synLoss: true } }),
      revert: (s) => ({ ...s, faults: { ...s.faults, synLoss: false } }),
    },
    {
      id: "cache-down",
      label: "Cache cluster down",
      description: "Redis is unreachable, so every request falls through to the database.",
      apply: (s) => ({ ...s, faults: { ...s.faults, cacheDown: true } }),
      revert: (s) => ({ ...s, faults: { ...s.faults, cacheDown: false } }),
    },
  ],

  metrics(s) {
    const steps = journey(s.config, s.faults);
    const sum = (ids: string[]) => steps.filter((x) => ids.includes(x.id)).reduce((a, x) => a + x.ms, 0);
    return { ttfb: s.ttfb, page: s.page, dns: sum(["resolver", "root", "tld", "auth"]), connect: sum(["tcp", "tls"]), server: sum(["lb", "app", "cache", "db", "edge"]), network: sum(["send", "recv"]) };
  },
};
