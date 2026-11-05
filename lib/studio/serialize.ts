import type { Edge, Node } from "@xyflow/react";
import { z as zod } from "@/lib/zod";
import { CATALOG } from "./catalog";
import { StudioGraph, type EdgeKind, type FreeArrow, type NodeKind, type PropValue, type StudioEdge, type StudioNode } from "./types";

// ---------- Sizes and geometry (shared by the canvas and the SVG export) ----------

/** Component cards have a fixed size so layout, alignment and export never need DOM measurement. */
export const COMPONENT_SIZE = { w: 192, h: 80 } as const;
export const DEFAULT_SIZE = { frame: { w: 480, h: 320 }, note: { w: 224, h: 128 } } as const;
export const MIN_SIZE = { frame: { w: 160, h: 96 }, note: { w: 128, h: 64 } } as const;

export interface Rect { x: number; y: number; w: number; h: number }

export function nodeSize(n: Pick<StudioNode, "kind" | "w" | "h">): { w: number; h: number } {
  if (n.kind === "frame" || n.kind === "note") return { w: n.w ?? DEFAULT_SIZE[n.kind].w, h: n.h ?? DEFAULT_SIZE[n.kind].h };
  return COMPONENT_SIZE;
}

/** Absolute canvas rectangle of every node (frame positions are summed down the parent chain). */
export function absoluteRects(nodes: StudioNode[]): Map<string, Rect> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Rect>();
  const abs = (n: StudioNode, depth = 0): { x: number; y: number } => {
    const p = n.parentId && depth < 32 ? byId.get(n.parentId) : undefined;
    if (!p) return { x: n.x, y: n.y };
    const pp = abs(p, depth + 1);
    return { x: pp.x + n.x, y: pp.y + n.y };
  };
  for (const n of nodes) out.set(n.id, { ...abs(n), ...nodeSize(n) });
  return out;
}

export function boundsOf(rects: Iterable<Rect>): Rect | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
  return Number.isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

/** Where the line from a rectangle's centre towards a point leaves the rectangle. */
export function borderPoint(r: Rect, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** A straight connector between two boxes, clipped to their borders ("floating" edges: no stored handle ids). */
export function edgeLine(a: Rect, b: Rect) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p = borderPoint(a, cb), q = borderPoint(b, ca);
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

// ---------- Display helpers ----------

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`;
  return `${+v.toFixed(2)}`;
};
const shortLabel = (l: string) => l.replace(/ per (instance|node|shard)$/, "");

/** One or two "key properties" for the node card and the export, e.g. ["Instances 3", "Capacity 500 QPS"]. */
export function keyProps(kind: NodeKind, props: Record<string, PropValue>, max = 2): string[] {
  if (kind === "note" || kind === "frame") return [];
  const out: string[] = [];
  for (const spec of CATALOG[kind].props) {
    if (out.length >= max) break;
    if (spec.type === "text") continue;
    const v = props[spec.key] ?? spec.default;
    if (spec.type === "boolean") { out.push(v ? spec.label : `Not ${spec.label.toLowerCase()}`); continue; }
    const value = typeof v === "number" ? compact(v) : String(v);
    out.push(`${shortLabel(spec.label)} ${value}${spec.unit ? (spec.unit === "%" ? "%" : ` ${spec.unit}`) : ""}`);
  }
  return out;
}

// ---------- Graph ⇄ React Flow ----------

export interface StudioNodeData extends Record<string, unknown> { kind: NodeKind; label: string; props: Record<string, PropValue> }
export type FlowNodeType = "component" | "frame" | "note";
export type FlowNode = Node<StudioNodeData, FlowNodeType>;
export interface StudioEdgeData extends Record<string, unknown> { kind: EdgeKind; direction: StudioEdge["direction"]; label?: string }
export type FlowEdge = Edge<StudioEdgeData, "studio">;

const flowType = (k: NodeKind): FlowNodeType => (k === "frame" ? "frame" : k === "note" ? "note" : "component");

/** React Flow needs every parent before its children. Stable: an order that already satisfies this is kept as is. */
export function parentsFirst(nodes: StudioNode[]): StudioNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: StudioNode[] = [];
  const placed = new Set<string>();
  let pending = nodes;
  while (pending.length) {
    const next: StudioNode[] = [];
    for (const n of pending) {
      if (!n.parentId || !ids.has(n.parentId) || placed.has(n.parentId)) { out.push(n); placed.add(n.id); } else next.push(n);
    }
    if (next.length === pending.length) { out.push(...next); break; } // a parent cycle: give up rather than loop
    pending = next;
  }
  return out;
}

const kindTitle = (k: NodeKind) => (k === "note" ? "Note" : CATALOG[k].title);
const EDGE_WORD: Record<EdgeKind, string> = { sync: "Sync request", async: "Async message", replication: "Replication" };

export function toFlow(graph: StudioGraph, selected: ReadonlySet<string> = new Set()): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const labels = new Map(graph.nodes.map((n) => [n.id, n.label || kindTitle(n.kind)]));
  const nodes = parentsFirst(graph.nodes).map((n): FlowNode => {
    const node: FlowNode = { id: n.id, type: flowType(n.kind), position: { x: n.x, y: n.y }, data: { kind: n.kind, label: n.label, props: n.props }, ariaLabel: `${kindTitle(n.kind)}: ${n.label || "unnamed"}` };
    if (n.parentId) node.parentId = n.parentId;
    if (n.kind === "frame" || n.kind === "note") { const s = nodeSize(n); node.width = s.w; node.height = s.h; }
    if (n.kind === "frame") node.zIndex = -1;
    if (selected.has(n.id)) node.selected = true;
    return node;
  });
  const edges = graph.edges.map((e): FlowEdge => {
    const data: StudioEdgeData = { kind: e.kind, direction: e.direction };
    if (e.label !== undefined) data.label = e.label;
    const edge: FlowEdge = { id: e.id, source: e.source, target: e.target, type: "studio", data, ariaLabel: `${EDGE_WORD[e.kind]} from ${labels.get(e.source)} to ${labels.get(e.target)}${e.label ? `: ${e.label}` : ""}` };
    if (selected.has(e.id)) edge.selected = true;
    return edge;
  });
  return { nodes, edges };
}

/** The graph from React Flow's state; free arrows aren't React Flow elements, so they are passed through. */
export function fromFlow(nodes: FlowNode[], edges: FlowEdge[], arrows?: FreeArrow[]): StudioGraph {
  return {
    version: 1,
    nodes: nodes.map((f): StudioNode => {
      const n: StudioNode = { id: f.id, kind: f.data.kind, x: f.position.x, y: f.position.y, label: f.data.label, props: f.data.props };
      if (f.data.kind === "frame" || f.data.kind === "note") {
        const w = f.width ?? f.measured?.width, h = f.height ?? f.measured?.height;
        if (w) n.w = w;
        if (h) n.h = h;
      }
      if (f.parentId) n.parentId = f.parentId;
      return n;
    }),
    edges: edges.map((f): StudioEdge => {
      const d = f.data ?? { kind: "sync", direction: "forward" };
      const e: StudioEdge = { id: f.id, source: f.source, target: f.target, kind: d.kind, direction: d.direction };
      if (d.label !== undefined) e.label = d.label;
      return e;
    }),
    ...(arrows?.length ? { arrows } : {}),
  };
}

// ---------- Ids ----------

export type IdGen = (prefix: string) => string;
export const randomId: IdGen = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Fresh ids for every node, edge and free arrow; parentId, source and target follow. */
export function remapIds(graph: StudioGraph, gen: IdGen = randomId, taken: ReadonlySet<string> = new Set()): { graph: StudioGraph; map: Map<string, string> } {
  const used = new Set(taken);
  const fresh = (p: string) => { let id = gen(p); while (used.has(id)) id = gen(p); used.add(id); return id; };
  const map = new Map<string, string>();
  for (const n of graph.nodes) map.set(n.id, fresh("n"));
  for (const e of graph.edges) map.set(e.id, fresh("e"));
  for (const a of graph.arrows ?? []) map.set(a.id, fresh("a"));
  return {
    map,
    graph: {
      version: 1,
      nodes: graph.nodes.map((n) => ({ ...n, id: map.get(n.id)!, ...(n.parentId ? { parentId: map.get(n.parentId) ?? n.parentId } : {}) })),
      edges: graph.edges.map((e) => ({ ...e, id: map.get(e.id)!, source: map.get(e.source) ?? e.source, target: map.get(e.target) ?? e.target })),
      ...(graph.arrows?.length ? { arrows: graph.arrows.map((a) => ({ ...a, id: map.get(a.id)! })) } : {}),
    },
  };
}

// ---------- Copy / paste / duplicate ----------

export interface Clip { nodes: StudioNode[]; edges: StudioEdge[]; arrows?: FreeArrow[] }

/** Selected nodes (plus everything inside selected frames), the edges between them, and selected free arrows. Nodes whose frame isn't copied get absolute positions. */
export function copySelection(graph: StudioGraph, ids: Iterable<string>): Clip | null {
  const want = new Set(ids);
  let grew = true;
  while (grew) { grew = false; for (const n of graph.nodes) if (n.parentId && want.has(n.parentId) && !want.has(n.id)) { want.add(n.id); grew = true; } }
  const rects = absoluteRects(graph.nodes);
  const nodes = parentsFirst(graph.nodes).filter((n) => want.has(n.id)).map((n): StudioNode => {
    if (!n.parentId || want.has(n.parentId)) return n;
    const r = rects.get(n.id)!;
    const copy: StudioNode = { ...n, x: r.x, y: r.y };
    delete copy.parentId;
    return copy;
  });
  const arrows = (graph.arrows ?? []).filter((a) => want.has(a.id));
  if (!nodes.length && !arrows.length) return null;
  const keep = new Set(nodes.map((n) => n.id));
  const clip: Clip = { nodes, edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  if (arrows.length) clip.arrows = arrows;
  return clip;
}

/** Adds a clip with fresh ids, top-level nodes shifted by `offset`. Returns the new graph and the pasted ids (to select them). */
export function pasteClip(graph: StudioGraph, clip: Clip, opts: { offset?: number; gen?: IdGen } = {}): { graph: StudioGraph; ids: string[] } {
  const offset = opts.offset ?? 32;
  const clipArrows = clip.arrows ?? [];
  if (graph.nodes.length + clip.nodes.length > 500 || graph.edges.length + clip.edges.length > 2000 || (graph.arrows?.length ?? 0) + clipArrows.length > 1000) return { graph, ids: [] };
  const taken = new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => e.id), ...(graph.arrows ?? []).map((a) => a.id)]);
  const { graph: g } = remapIds({ version: 1, nodes: clip.nodes, edges: clip.edges, ...(clipArrows.length ? { arrows: clipArrows } : {}) }, opts.gen, taken);
  const nodes = g.nodes.map((n) => (n.parentId ? n : { ...n, x: n.x + offset, y: n.y + offset }));
  const pasted = (g.arrows ?? []).map((a): FreeArrow => ({ ...a, x1: a.x1 + offset, y1: a.y1 + offset, x2: a.x2 + offset, y2: a.y2 + offset, ...(a.mx !== undefined && a.my !== undefined ? { mx: a.mx + offset, my: a.my + offset } : {}) }));
  const arrows = [...(graph.arrows ?? []), ...pasted];
  return {
    graph: { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...g.edges], ...(arrows.length ? { arrows } : {}) },
    ids: [...nodes.map((n) => n.id), ...g.edges.map((e) => e.id), ...pasted.map((a) => a.id)],
  };
}

// ---------- JSON export / import ----------

export const EXPORT_FORMAT = "sysdesign-lab/studio-design";

export interface PortableDesign { title: string; caseStudyId?: string; notes: string; graph: StudioGraph }

export function exportJson(design: PortableDesign, now = new Date()): string {
  const body: Record<string, unknown> = { format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), title: design.title };
  if (design.caseStudyId) body.caseStudyId = design.caseStudyId;
  body.notes = design.notes;
  body.graph = design.graph;
  return JSON.stringify(body, null, 2);
}

const Envelope = zod.object({
  format: zod.literal(EXPORT_FORMAT).optional(),
  version: zod.literal(1),
  exportedAt: zod.string().optional(),
  title: zod.string().trim().min(1).max(200),
  caseStudyId: zod.string().max(100).optional(),
  notes: zod.string().max(200_000).default(""),
  graph: StudioGraph,
});

export type ImportResult = { ok: true; design: PortableDesign } | { ok: false; errors: string[] };

const describe = (issues: zod.ZodError["issues"]) =>
  issues.slice(0, 8).map((i) => `${i.path.length ? i.path.join(".") : "file"}: ${i.message}`).concat(issues.length > 8 ? [`…and ${issues.length - 8} more problems`] : []);

/** Parses a Design Studio JSON export (or a bare graph). Errors name the path of each problem. Ids are remapped. */
export function importJson(text: string, gen: IdGen = randomId): ImportResult {
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { return { ok: false, errors: [`file: not valid JSON (${(e as Error).message})`] }; }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, errors: ["file: expected a JSON object with title and graph"] };
  const obj = json as Record<string, unknown>;
  const candidate = "graph" in obj ? obj : "nodes" in obj && "edges" in obj ? { version: 1, title: "Imported design", graph: obj } : obj;
  const r = Envelope.safeParse(candidate);
  if (!r.success) return { ok: false, errors: describe(r.error.issues) };
  const d = r.data;
  const design: PortableDesign = { title: d.title, notes: d.notes, graph: remapIds(d.graph, gen).graph };
  if (d.caseStudyId) design.caseStudyId = d.caseStudyId;
  return { ok: true, design };
}
