import { RunChallenge, TrafficProfile, type NodeStatus } from "@/lib/studio/sim/types";

/** Run data for one case study, read on the server from content/case-studies/<id>/meta.json. */
export interface CaseRun { title: string; trafficProfile: TrafficProfile; runChallenge: RunChallenge }
export type CaseRuns = Record<string, CaseRun>;

/** The traffic profile saved in Design.panels.run (a JSON string), or null when absent or invalid. */
export function savedProfile(panels: Record<string, string> | undefined): TrafficProfile | null {
  const raw = panels?.run;
  if (!raw) return null;
  try {
    const r = TrafficProfile.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Three challenges every design gets, whatever it came from. Checked headlessly with evaluateChallenge; the first one
 * runs at 10,000 QPS whatever the design's own traffic is (see GENERIC_QPS).
 */
export const GENERIC_CHALLENGES: RunChallenge[] = [
  {
    id: "serve-10k",
    title: "Serve 10k QPS with p99 under 200 ms",
    description: "Your request mix at 10,000 QPS for 60 s: at least 9,900 QPS answered successfully and every request type's p99 under 200 ms.",
    atPeak: false,
    durationS: 60,
    targets: { minOkQps: 9_900, maxP99Ms: 200 },
  },
  {
    id: "survive-az",
    title: "Survive losing an AZ with under 1% errors",
    description: "Your traffic for 40 s; at 10 s every component in the busiest availability-zone frame is killed. Errors at the end must stay under 1%.",
    atPeak: false,
    scenario: "lose-az",
    durationS: 40,
    targets: { maxErrorRatePct: 1 },
  },
  {
    id: "zero-spof",
    title: "Zero single points of failure",
    description: "No component whose loss cuts any client off from where a request type needs to go, unless it is internally redundant.",
    atPeak: false,
    durationS: 5,
    targets: { maxSpofs: 0 },
  },
];
export const GENERIC_QPS: Record<string, number> = { "serve-10k": 10_000 };

/** The profile a challenge is checked with. */
export const challengeProfile = (c: RunChallenge, profile: TrafficProfile, generic: boolean): TrafficProfile =>
  generic && GENERIC_QPS[c.id] ? { ...profile, qps: GENERIC_QPS[c.id] } : profile;

export const STATUS_TEXT: Record<NodeStatus, { glyph: string; word: string }> = {
  ok: { glyph: "●", word: "OK" },
  hot: { glyph: "▲", word: "HOT" },
  overloaded: { glyph: "■", word: "OVERLOADED" },
  down: { glyph: "✕", word: "DOWN" },
};

/** 1234 → "1.23k", 0.4 → "0.4". */
export function fmtQps(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  if (a >= 10 || a === 0) return Math.round(v).toString();
  return v.toFixed(1);
}
export function fmtMs(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 10_000) return `${(v / 1000).toFixed(1)} s`;
  return `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 0 : 1)} ms`;
}
export const fmtPct = (v: number, d = 2) => `${Number.isFinite(v) ? v.toFixed(d) : "—"}%`;
export const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
/** 99.95% → 3.3 nines. */
export const nines = (pct: number) => (pct >= 100 ? Infinity : -Math.log10(1 - pct / 100));
/** Expected downtime per year for an availability, in words. */
export function downtime(pct: number): string {
  const h = (1 - pct / 100) * 365.25 * 24;
  if (h <= 0) return "none";
  if (h >= 48) return `${(h / 24).toFixed(1)} days/year`;
  if (h >= 1) return `${h.toFixed(1)} h/year`;
  return `${Math.round(h * 60)} min/year`;
}

/** Edge stroke width and dash period for a QPS, on a log scale (1 QPS ≈ thin and slow, 1M QPS ≈ thick and fast). */
export function edgeFlowStyle(qps: number): { width: number; durS: number } {
  const l = Math.log10(1 + Math.max(0, qps)); // 0 … ~6
  return { width: Math.min(9, 1.5 + l * 1.15), durS: Math.max(0.35, 2.2 - l * 0.3) };
}
