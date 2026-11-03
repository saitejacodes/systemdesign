import type { SimModel } from "@/lib/sim/engine";

/*
 * A reliability block diagram. Series: every block must work, A = Π aᵢ. Parallel (redundant copies):
 * any one is enough, A = 1 − Π(1 − aᵢ). Both assume failures are independent, which real systems
 * rarely are (shared zone, shared deploy); the lesson's "Where the formulas lie" covers that.
 */

export type Start = "lesson" | "tiers" | "practice" | "zones" | "blank";
export const STARTS: { value: Start; label: string }[] = [
  { value: "lesson", label: "Checkout path (LB 99.99, app 99.95, DB 99.9)" },
  { value: "tiers", label: "Three tiers at 99.9% each" },
  { value: "practice", label: "CDN → gateway → 2 services → DB" },
  { value: "zones", label: "Two servers in one zone" },
  { value: "blank", label: "One component" },
];
export const PRESET_PCTS = [99, 99.9, 99.95, 99.99];

export interface AvailConfig { start: Start }

export interface Comp { id: string; kind: "comp"; name: string; role: string; pct: number }
export interface Group { id: string; kind: "series" | "parallel"; children: string[] }
export type Block = Comp | Group;

export interface AvailState { blocks: Record<string, Block>; root: string; next: number; start: Start; sel: string | null; t: number }

export const MIN_YEAR = 525_600, MIN_MONTH = 43_200, MIN_WEEK = 10_080;

type Seed = [name: string, role: string, pct: number] | { p: Seed[] } | { s: Seed[] };
const STARTERS: Record<Start, Seed[]> = {
  lesson: [["Load balancer", "lb", 99.99], ["App server", "app", 99.95], ["Database", "db", 99.9]],
  tiers: [["Load balancer", "lb", 99.9], ["App server", "app", 99.9], ["Database", "db", 99.9]],
  practice: [["CDN", "cdn", 99.99], ["API gateway", "gw", 99.95], ["Service A", "svcA", 99.9], ["Service B", "svcB", 99.9], ["Database", "db", 99.95]],
  zones: [["Zone A", "az", 99.9], { p: [["Server 1", "server", 99.5], ["Server 2", "server", 99.5]] }],
  blank: [["Component", "other", 99.9]],
};

function build(start: Start): AvailState {
  const s: AvailState = { blocks: {}, root: "b0", next: 1, start, sel: null, t: 0 };
  const add = (seed: Seed): string => {
    const id = `b${s.next++}`;
    if (Array.isArray(seed)) s.blocks[id] = { id, kind: "comp", name: seed[0], role: seed[1], pct: seed[2] };
    else s.blocks[id] = { id, kind: "p" in seed ? "parallel" : "series", children: ("p" in seed ? seed.p : seed.s).map(add) };
    return id;
  };
  s.blocks.b0 = { id: "b0", kind: "series", children: STARTERS[start].map(add) };
  return s;
}

/** Availability of a block as a fraction; components with role `zero` count as always down. */
export function avail(s: AvailState, id: string, zero?: string): number {
  const b = s.blocks[id];
  if (b.kind === "comp") return b.role === zero ? 0 : b.pct / 100;
  const xs = b.children.map((c) => avail(s, c, zero));
  return b.kind === "series" ? xs.reduce((a, x) => a * x, 1) : 1 - xs.reduce((a, x) => a * (1 - x), 1);
}

export const total = (s: AvailState) => avail(s, s.root);
export const comps = (s: AvailState) => Object.values(s.blocks).filter((b): b is Comp => b.kind === "comp");
export const parentOf = (s: AvailState, id: string) => Object.values(s.blocks).find((b): b is Group => b.kind !== "comp" && b.children.includes(id));

/** The top-level series stages, each with the share of total unavailability it causes (≈ (1 − aᵢ) / Σ(1 − aⱼ) for small failure rates). */
export function stages(s: AvailState) {
  const root = s.blocks[s.root] as Group;
  const xs = root.children.map((id) => ({ id, a: avail(s, id) }));
  const sum = xs.reduce((m, x) => m + (1 - x.a), 0);
  return xs.map((x) => ({ ...x, share: sum ? (1 - x.a) / sum : 0 }));
}

/** The stage with the lowest availability: where redundancy buys the most. */
export function weakest(s: AvailState) {
  const xs = stages(s);
  return xs.length > 1 ? xs.reduce((m, x) => (x.a < m.a ? x : m)).id : null;
}

export const downtime = (a: number) => ({ year: (1 - a) * MIN_YEAR, month: (1 - a) * MIN_MONTH, week: (1 - a) * MIN_WEEK });

export function fmtPct(a: number) {
  if (a >= 1) return "100%";
  if (a <= 0) return "0%";
  const nines = -Math.log10(1 - a);
  return `${(a * 100).toFixed(Math.min(6, Math.max(1, Math.ceil(nines - 1e-9) - 1)))}%`;
}

export function fmtMin(m: number) {
  if (m >= 1440 * 2) return `${+(m / 1440).toPrecision(3)} days`;
  if (m >= 60) return `${+(m / 60).toPrecision(3)} h`;
  if (m >= 1) return `${+m.toPrecision(3)} min`;
  return `${+(m * 60).toPrecision(3)} s`;
}

/** The formula with numbers substituted, e.g. "0.999 × (1 − 0.001 × 0.001)". */
export function formula(s: AvailState, id = s.root): string {
  const b = s.blocks[id];
  if (b.kind === "comp") return `${+(b.pct / 100).toFixed(6)}`;
  if (b.children.length === 1) return formula(s, b.children[0]);
  if (b.kind === "series") return b.children.map((c) => { const f = formula(s, c); return s.blocks[c].kind === "parallel" ? `(${f})` : f; }).join(" × ");
  const miss = (c: string) => { const x = s.blocks[c]; return x.kind === "comp" ? `${+(1 - x.pct / 100).toFixed(6)}` : `(1 − ${+avail(s, c).toFixed(6)})`; };
  return `1 − ${b.children.map(miss).join(" × ")}`;
}

/** Flattens same-kind nesting, dissolves one-child groups and drops empty ones; the root stays a series. */
function normalize(s: AvailState) {
  const fix = (id: string): string | null => {
    const b = s.blocks[id];
    if (b.kind === "comp") return id;
    const kids: string[] = [];
    for (const c of b.children) {
      const k = fix(c);
      if (k === null) continue;
      const kb = s.blocks[k];
      if (kb.kind === b.kind) { kids.push(...kb.children); delete s.blocks[k]; } else kids.push(k);
    }
    b.children = kids;
    if (id === s.root) return id;
    if (!kids.length) { delete s.blocks[id]; return null; }
    if (kids.length === 1) { delete s.blocks[id]; return kids[0]; }
    return id;
  };
  fix(s.root);
  if (s.sel && !s.blocks[s.sel]) s.sel = null;
  return s;
}

function copy(s: AvailState, id: string): string {
  const b = s.blocks[id];
  const nid = `b${s.next++}`;
  s.blocks[nid] = b.kind === "comp" ? { ...b, id: nid } : { ...b, id: nid, children: b.children.map((c) => copy(s, c)) };
  return nid;
}

/** Puts `id` inside a new group of `kind` together with `extra`, in the same slot. */
function wrap(s: AvailState, id: string, kind: Group["kind"], extra: string) {
  const p = parentOf(s, id);
  if (!p) return;
  const gid = `b${s.next++}`;
  s.blocks[gid] = { id: gid, kind, children: [id, extra] };
  p.children = p.children.map((c) => (c === id ? gid : c));
}

/** True if `id` is `anc` or sits anywhere inside it. */
export const within = (s: AvailState, id: string, anc: string): boolean => id === anc || (s.blocks[anc].kind !== "comp" && (s.blocks[anc] as Group).children.some((c) => within(s, id, c)));

const edit = (st: AvailState, f: (s: AvailState) => void) => { const s = structuredClone(st); f(s); return normalize(s); };

export const availModel: SimModel<AvailConfig, AvailState> = {
  init: (c) => build(c.start),
  tick(s, ctx) {
    if (ctx.config.start !== s.start) { ctx.log("info", `Loaded: ${STARTS.find((x) => x.value === ctx.config.start)?.label}`); return { ...build(ctx.config.start), t: ctx.t }; }
    s.t = ctx.t;
    return s;
  },
  actions: {
    select: (st, id) => ({ ...st, sel: typeof id === "string" && st.blocks[id] ? id : null }),
    /** payload: { id, pct?, name? } */
    set: (st, p) => edit(st, (s) => {
      const { id, pct, name } = p as { id: string; pct?: number; name?: string };
      const b = s.blocks[id];
      if (b?.kind !== "comp") return;
      if (pct !== undefined && Number.isFinite(pct)) b.pct = Math.min(99.99999, Math.max(0, pct));
      if (name !== undefined) b.name = name.slice(0, 40);
    }),
    /** A redundant copy: joins the parallel group around `id`, or makes one. */
    parallel: (st, id) => edit(st, (s) => {
      const k = String(id);
      if (!s.blocks[k] || k === s.root) return;
      const p = parentOf(s, k)!;
      const c = copy(s, k);
      if (p.kind === "parallel") p.children.splice(p.children.indexOf(k) + 1, 0, c); else wrap(s, k, "parallel", c);
      s.sel = c;
    }),
    /** A new component right after `id` in series (a new series group if `id` sits in a parallel group). */
    series: (st, id) => edit(st, (s) => {
      const k = String(id);
      if (!s.blocks[k]) return;
      const nid = `b${s.next++}`;
      s.blocks[nid] = { id: nid, kind: "comp", name: `Component ${s.next - 1}`, role: "other", pct: 99.9 };
      if (k === s.root) { (s.blocks[k] as Group).children.push(nid); s.sel = nid; return; }
      const p = parentOf(s, k)!;
      if (p.kind === "series") p.children.splice(p.children.indexOf(k) + 1, 0, nid); else wrap(s, k, "series", nid);
      s.sel = nid;
    }),
    remove: (st, id) => edit(st, (s) => {
      const k = String(id);
      if (!s.blocks[k] || k === s.root || comps(s).every((c) => within(s, c.id, k))) return; // keep at least one component
      const p = parentOf(s, k)!;
      p.children = p.children.filter((c) => c !== k);
      for (const b of Object.keys(s.blocks).filter((b) => within(s, b, k))) delete s.blocks[b];
    }),
    /** payload: { id, to }. Drag-and-drop or "Move into": `to` is a group (joins it) or a component (wraps both in parallel). */
    move: (st, p) => edit(st, (s) => {
      const { id, to } = p as { id: string; to: string };
      if (!s.blocks[id] || !s.blocks[to] || id === s.root || within(s, to, id)) return;
      const from = parentOf(s, id)!;
      from.children = from.children.filter((c) => c !== id);
      const t = s.blocks[to];
      if (t.kind === "comp") wrap(s, to, "parallel", id); else t.children.push(id);
    }),
  },
  faults: [],
  metrics(s) {
    const a = total(s), d = downtime(a);
    return { pct: a * 100, nines: a >= 1 ? 9 : -Math.log10(1 - a), downYear: d.year, downMonth: d.month, downWeek: d.week, components: comps(s).length };
  },
};
