import { describe, expect, it } from "vitest";
import { defaultProps } from "@/lib/studio/catalog";
import { absoluteRects } from "@/lib/studio/serialize";
import { StudioGraph, type StudioGraph as Graph } from "@/lib/studio/types";
import { addNode, align, connect, deleteIds, distribute, nudge, reparent, summaryText, updateEdge, updateNode } from "./ops";

const G: Graph = {
  version: 1,
  nodes: [
    { id: "f", kind: "frame", x: 100, y: 100, w: 600, h: 300, label: "Region", props: { scope: "region" } },
    { id: "a", kind: "service", x: 16, y: 48, label: "A", props: defaultProps("service"), parentId: "f" },
    { id: "b", kind: "cache", x: 800, y: 0, label: "B", props: defaultProps("cache") },
    { id: "c", kind: "queue", x: 1200, y: 160, label: "C", props: defaultProps("queue") },
  ],
  edges: [{ id: "e1", source: "a", target: "b", kind: "sync", direction: "forward" }],
};
const ok = (g: Graph) => expect(StudioGraph.safeParse(g).success).toBe(true);

describe("ops", () => {
  it("adds a node centred and snapped, inside the frame under it", () => {
    const { graph, id } = addNode(G, "worker", { x: 400, y: 300 }, () => "w1");
    const n = graph.nodes.find((x) => x.id === id)!;
    expect(n.parentId).toBe("f");
    expect(absoluteRects(graph.nodes).get(id)).toMatchObject({ x: 304, y: 256 });
    ok(graph);
    const again = addNode(graph, "worker", { x: 400, y: 300 }, () => "w2");
    const [r1, r2] = [absoluteRects(again.graph.nodes).get("w1")!, absoluteRects(again.graph.nodes).get("w2")!];
    expect(r2.x >= r1.x + r1.w || r2.x + r2.w <= r1.x || r2.y >= r1.y + r1.h || r2.y + r2.h <= r1.y).toBe(true);
  });

  it("reparents on drop and detaches when dragged out", () => {
    const inFrame = reparent({ ...G, nodes: G.nodes.map((n) => (n.id === "b" ? { ...n, x: 300, y: 200 } : n)) }, ["b"]);
    expect(inFrame.nodes.find((n) => n.id === "b")).toMatchObject({ parentId: "f", x: 200, y: 100 });
    const out = reparent({ ...G, nodes: G.nodes.map((n) => (n.id === "a" ? { ...n, x: 900 } : n)) }, ["a"]);
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(a.parentId).toBeUndefined();
    expect(a).toMatchObject({ x: 1000, y: 148 });
    ok(out);
  });

  it("deletes nodes with their edges and keeps a deleted frame's contents in place", () => {
    const g = deleteIds(G, ["f"]);
    expect(g.nodes.find((n) => n.id === "a")).toMatchObject({ x: 116, y: 148 });
    expect(g.nodes.find((n) => n.id === "a")?.parentId).toBeUndefined();
    expect(deleteIds(G, ["b"]).edges).toHaveLength(0);
    ok(g);
  });

  it("connects without self-loops or duplicates", () => {
    expect(connect(G, "a", "a")).toBeNull();
    expect(connect(G, "a", "b")).toBeNull();
    const r = connect(G, "b", "c", "replication", () => "e2")!;
    expect(r.graph.edges[1]).toEqual({ id: "e2", source: "b", target: "c", kind: "replication", direction: "both" });
  });

  it("updates props, labels and edges", () => {
    expect(updateNode(G, "a", { props: { instances: 9 } }).nodes[1].props).toMatchObject({ instances: 9, capacityQps: 500 });
    expect(updateEdge(G, "e1", { label: "GET", kind: "async" }).edges[0]).toMatchObject({ label: "GET", kind: "async" });
    expect(updateEdge(updateEdge(G, "e1", { label: "x" }), "e1", { label: "" }).edges[0].label).toBeUndefined();
  });

  it("nudges selected roots only", () => {
    const g = nudge(G, ["f", "a"], 10, -1);
    expect(g.nodes[0]).toMatchObject({ x: 110, y: 99 });
    expect(g.nodes[1]).toMatchObject({ x: 16, y: 48 }); // moves with its frame
  });

  it("aligns and distributes by absolute position", () => {
    const left = absoluteRects(align(G, ["a", "b", "c"], "left").nodes);
    expect([left.get("a")!.x, left.get("b")!.x, left.get("c")!.x]).toEqual([116, 116, 116]);
    const top = absoluteRects(align(G, ["b", "c"], "bottom").nodes);
    expect(top.get("b")!.y).toBe(160);
    const d = absoluteRects(distribute(G, ["a", "b", "c"], "horizontal").nodes);
    expect(d.get("b")!.x - (d.get("a")!.x + 192)).toBeCloseTo(d.get("c")!.x - (d.get("b")!.x + 192));
    expect(align(G, ["a"], "left")).toBe(G);
  });

  it("summarises", () => {
    expect(summaryText(G)).toBe("3 components, 1 connection, 1 frame");
  });
});
