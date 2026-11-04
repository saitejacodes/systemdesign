import { describe, expect, it } from "vitest";
import { defaultProps } from "./catalog";
import { absoluteRects, copySelection, edgeLine, exportJson, fromFlow, importJson, keyProps, pasteClip, remapIds, toFlow, type IdGen } from "./serialize";
import { StudioGraph, type StudioGraph as Graph } from "./types";

const seq = (): IdGen => { let i = 0; return (p) => `${p}${++i}`; };

const THREE_TIER: Graph = {
  version: 1,
  nodes: [
    { id: "region", kind: "frame", x: 0, y: 0, w: 800, h: 400, label: "Region us-east-1", props: { scope: "region" } },
    { id: "client", kind: "client", x: -320, y: 160, label: "Users", props: defaultProps("client") },
    { id: "lb", kind: "load-balancer", x: 32, y: 160, label: "LB", props: defaultProps("load-balancer"), parentId: "region" },
    { id: "api", kind: "service", x: 288, y: 160, label: "API", props: defaultProps("service"), parentId: "region" },
    { id: "db", kind: "sql-db", x: 544, y: 160, label: "Postgres", props: defaultProps("sql-db"), parentId: "region" },
    { id: "note", kind: "note", x: -320, y: 320, w: 224, h: 128, label: "Note", props: { text: "## Why\nReads dominate." } },
  ],
  edges: [
    { id: "e1", source: "client", target: "lb", kind: "sync", direction: "forward", label: "HTTPS" },
    { id: "e2", source: "lb", target: "api", kind: "sync", direction: "forward" },
    { id: "e3", source: "api", target: "db", kind: "sync", direction: "both", label: "SQL" },
  ],
};

describe("graph ⇄ React Flow", () => {
  it("round-trips a graph unchanged", () => {
    const { nodes, edges } = toFlow(THREE_TIER);
    expect(fromFlow(nodes, edges)).toEqual(THREE_TIER);
    expect(StudioGraph.safeParse(fromFlow(nodes, edges)).success).toBe(true);
  });

  it("puts parents before children and maps types", () => {
    const g: Graph = { ...THREE_TIER, nodes: [THREE_TIER.nodes[2], ...THREE_TIER.nodes.filter((n) => n.id !== "lb")] };
    const { nodes } = toFlow(g, new Set(["api"]));
    expect(nodes.findIndex((n) => n.id === "region")).toBeLessThan(nodes.findIndex((n) => n.id === "lb"));
    expect(nodes.find((n) => n.id === "region")?.type).toBe("frame");
    expect(nodes.find((n) => n.id === "note")?.type).toBe("note");
    expect(nodes.find((n) => n.id === "api")).toMatchObject({ type: "component", selected: true, parentId: "region" });
  });

  it("computes absolute positions through frames", () => {
    const rects = absoluteRects([{ ...THREE_TIER.nodes[0], x: 100, y: 50 }, THREE_TIER.nodes[2]]);
    expect(rects.get("lb")).toEqual({ x: 132, y: 210, w: 192, h: 80 });
  });

  it("clips edges to the node borders", () => {
    const l = edgeLine({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 });
    expect(l).toEqual({ x1: 100, y1: 25, x2: 300, y2: 25 });
  });

  it("summarises key properties with units", () => {
    expect(keyProps("service", defaultProps("service"))).toEqual(["Instances 3", "Capacity 500 QPS"]);
    expect(keyProps("cdn", defaultProps("cdn"))).toEqual(["Hit rate 90%", "Latency 20 ms"]);
    expect(keyProps("client", defaultProps("client"))).toEqual(["Platform web", "Users 1M"]);
  });
});

describe("ids", () => {
  it("remaps every id and keeps references consistent", () => {
    const { graph, map } = remapIds(THREE_TIER, seq());
    expect(graph.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4", "n5", "n6"]);
    expect(graph.nodes.find((n) => n.id === map.get("api"))?.parentId).toBe(map.get("region"));
    expect(graph.edges[2]).toMatchObject({ id: "e9", source: map.get("api"), target: map.get("db") });
    expect(StudioGraph.safeParse(graph).success).toBe(true);
  });

  it("never reuses a taken id", () => {
    const gen: IdGen = (() => { const out = ["n-a", "n-a", "n-b"]; let i = 0; return () => out[i++] ?? `x${i}`; })();
    const { graph } = remapIds({ version: 1, nodes: [THREE_TIER.nodes[1], THREE_TIER.nodes[5]], edges: [] }, gen, new Set(["n-a"]));
    expect(graph.nodes.map((n) => n.id)).toEqual(["n-b", "x4"]);
  });
});

describe("copy / paste", () => {
  it("copies selected nodes, their frame contents and the edges between them", () => {
    const clip = copySelection(THREE_TIER, ["region"])!;
    expect(clip.nodes.map((n) => n.id)).toEqual(["region", "lb", "api", "db"]);
    expect(clip.edges.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("detaches a copied child from an uncopied frame using its absolute position", () => {
    const g: Graph = { ...THREE_TIER, nodes: THREE_TIER.nodes.map((n) => (n.id === "region" ? { ...n, x: 100, y: 100 } : n)) };
    const clip = copySelection(g, ["api", "db"])!;
    expect(clip.nodes[0]).toMatchObject({ id: "api", x: 388, y: 260 });
    expect(clip.nodes[0].parentId).toBeUndefined();
    expect(clip.edges.map((e) => e.id)).toEqual(["e3"]);
  });

  it("pastes with fresh ids, offset, and returns the new selection", () => {
    const clip = copySelection(THREE_TIER, ["client", "region"])!;
    const { graph, ids } = pasteClip(THREE_TIER, clip, { gen: seq(), offset: 32 });
    expect(graph.nodes).toHaveLength(11);
    expect(graph.edges).toHaveLength(6);
    expect(ids).toHaveLength(8);
    const pastedClient = graph.nodes.find((n) => ids.includes(n.id) && n.kind === "client")!;
    expect(pastedClient).toMatchObject({ x: -288, y: 192 });
    const pastedLb = graph.nodes.find((n) => ids.includes(n.id) && n.kind === "load-balancer")!;
    expect(pastedLb.x).toBe(32); // relative to its pasted frame, so not offset
    expect(ids).toContain(pastedLb.parentId);
    expect(StudioGraph.safeParse(graph).success).toBe(true);
  });

  it("returns null for an empty selection", () => {
    expect(copySelection(THREE_TIER, [])).toBeNull();
  });
});

describe("JSON export / import", () => {
  it("exports title, notes, graph, version and time, and imports it back with new ids", () => {
    const text = exportJson({ title: "Three tier", notes: "## Requirements", graph: THREE_TIER, caseStudyId: "url-shortener" }, new Date("2026-01-02T03:04:05Z"));
    const json = JSON.parse(text);
    expect(json).toMatchObject({ version: 1, exportedAt: "2026-01-02T03:04:05.000Z", title: "Three tier", notes: "## Requirements", caseStudyId: "url-shortener" });
    const r = importJson(text, seq());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.title).toBe("Three tier");
    expect(r.design.graph.nodes).toHaveLength(6);
    expect(r.design.graph.nodes[0].id).toBe("n1");
    const strip = (n: Graph["nodes"][number]) => ({ kind: n.kind, x: n.x, y: n.y, w: n.w, h: n.h, label: n.label, props: n.props, framed: !!n.parentId });
    expect(r.design.graph.nodes.map(strip)).toEqual(THREE_TIER.nodes.map(strip));
  });

  it("accepts a bare graph", () => {
    const r = importJson(JSON.stringify(THREE_TIER));
    expect(r.ok && r.design.title).toBe("Imported design");
  });

  it("reports readable errors with paths", () => {
    expect(importJson("{nope")).toMatchObject({ ok: false, errors: [expect.stringMatching(/^file: not valid JSON/)] });
    expect(importJson("[]")).toMatchObject({ ok: false });
    const bad = JSON.parse(exportJson({ title: "x", notes: "", graph: THREE_TIER }));
    bad.graph.nodes[1].x = "left";
    bad.graph.nodes[2].kind = "mainframe";
    bad.graph.edges[0].target = "ghost";
    const r = importJson(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.startsWith("graph.nodes.1.x:"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("graph.nodes.2.kind:"))).toBe(true);
    const dup = JSON.parse(exportJson({ title: "x", notes: "", graph: THREE_TIER }));
    dup.graph.nodes[1].id = "lb";
    const r2 = importJson(JSON.stringify(dup));
    expect(r2.ok === false && r2.errors.join(" ")).toMatch(/duplicate node id lb/);
    const r3 = importJson(JSON.stringify({ version: 1, graph: THREE_TIER }));
    expect(r3.ok === false && r3.errors[0]).toMatch(/^title:/);
  });
});
