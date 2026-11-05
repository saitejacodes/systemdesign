import { z } from "@/lib/zod";

/** Every component the palette offers, plus a text note. "frame" is the Region/AZ (or any labelled group) box. */
export const COMPONENT_KINDS = [
  "client", "dns", "cdn", "load-balancer", "api-gateway", "service", "cache", "sql-db", "nosql-db", "shard-group",
  "queue", "worker", "object-storage", "search-index", "vector-db", "llm-api", "monitoring", "external-api", "frame",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type NodeKind = ComponentKind | "note";

export const EDGE_KINDS = ["sync", "async", "replication"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export type PropValue = number | string | boolean;

const id = z.string().min(1).max(64);
const num = z.number().finite();

export const StudioNode = z.strictObject({
  id,
  kind: z.enum([...COMPONENT_KINDS, "note"]),
  x: num,
  y: num,
  /** Size, only for frames and notes (components have a fixed size). */
  w: num.positive().optional(),
  h: num.positive().optional(),
  label: z.string().max(120),
  /** Component properties keyed by the catalog's PropSpec.key; notes keep their markdown in props.text. */
  props: z.record(z.string(), z.union([num, z.string().max(20_000), z.boolean()])),
  /** A frame this node sits in (React Flow parentId); positions are then relative to the frame. */
  parentId: id.optional(),
});
export type StudioNode = z.infer<typeof StudioNode>;

export const StudioEdge = z.strictObject({
  id,
  source: id,
  target: id,
  kind: z.enum(EDGE_KINDS),
  label: z.string().max(120).optional(),
  /** Arrowheads: at the target, at both ends, or none. */
  direction: z.enum(["forward", "both", "none"]),
});
export type StudioEdge = z.infer<typeof StudioEdge>;

/**
 * A free-drawn arrow (Arrow tool, dragged on the canvas, as in Excalidraw): a drawing, not a connection, so the
 * traffic simulation ignores it. Absolute canvas coordinates; (mx, my) is a point the arrow bends through.
 */
export const FreeArrow = z.strictObject({
  id,
  x1: num,
  y1: num,
  x2: num,
  y2: num,
  mx: num.optional(),
  my: num.optional(),
  label: z.string().max(120).optional(),
  /** Arrowheads: at the end (default), at both ends, or none. */
  head: z.enum(["end", "both", "none"]).optional(),
});
export type FreeArrow = z.infer<typeof FreeArrow>;

/** The persisted design graph (Design.graph in IndexedDB, and the JSON export body). Bump version on breaking changes. */
export const StudioGraph = z
  .strictObject({
    version: z.literal(1),
    nodes: z.array(StudioNode).max(500),
    edges: z.array(StudioEdge).max(2000),
    /** Free-drawn arrows; absent when there are none (older designs have no key). */
    arrows: z.array(FreeArrow).max(1000).optional(),
  })
  .superRefine((g, ctx) => {
    const ids = new Set<string>();
    for (const n of g.nodes) {
      if (ids.has(n.id)) ctx.addIssue({ code: "custom", message: `duplicate node id ${n.id}` });
      ids.add(n.id);
    }
    for (const a of g.arrows ?? []) {
      if (ids.has(a.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${a.id}` });
      ids.add(a.id);
    }
    const frames = new Set(g.nodes.filter((n) => n.kind === "frame").map((n) => n.id));
    for (const n of g.nodes) if (n.parentId && !frames.has(n.parentId)) ctx.addIssue({ code: "custom", message: `node ${n.id}: parent ${n.parentId} is not a frame` });
    for (const e of g.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) ctx.addIssue({ code: "custom", message: `edge ${e.id}: unknown endpoint` });
    }
  });
export type StudioGraph = z.infer<typeof StudioGraph>;

export const EMPTY_GRAPH: StudioGraph = { version: 1, nodes: [], edges: [] };
