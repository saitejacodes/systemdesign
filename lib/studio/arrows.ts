import { randomId, type IdGen } from "./serialize";
import type { FreeArrow, StudioGraph } from "./types";

type Pt = { x: number; y: number };

/** Sets the graph's free arrows, dropping the key when there are none (so an empty list and no list compare equal). */
export function withArrows(graph: StudioGraph, arrows: FreeArrow[] | undefined): StudioGraph {
  const out: StudioGraph = { ...graph };
  if (arrows?.length) out.arrows = arrows; else delete out.arrows;
  return out;
}

/** The point the arrow passes through halfway: its bend point, or the middle of the straight line. */
export function arrowMid(a: FreeArrow): Pt {
  return a.mx !== undefined && a.my !== undefined ? { x: a.mx, y: a.my } : { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };
}

/** SVG path: a straight line, or a quadratic curve through the bend point (control = 2·mid − average of the ends). */
export function arrowPath(a: FreeArrow): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  if (a.mx === undefined || a.my === undefined) return `M${r(a.x1)},${r(a.y1)} L${r(a.x2)},${r(a.y2)}`;
  const cx = 2 * a.mx - (a.x1 + a.x2) / 2, cy = 2 * a.my - (a.y1 + a.y2) / 2;
  return `M${r(a.x1)},${r(a.y1)} Q${r(cx)},${r(cy)} ${r(a.x2)},${r(a.y2)}`;
}

/** Bounding box of the arrow's ends and bend point (the curve stays inside it). */
export function arrowBounds(a: FreeArrow) {
  const m = arrowMid(a);
  const x = Math.min(a.x1, a.x2, m.x), y = Math.min(a.y1, a.y2, m.y);
  return { x, y, w: Math.max(a.x1, a.x2, m.x) - x, h: Math.max(a.y1, a.y2, m.y) - y };
}

/** Snaps the end of a line to the nearest 15° from its start (Shift while drawing or dragging an end). */
export function snapAngle(from: Pt, to: Pt): Pt {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.PI / 12;
  const ang = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}

export type ArrowPart = "body" | "start" | "end" | "mid";

/**
 * The arrow after dragging one part: the body moves everything by (dx, dy); an end goes to `p`; the middle
 * becomes the bend point (dragged back near the straight midpoint, it straightens).
 */
export function moveArrowPart(a: FreeArrow, part: ArrowPart, p: Pt, dx: number, dy: number, snap = false): FreeArrow {
  const out: FreeArrow = { ...a };
  if (part === "body") {
    out.x1 += dx; out.y1 += dy; out.x2 += dx; out.y2 += dy;
    if (a.mx !== undefined && a.my !== undefined) { out.mx = a.mx + dx; out.my = a.my + dy; }
    return out;
  }
  if (part === "start") { const q = snap ? snapAngle({ x: a.x2, y: a.y2 }, p) : p; out.x1 = q.x; out.y1 = q.y; return out; }
  if (part === "end") { const q = snap ? snapAngle({ x: a.x1, y: a.y1 }, p) : p; out.x2 = q.x; out.y2 = q.y; return out; }
  const straight = { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };
  if (Math.hypot(p.x - straight.x, p.y - straight.y) < 6) { delete out.mx; delete out.my; } else { out.mx = p.x; out.my = p.y; }
  return out;
}

/** Adds a straight arrow from `from` to `to`; null when it is too short to be meant (a click, not a drag). */
export function addArrow(graph: StudioGraph, from: Pt, to: Pt, gen: IdGen = randomId): { graph: StudioGraph; id: string } | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 8) return null;
  if ((graph.arrows?.length ?? 0) >= 1000) return null;
  const taken = new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => e.id), ...(graph.arrows ?? []).map((a) => a.id)]);
  let id = gen("a");
  while (taken.has(id)) id = gen("a");
  const r = (v: number) => Math.round(v);
  return { graph: withArrows(graph, [...(graph.arrows ?? []), { id, x1: r(from.x), y1: r(from.y), x2: r(to.x), y2: r(to.y) }]), id };
}

/** Replaces one arrow (matched by id); an empty label is dropped. */
export function updateArrow(graph: StudioGraph, next: FreeArrow): StudioGraph {
  const clean: FreeArrow = { ...next };
  if (!clean.label) delete clean.label;
  if (clean.head === "end") delete clean.head;
  if (clean.mx === undefined || clean.my === undefined) { delete clean.mx; delete clean.my; }
  return withArrows(graph, (graph.arrows ?? []).map((a) => (a.id === next.id ? clean : a)));
}
