import type { SimModel } from "@/lib/sim/engine";

export interface EstConfig {
  /** Daily active users, in millions. */
  dauM: number;
  peakFactor: number;
  retentionYears: number;
  replication: number;
  /** Target cache hit rate, %. */
  cacheHit: number;
  qpsPerServer: number;
  /** Share of a day's read traffic worth keeping in cache, %. */
  hotPct: number;
}

export interface Row { name: string; count: number; kind: "read" | "write"; bytes: number }

export const MAX_ROWS = 4;
const DAY = 86_400;

export interface Output { key: string; label: string; value: number; unit: "qps" | "bytes" | "bytes/s" | "ratio" | "servers"; formula: string }

const n = (v: number) => (v >= 1e12 ? `${+(v / 1e12).toPrecision(3)}T` : v >= 1e9 ? `${+(v / 1e9).toPrecision(3)}B` : v >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : v >= 1e3 ? `${+(v / 1e3).toPrecision(3)}K` : `${+v.toPrecision(3)}`);
export const fmtBytes = (b: number) => {
  const u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let i = 0;
  while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
  return `${+b.toPrecision(3)} ${u[i]}`;
};
export const fmt = (o: Pick<Output, "value" | "unit">) =>
  o.unit === "bytes" ? fmtBytes(o.value) : o.unit === "bytes/s" ? `${fmtBytes(o.value)}/s` : o.unit === "ratio" ? `${+o.value.toPrecision(3)} : 1` : o.unit === "servers" ? `${o.value}` : `${n(o.value)}/s`;

/** Every output with its formula written out with the numbers substituted. Pure: the calculator is this function. */
export function estimate(c: EstConfig, rows: Row[]) {
  const dau = c.dauM * 1e6;
  const per = rows.map((r) => ({ ...r, avg: (dau * r.count) / DAY }));
  const reads = per.filter((r) => r.kind === "read"), writes = per.filter((r) => r.kind === "write");
  const sum = (xs: typeof per, f: (r: (typeof per)[number]) => number) => xs.reduce((a, r) => a + f(r), 0);
  const avg = sum(per, (r) => r.avg), peak = avg * c.peakFactor;
  const readQps = sum(reads, (r) => r.avg), writeQps = sum(writes, (r) => r.avg);
  const day = sum(writes, (r) => dau * r.count * r.bytes);
  const year = day * 365, totalStore = year * c.retentionYears * c.replication;
  const ingress = sum(writes, (r) => r.avg * r.bytes), egress = sum(reads, (r) => r.avg * r.bytes);
  const servers = Math.max(1, Math.ceil(peak / c.qpsPerServer));
  const dbReads = readQps * c.peakFactor * (1 - c.cacheHit / 100);
  const cache = egress * DAY * (c.hotPct / 100);
  const outs: Output[] = [
    ...per.map((r): Output => ({ key: `avg-${r.name}`, label: `${r.name} · avg`, value: r.avg, unit: "qps", formula: `${n(dau)} users × ${r.count}/day ÷ 86,400 s = ${n(r.avg)}/s` })),
    { key: "avg", label: "Total · average QPS", value: avg, unit: "qps", formula: `${per.map((r) => n(r.avg)).join(" + ") || "0"} = ${n(avg)}/s` },
    { key: "peak", label: "Total · peak QPS", value: peak, unit: "qps", formula: `${n(avg)}/s × peak factor ${c.peakFactor} = ${n(peak)}/s` },
    { key: "ratio", label: "Read : write", value: writeQps ? readQps / writeQps : 0, unit: "ratio", formula: writeQps ? `${n(readQps)} ÷ ${n(writeQps)} = ${+(readQps / writeQps).toPrecision(3)} : 1` : "No writes" },
    { key: "day", label: "New storage per day", value: day, unit: "bytes", formula: writes.map((r) => `${n(dau)} × ${r.count} × ${fmtBytes(r.bytes)}`).join(" + ") + ` = ${fmtBytes(day)}` },
    { key: "year", label: "New storage per year", value: year, unit: "bytes", formula: `${fmtBytes(day)} × 365 = ${fmtBytes(year)}` },
    { key: "total", label: "Total stored", value: totalStore, unit: "bytes", formula: `${fmtBytes(year)} × ${c.retentionYears} years × ${c.replication} copies = ${fmtBytes(totalStore)}` },
    { key: "ingress", label: "Ingress (avg)", value: ingress, unit: "bytes/s", formula: `Σ write QPS × size = ${fmtBytes(ingress)}/s (× ${c.peakFactor} at peak = ${fmtBytes(ingress * c.peakFactor)}/s)` },
    { key: "egress", label: "Egress (avg)", value: egress, unit: "bytes/s", formula: `Σ read QPS × size = ${fmtBytes(egress)}/s (× ${c.peakFactor} at peak = ${fmtBytes(egress * c.peakFactor)}/s)` },
    { key: "servers", label: "App servers", value: servers, unit: "servers", formula: `⌈${n(peak)}/s ÷ ${n(c.qpsPerServer)}/s per server⌉ = ${servers}` },
    { key: "dbReads", label: "DB reads at peak (after cache)", value: dbReads, unit: "qps", formula: `${n(readQps)}/s × ${c.peakFactor} × (1 − ${c.cacheHit}%) = ${n(dbReads)}/s` },
    { key: "cache", label: "Cache for the hot set", value: cache, unit: "bytes", formula: `${fmtBytes(egress)}/s × 86,400 s × ${c.hotPct}% = ${fmtBytes(cache)}` },
  ];
  return { outs, peak, year, avg };
}

export interface Drill { id: string; name: string; story: string; config: Pick<EstConfig, "dauM" | "peakFactor">; rows: Row[]; reasoning: string }

// Illustrative assumptions for practice, not real company figures.
export const DRILLS: Drill[] = [
  { id: "twitter", name: "Twitter-like feed", story: "200M DAU. Each user posts 2 short posts a day (≈300 B with metadata) and loads the timeline 20 times.", config: { dauM: 200, peakFactor: 3 }, rows: [{ name: "post", count: 2, kind: "write", bytes: 300 }, { name: "timeline", count: 20, kind: "read", bytes: 10_000 }], reasoning: "Reads dominate 10 : 1. Text is tiny, so storage stays modest; media would live in object storage separately." },
  { id: "instagram", name: "Instagram-like photos", story: "500M DAU. 1 in 10 users uploads a photo a day (≈2 MB after compression); everyone views 50 feed items.", config: { dauM: 500, peakFactor: 2 }, rows: [{ name: "upload", count: 0.1, kind: "write", bytes: 2_000_000 }, { name: "view", count: 50, kind: "read", bytes: 200_000 }], reasoning: "Uploads are rare but heavy: 50M × 2 MB = 100 TB a day. That's why photos go to object storage behind a CDN." },
  { id: "whatsapp", name: "WhatsApp-like chat", story: "1B DAU sending 40 messages a day (≈100 B each); each message is delivered (read) once.", config: { dauM: 1000, peakFactor: 2 }, rows: [{ name: "send", count: 40, kind: "write", bytes: 100 }, { name: "deliver", count: 40, kind: "read", bytes: 100 }], reasoning: "A 1 : 1 read/write ratio is unusual and makes writes the hard part. 40B messages a day ≈ 460K/s average." },
  { id: "youtube", name: "YouTube-like video", story: "1B DAU. 1 in 2,000 users uploads a video a day (≈500 MB stored across renditions); everyone starts 5 videos.", config: { dauM: 1000, peakFactor: 2 }, rows: [{ name: "upload", count: 0.0005, kind: "write", bytes: 500_000_000 }, { name: "play", count: 5, kind: "read", bytes: 50_000_000 }], reasoning: "Only 500K uploads a day, but 250 TB of new storage. Playback egress is enormous, which is what CDNs exist for." },
  { id: "uber", name: "Uber-like rides", story: "20M DAU. Each active user sends a location ping every 4 s for 1 hour (900 pings, ≈100 B) and books 1 ride (≈1 KB).", config: { dauM: 20, peakFactor: 3 }, rows: [{ name: "ping", count: 900, kind: "write", bytes: 100 }, { name: "ride", count: 1, kind: "write", bytes: 1_000 }], reasoning: "Location pings dominate QPS (≈208K/s average). Most systems keep them briefly in memory instead of storing them all." },
  { id: "dropbox", name: "Dropbox-like files", story: "100M DAU. Each user saves 2 files a day (≈500 KB) and downloads 5.", config: { dauM: 100, peakFactor: 2 }, rows: [{ name: "save", count: 2, kind: "write", bytes: 500_000 }, { name: "download", count: 5, kind: "read", bytes: 500_000 }], reasoning: "100 TB a day before deduplication. Real file stores chunk and dedupe, which changes this number a lot." },
  { id: "shortener", name: "URL shortener", story: "10M DAU. 1 in 10 users shortens a link a day (≈500 B record); each user follows 10 short links.", config: { dauM: 10, peakFactor: 5 }, rows: [{ name: "create", count: 0.1, kind: "write", bytes: 500 }, { name: "redirect", count: 10, kind: "read", bytes: 500 }], reasoning: "A 100 : 1 read-heavy system with tiny storage (≈180 GB a year): a cache in front of the store handles almost everything." },
  { id: "docs", name: "Google Docs-like editing", story: "50M DAU. Each user makes 200 small edits a day (≈200 B operations) and opens 10 documents (≈100 KB).", config: { dauM: 50, peakFactor: 3 }, rows: [{ name: "edit", count: 200, kind: "write", bytes: 200 }, { name: "open", count: 10, kind: "read", bytes: 100_000 }], reasoning: "Edits are frequent and small; the write path must be fast and ordered, so operations are batched and periodically snapshotted." },
  { id: "netflix", name: "Netflix-like streaming", story: "200M DAU starting 2 titles a day, logging 20 viewing events (≈200 B) each day.", config: { dauM: 200, peakFactor: 3 }, rows: [{ name: "play", count: 2, kind: "read", bytes: 1_000_000_000 }, { name: "event", count: 20, kind: "write", bytes: 200 }], reasoning: "User data is small; the bytes are video, served from CDN caches inside ISPs. Peak is evening, hence the high peak factor." },
  { id: "slack", name: "Slack-like messaging", story: "30M DAU. Each user sends 50 messages a day (≈500 B) and reads 200.", config: { dauM: 30, peakFactor: 4 }, rows: [{ name: "send", count: 50, kind: "write", bytes: 500 }, { name: "read", count: 200, kind: "read", bytes: 500 }], reasoning: "Work hours concentrate traffic, so peak factor is high. Storage grows ≈270 TB a year and is kept forever for search." },
];

/** Accept an estimate within ±50% of the model answer: order-of-magnitude thinking, not precision. */
export const close = (guess: number, answer: number) => answer > 0 && guess > 0 && Math.abs(guess / answer - 1) <= 0.5;

/** Parses "300k", "2.5M", "1e6" or "1,200". */
export function parseNum(s: string) {
  const m = s.trim().replace(/,/g, "").match(/^([\d.]+(?:e[+-]?\d+)?)\s*([kmbt])?$/i);
  if (!m) return NaN;
  return Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? "").toLowerCase() as "k"] ?? 1);
}

export interface DrillResult { passed: boolean; ms: number; qps: number; tb: number; opening: number }
export interface EstState { rows: Row[]; t: number; drill: number | null; drillStart: number; results: Record<string, DrillResult>; opening: number; passedThisRun: number; fastest: number }

export const DEFAULT_ROWS: Row[] = DRILLS[0].rows;

export const drillAnswer = (d: Drill, base: EstConfig) => estimate({ ...base, ...d.config }, d.rows);

export const estModel: SimModel<EstConfig, EstState> = {
  init() { return { rows: DEFAULT_ROWS.map((r) => ({ ...r })), t: 0, drill: null, drillStart: 0, results: {}, opening: 0, passedThisRun: 0, fastest: Infinity }; },
  tick(s, ctx) { s.t = ctx.t; return s; },
  actions: {
    row(s, p) {
      const { i, patch } = p as { i: number; patch: Partial<Row> };
      s.rows = s.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
      return s;
    },
    addRow(s) { if (s.rows.length < MAX_ROWS) s.rows = [...s.rows, { name: `action ${s.rows.length + 1}`, count: 1, kind: "read", bytes: 1_000 }]; return s; },
    removeRow(s, i) { if (s.rows.length > 1) s.rows = s.rows.filter((_, j) => j !== Number(i)); return s; },
    openDrill(s, i) { s.drill = i === null ? null : Number(i); s.drillStart = s.t; s.opening++; return s; },
    /** payload: the learner's peak QPS and new storage per year in TB, plus the config the model answer uses. */
    submit(s, p) {
      const { qps, tb, config } = p as { qps: number; tb: number; config: EstConfig };
      if (s.drill === null) return s;
      const d = DRILLS[s.drill];
      const a = drillAnswer(d, config);
      const passed = close(qps, a.peak) && close(tb * 1e12, a.year);
      const ms = s.t - s.drillStart;
      s.results = { ...s.results, [d.id]: { passed, ms, qps, tb, opening: s.opening } };
      if (passed) { s.passedThisRun++; s.fastest = Math.min(s.fastest, ms); }
      return s;
    },
  },
  faults: [],
  metrics(s, _r, t) {
    return { passed: Object.values(s.results).filter((r) => r.passed).length, tried: Object.keys(s.results).length, drillSec: s.drill === null ? 0 : (t - s.drillStart) / 1000 };
  },
};
