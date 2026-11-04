import { CATALOG, defaultProps } from "@/lib/studio/catalog";
import { absoluteRects, DEFAULT_SIZE, nodeSize, parentsFirst, randomId, type IdGen, type Rect } from "@/lib/studio/serialize";
import type { EdgeKind, NodeKind, PropValue, StudioEdge, StudioGraph, StudioNode } from "@/lib/studio/types";

// Pure editing operations on a StudioGraph. Each returns a new graph; the editor commits it to history.

export const GRID = 16;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export const defaultLabel = (kind: NodeKind) => (kind === "note" ? "Note" : kind === "frame" ? "Region us-east-1" : CATALOG[kind].title);

function descendants(graph: StudioGraph, id: string): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) { grew = false; for (const n of graph.nodes) if (n.parentId && (n.parentId === id || out.has(n.parentId)) && !out.has(n.id)) { out.add(n.id); grew = true; } }
  return out;
}

/** The smallest frame whose box contains point p, skipping `exclude`. */
function frameAt(graph: StudioGraph, rects: Map<string, Rect>, p: { x: number; y: number }, exclude: Set<string>): string | undefined {
  let best: string | undefined, area = Infinity;
  for (const n of graph.nodes) {
    if (n.kind !== "frame" || exclude.has(n.id)) continue;
    const r = rects.get(n.id)!;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h && r.w * r.h < area) { best = n.id; area = r.w * r.h; }
  }
  return best;
}

/** After nodes move, put each one in the frame under its centre (or none), converting positions to stay put on screen. */
export function reparent(graph: StudioGraph, ids: Iterable<string>): StudioGraph {
  const moved = new Set(ids);
  if (!moved.size) return graph;
  const rects = absoluteRects(graph.nodes);
  let changed = false;
  const nodes = graph.nodes.map((n) => {
    if (!moved.has(n.id)) return n;
    const r = rects.get(n.id)!;
    const exclude = new Set([n.id, ...descendants(graph, n.id)]);
    const parent = frameAt(graph, rects, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, exclude);
    if (parent === n.parentId) return n;
    changed = true;
    const out: StudioNode = { ...n };
    if (parent) { const p = rects.get(parent)!; out.parentId = parent; out.x = r.x - p.x; out.y = r.y - p.y; }
    else { delete out.parentId; out.x = r.x; out.y = r.y; }
    return out;
  });
  if (!changed) return graph;
  // A frame that just got a parent must come after it (React Flow order).
  return { ...graph, nodes: parentsFirst(nodes) };
}

/** A new node centred on `at` (canvas coordinates), nudged off any node already sitting exactly there. */
export function addNode(graph: StudioGraph, kind: NodeKind, at: { x: number; y: number }, gen: IdGen = randomId): { graph: StudioGraph; id: string } {
  const taken = new Set(graph.nodes.map((n) => n.id));
  let id = gen("n");
  while (taken.has(id)) id = gen("n");
  const size = kind === "frame" || kind === "note" ? DEFAULT_SIZE[kind] : nodeSize({ kind });
  const x0 = snap(at.x - size.w / 2), y0 = snap(at.y - size.h / 2);
  // Nearest free spot on a coarse grid around the target, so repeated adds don't pile up (frames don't count as obstacles).
  const rects = absoluteRects(graph.nodes);
  const others = graph.nodes.filter((n) => n.kind !== "frame" || kind === "frame").map((n) => rects.get(n.id)!);
  const free = (x: number, y: number) => !others.some((r) => x < r.x + r.w + GRID && x + size.w + GRID > r.x && y < r.y + r.h + GRID && y + size.h + GRID > r.y);
  const sx = snap(size.w + 2 * GRID), sy = snap(size.h + 2 * GRID);
  const spots: [number, number][] = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) spots.push([x0 + i * sx, y0 + j * sy]);
  spots.sort((a, b) => Math.hypot(a[0] - x0, (a[1] - y0) * 1.5) - Math.hypot(b[0] - x0, (b[1] - y0) * 1.5));
  const [x, y] = spots.find(([sx2, sy2]) => free(sx2, sy2)) ?? [x0 + 2 * GRID, y0 + 2 * GRID];
  const node: StudioNode = { id, kind, x, y, label: defaultLabel(kind), props: kind === "note" ? { text: "" } : defaultProps(kind) };
  if (kind === "frame" || kind === "note") { node.w = size.w; node.h = size.h; }
  const g = { ...graph, nodes: [...graph.nodes, node] };
  return { graph: kind === "frame" ? g : reparent(g, [id]), id };
}

/** Removes nodes and edges. A deleted frame's contents stay, at the same place on the canvas. */
export function deleteIds(graph: StudioGraph, ids: Iterable<string>): StudioGraph {
  const del = new Set(ids);
  if (!del.size) return graph;
  const rects = absoluteRects(graph.nodes);
  const nodes = graph.nodes.filter((n) => !del.has(n.id)).map((n) => {
    if (!n.parentId || !del.has(n.parentId)) return n;
    // climb to the nearest surviving frame
    let p: string | undefined = n.parentId;
    while (p && del.has(p)) p = graph.nodes.find((x) => x.id === p)?.parentId;
    const r = rects.get(n.id)!;
    const out: StudioNode = { ...n };
    if (p) { const pr = rects.get(p)!; out.parentId = p; out.x = r.x - pr.x; out.y = r.y - pr.y; }
    else { delete out.parentId; out.x = r.x; out.y = r.y; }
    return out;
  });
  const keep = new Set(nodes.map((n) => n.id));
  return { ...graph, nodes, edges: graph.edges.filter((e) => !del.has(e.id) && keep.has(e.source) && keep.has(e.target)) };
}

export function updateNode(graph: StudioGraph, id: string, patch: { label?: string; props?: Record<string, PropValue>; w?: number; h?: number }): StudioGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch, props: patch.props ? { ...n.props, ...patch.props } : n.props } : n)) };
}

export function updateEdge(graph: StudioGraph, id: string, patch: Partial<Pick<StudioEdge, "kind" | "label" | "direction">>): StudioGraph {
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (e.id !== id) return e;
      const out: StudioEdge = { ...e, ...patch };
      if (out.label === undefined || out.label === "") delete out.label;
      return out;
    }),
  };
}

/** A new connection, or null when it would be a self-loop or a duplicate of one already there. */
export function connect(graph: StudioGraph, source: string, target: string, kind: EdgeKind = "sync", gen: IdGen = randomId): { graph: StudioGraph; id: string } | null {
  if (source === target) return null;
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (!ids.has(source) || !ids.has(target)) return null;
  if (graph.edges.some((e) => e.source === source && e.target === target && e.kind === kind)) return null;
  const taken = new Set(graph.edges.map((e) => e.id));
  let id = gen("e");
  while (taken.has(id)) id = gen("e");
  return { graph: { ...graph, edges: [...graph.edges, { id, source, target, kind, direction: kind === "replication" ? "both" : "forward" }] }, id };
}

/** Selected nodes that move on their own: a node inside a selected frame moves with the frame. */
function roots(graph: StudioGraph, ids: Iterable<string>): StudioNode[] {
  const sel = new Set(ids);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hasSelectedAncestor = (n: StudioNode) => { let p = n.parentId; for (let i = 0; p && i < 32; i++) { if (sel.has(p)) return true; p = byId.get(p)?.parentId; } return false; };
  return graph.nodes.filter((n) => sel.has(n.id) && !hasSelectedAncestor(n));
}

export function nudge(graph: StudioGraph, ids: Iterable<string>, dx: number, dy: number): StudioGraph {
  const move = new Set(roots(graph, ids).map((n) => n.id));
  if (!move.size) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (move.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) };
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Moves nodes to new absolute top-left corners, keeping their frames. */
function placeAbs(graph: StudioGraph, abs: Map<string, { x: number; y: number }>): StudioGraph {
  const rects = absoluteRects(graph.nodes);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = abs.get(n.id);
      if (!p) return n;
      const pr = n.parentId ? rects.get(n.parentId) : undefined;
      return { ...n, x: p.x - (pr?.x ?? 0), y: p.y - (pr?.y ?? 0) };
    }),
  };
}

export function align(graph: StudioGraph, ids: Iterable<string>, mode: AlignMode): StudioGraph {
  const list = roots(graph, ids);
  if (list.length < 2) return graph;
  const rects = absoluteRects(graph.nodes);
  const rs = list.map((n) => ({ id: n.id, r: rects.get(n.id)! }));
  const minX = Math.min(...rs.map((x) => x.r.x)), maxX = Math.max(...rs.map((x) => x.r.x + x.r.w));
  const minY = Math.min(...rs.map((x) => x.r.y)), maxY = Math.max(...rs.map((x) => x.r.y + x.r.h));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const abs = new Map(rs.map(({ id, r }) => {
    const p = { x: r.x, y: r.y };
    if (mode === "left") p.x = minX; else if (mode === "right") p.x = maxX - r.w; else if (mode === "center") p.x = cx - r.w / 2;
    else if (mode === "top") p.y = minY; else if (mode === "bottom") p.y = maxY - r.h; else p.y = cy - r.h / 2;
    return [id, { x: Math.round(p.x), y: Math.round(p.y) }];
  }));
  return placeAbs(graph, abs);
}

/** Equal gaps between 3+ nodes along an axis; the two outermost stay where they are. */
export function distribute(graph: StudioGraph, ids: Iterable<string>, axis: "horizontal" | "vertical"): StudioGraph {
  const list = roots(graph, ids);
  if (list.length < 3) return graph;
  const rects = absoluteRects(graph.nodes);
  const h = axis === "horizontal";
  const rs = list.map((n) => ({ id: n.id, r: rects.get(n.id)! })).sort((a, b) => (h ? a.r.x + a.r.w / 2 - (b.r.x + b.r.w / 2) : a.r.y + a.r.h / 2 - (b.r.y + b.r.h / 2)));
  const start = h ? rs[0].r.x : rs[0].r.y;
  const last = rs[rs.length - 1].r;
  const end = h ? last.x + last.w : last.y + last.h;
  const total = rs.reduce((s, x) => s + (h ? x.r.w : x.r.h), 0);
  const gap = (end - start - total) / (rs.length - 1);
  let at = start;
  const abs = new Map<string, { x: number; y: number }>();
  for (const { id, r } of rs) {
    abs.set(id, h ? { x: Math.round(at), y: r.y } : { x: r.x, y: Math.round(at) });
    at += (h ? r.w : r.h) + gap;
  }
  return placeAbs(graph, abs);
}

export function counts(graph: StudioGraph) {
  let components = 0, frames = 0, notes = 0;
  for (const n of graph.nodes) { if (n.kind === "frame") frames++; else if (n.kind === "note") notes++; else components++; }
  return { components, frames, notes, connections: graph.edges.length };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "12 components, 14 connections" (plus frames and notes when there are any). */
export function summaryText(graph: StudioGraph): string {
  const c = counts(graph);
  const parts = [plural(c.components, "component"), plural(c.connections, "connection")];
  if (c.frames) parts.push(plural(c.frames, "frame"));
  if (c.notes) parts.push(plural(c.notes, "note"));
  return parts.join(", ");
}

export const sameGraph = (a: StudioGraph, b: StudioGraph) => a === b || JSON.stringify(a) === JSON.stringify(b);
