import { describe, expect, it } from "vitest";
import { FRAMEWORK_HEADINGS, notesTemplate } from "./notes";
import { templateById, TEMPLATES } from "./templates";
import { StudioGraph } from "./types";

const CASE_IDS = [
  "url-shortener", "rate-limiter-service", "notification-system", "typeahead", "video-streaming", "ride-sharing", "news-feed",
  "chat-app", "payment-system", "job-scheduler", "metrics-monitoring", "web-crawler", "file-sync", "ticket-booking",
  "rag-docs-assistant", "api-gateway", "search-engine", "instagram", "food-delivery",
];

describe("studio templates", () => {
  it("has unique template ids and one template per case study", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const caseIds = TEMPLATES.flatMap((t) => (t.caseStudyId ? [t.caseStudyId] : []));
    expect([...caseIds].sort()).toEqual([...CASE_IDS].sort());
    for (const t of TEMPLATES) if (t.caseStudyId) expect(t.id).toBe(t.caseStudyId);
    expect(templateById("three-tier-web-app")?.caseStudyId).toBeUndefined();
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s: graph is valid and edges connect existing nodes", (_, t) => {
    expect(() => StudioGraph.parse(t.graph)).not.toThrow();
    const nodeIds = new Set(t.graph.nodes.map((n) => n.id));
    for (const e of t.graph.edges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
    expect(new Set(t.graph.edges.map((e) => e.id)).size).toBe(t.graph.edges.length);
    for (const n of t.graph.nodes) {
      expect(n.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(n.x % 16).toBe(0);
      expect(n.y % 16).toBe(0);
    }
    expect(t.graph.nodes.some((n) => n.kind === "client" && typeof n.props.users === "number")).toBe(true);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s: notes contain each framework heading exactly once", (_, t) => {
    expect(t.notesIntro).not.toMatch(/^#/m);
    const notes = notesTemplate(t.notesIntro);
    for (const h of FRAMEWORK_HEADINGS) expect(notes.split("\n").filter((l) => l === `## ${h}`)).toHaveLength(1);
    expect(t.summary).not.toContain("\n");
  });

  it("frames precede their children so parents exist before use", () => {
    for (const t of TEMPLATES) {
      const seen = new Set<string>();
      for (const n of t.graph.nodes) {
        if (n.parentId) expect(seen.has(n.parentId)).toBe(true);
        seen.add(n.id);
      }
    }
  });

  it("case-study templates hold only givens, not a solution", () => {
    const givenKinds = new Set(["client", "external-api", "llm-api", "object-storage"]);
    for (const t of TEMPLATES.filter((x) => x.caseStudyId)) for (const n of t.graph.nodes) expect(givenKinds.has(n.kind)).toBe(true);
  });

  it("templateById returns undefined for unknown ids", () => {
    expect(templateById("nope")).toBeUndefined();
    expect(templateById("chat-app")?.title).toBe("Chat app");
  });
});
