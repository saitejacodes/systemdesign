import { describe, expect, it } from "vitest";
import { deleteIds, nudge } from "@/components/studio/ops";
import { addArrow, arrowMid, arrowPath, moveArrowPart, snapAngle, updateArrow } from "./arrows";
import { toSvg } from "./export-svg";
import { copySelection, exportJson, fromFlow, importJson, pasteClip, toFlow } from "./serialize";
import { EMPTY_GRAPH, StudioGraph, type FreeArrow } from "./types";

const seq = () => { let i = 0; return (p: string) => `${p}-${++i}`; };
const A: FreeArrow = { id: "a-1", x1: 0, y1: 0, x2: 100, y2: 0 };

describe("free arrows", () => {
  it("adds a straight arrow on a drag, nothing on a click-sized one", () => {
    const r = addArrow(EMPTY_GRAPH, { x: 10.4, y: 20 }, { x: 200, y: 20.6 }, seq());
    expect(r?.graph.arrows).toEqual([{ id: "a-1", x1: 10, y1: 20, x2: 200, y2: 21 }]);
    expect(StudioGraph.safeParse(r!.graph).success).toBe(true);
    expect(addArrow(EMPTY_GRAPH, { x: 0, y: 0 }, { x: 3, y: 3 })).toBeNull();
  });

  it("curves through the dragged middle point and straightens near the midpoint", () => {
    const bent = moveArrowPart(A, "mid", { x: 50, y: 40 }, 0, 0);
    expect(arrowMid(bent)).toEqual({ x: 50, y: 40 });
    // control point = 2·mid − average of ends, so the curve passes through (50, 40) at t = 0.5
    expect(arrowPath(bent)).toBe("M0,0 Q50,80 100,0");
    expect(moveArrowPart(bent, "mid", { x: 52, y: 3 }, 0, 0).mx).toBeUndefined();
    expect(arrowPath(A)).toBe("M0,0 L100,0");
  });

  it("moves the body with its bend point, and an end alone", () => {
    const bent = { ...A, mx: 50, my: 40 };
    expect(moveArrowPart(bent, "body", { x: 0, y: 0 }, 5, 10)).toEqual({ id: "a-1", x1: 5, y1: 10, x2: 105, y2: 10, mx: 55, my: 50 });
    expect(moveArrowPart(A, "end", { x: 0, y: 90 }, 0, 0)).toMatchObject({ x1: 0, y1: 0, x2: 0, y2: 90 });
  });

  it("snaps to 15° steps", () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 4 });
    expect(p.x).toBeCloseTo(Math.hypot(100, 4));
    expect(p.y).toBeCloseTo(0);
  });

  it("is deleted, nudged, copied and pasted with the rest of the design", () => {
    const g: StudioGraph = { ...EMPTY_GRAPH, arrows: [A, { ...A, id: "a-2" }] };
    expect(deleteIds(g, ["a-1"]).arrows?.map((a) => a.id)).toEqual(["a-2"]);
    expect("arrows" in deleteIds(g, ["a-1", "a-2"])).toBe(false);
    expect(nudge(g, ["a-2"], 10, 0).arrows?.[1]).toMatchObject({ x1: 10, x2: 110 });
    const clip = copySelection(g, ["a-1"]);
    expect(clip?.arrows).toHaveLength(1);
    const pasted = pasteClip(g, clip!, { gen: seq() });
    expect(pasted.graph.arrows).toHaveLength(3);
    expect(pasted.graph.arrows?.[2]).toMatchObject({ x1: 32, y1: 32 });
    expect(StudioGraph.safeParse(pasted.graph).success).toBe(true);
  });

  it("survives the React Flow round trip, JSON export/import and the SVG export", () => {
    const g: StudioGraph = { ...EMPTY_GRAPH, arrows: [{ ...A, label: "retry", head: "both" }] };
    const f = toFlow(g);
    expect(fromFlow(f.nodes, f.edges, g.arrows)).toEqual(g);
    expect("arrows" in fromFlow(f.nodes, f.edges, [])).toBe(false);
    const back = importJson(exportJson({ title: "T", notes: "", graph: g }));
    expect(back.ok && back.design.graph.arrows?.[0]).toMatchObject({ label: "retry", x2: 100 });
    const svg = toSvg(g, "paper");
    expect(svg).toContain('data-arrow="free"');
    expect(svg).toContain("retry");
    expect(svg).not.toContain("EMPTY DESIGN");
  });

  it("drops an empty label and the default head", () => {
    const g = updateArrow({ ...EMPTY_GRAPH, arrows: [A] }, { ...A, label: "", head: "end", mx: undefined, my: undefined });
    expect(g.arrows?.[0]).toEqual(A);
  });

  it("rejects duplicate ids across nodes and arrows", () => {
    const bad = { ...EMPTY_GRAPH, nodes: [{ id: "x", kind: "note" as const, x: 0, y: 0, label: "", props: {} }], arrows: [{ ...A, id: "x" }] };
    expect(StudioGraph.safeParse(bad).success).toBe(false);
  });
});
