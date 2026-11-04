import { describe, expect, it } from "vitest";
import { defaultProps } from "./catalog";
import { inlineVars, themeColors, toSvg } from "./export-svg";
import { EMPTY_GRAPH, type StudioGraph } from "./types";

const GRAPH: StudioGraph = {
  version: 1,
  nodes: [
    { id: "az", kind: "frame", x: 200, y: -40, w: 720, h: 200, label: "AZ us-east-1a <primary>", props: { scope: "az" } },
    { id: "web", kind: "client", x: 0, y: 0, label: "Browser & app", props: defaultProps("client") },
    { id: "api", kind: "service", x: 32, y: 40, label: "API", props: defaultProps("service"), parentId: "az" },
    { id: "db", kind: "sql-db", x: 400, y: 40, label: "Postgres", props: defaultProps("sql-db"), parentId: "az" },
    { id: "q", kind: "queue", x: 400, y: 260, label: "Jobs", props: defaultProps("queue") },
    { id: "n", kind: "note", x: 0, y: 260, w: 224, h: 96, label: "Note", props: { text: "# Reads\n- **95%** reads" } },
  ],
  edges: [
    { id: "e1", source: "web", target: "api", kind: "sync", direction: "forward", label: "GET /feed" },
    { id: "e2", source: "api", target: "db", kind: "replication", direction: "both" },
    { id: "e3", source: "api", target: "q", kind: "async", direction: "none" },
  ],
};

const parse = (s: string) => new DOMParser().parseFromString(s, "image/svg+xml");

describe("toSvg", () => {
  for (const theme of ["paper", "blueprint"] as const) {
    it(`is well-formed for an empty graph (${theme})`, () => {
      const doc = parse(toSvg(EMPTY_GRAPH, theme));
      expect(doc.querySelector("parsererror")).toBeNull();
      expect(doc.documentElement.tagName).toBe("svg");
      expect(doc.documentElement.textContent).toMatch(/EMPTY DESIGN/);
    });

    it(`draws a 3-tier graph with tokens inlined (${theme})`, () => {
      const svg = toSvg(GRAPH, theme, { title: "Feed" });
      const doc = parse(svg);
      expect(doc.querySelector("parsererror")).toBeNull();
      expect(svg).not.toMatch(/var\(--/);
      expect(svg).toContain(themeColors(theme).paper);
      expect(doc.querySelectorAll("g[data-kind=frame]")).toHaveLength(1);
      expect(doc.querySelectorAll("g[data-kind=note]")).toHaveLength(1);
      expect(doc.querySelectorAll("g[data-edge]")).toHaveLength(3);
      expect(doc.querySelector("g[data-edge=async] line")?.getAttribute("stroke-dasharray")).toBe("7 5");
      expect(doc.querySelectorAll("g[data-edge=replication] line")).toHaveLength(3);
      expect(doc.querySelector("g[data-edge=replication] line[marker-start]")).not.toBeNull();
      expect(doc.querySelector("g[data-edge=async] line[marker-end]")).toBeNull();
      expect(doc.documentElement.textContent).toContain("AZ US-EAST-1A <PRIMARY>");
      expect(doc.documentElement.textContent).toContain("GET /feed");
      expect(doc.documentElement.textContent).toContain("Instances 3");
      expect(doc.querySelector("title")?.textContent).toBe("Feed");
    });
  }

  it("fits the viewBox to the diagram plus margin", () => {
    const vb = parse(toSvg(GRAPH, "paper", { margin: 40 })).documentElement.getAttribute("viewBox")!.split(" ").map(Number);
    // nodes span x 0..920 (frame 200+720), y -40..356 (note 260+96); +28 caption strip
    expect(vb).toEqual([-40, -80, 1000, 476 + 28]);
  });

  it("inlines var() with and without fallbacks", () => {
    expect(inlineVars("fill:var(--ink);stroke:var(--nope, #123)", { ink: "#000" })).toBe("fill:#000;stroke:#123");
  });
});
