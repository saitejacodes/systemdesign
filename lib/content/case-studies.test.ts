import { describe, expect, it, vi } from "vitest";
import { getAllSections, getCaseStudies } from "@/lib/content";
import { runDesign } from "@/lib/interview/compare";
import { STEPS } from "@/lib/interview/types";
import { templateById } from "@/lib/studio/templates";

vi.mock("server-only", () => ({}));

// Prompt 20 format: every real case study is complete, its sections are in order, and its reference design passes its run
// challenge in Run Mode. Fixture cases (tests/fixtures) are not loaded here.
const SECTIONS = [
  "Requirements", "Estimation", "API design", "Data model", "High-level design", "Deep dives",
  "Failure modes & mitigations", "Scaling to 10×", "Tradeoffs summary", "What interviewers look for",
];
/** Prose words: fenced code (Mermaid, JSON examples) is left out. 2,500–5,000 in the spec; DECISIONS.md allows up to 5,500. */
const proseWords = (mdx: string) => mdx.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;

/** Keys of CALLOUT in components/learn/boxes.tsx. */
const CALLOUT_TYPES = ["info", "warning", "tip", "example", "analogy"];

const cases = getCaseStudies();
const sectionIds = new Set(getAllSections().map((s) => s.meta.id));

describe("case studies", () => {
  it("exist", () => expect(cases.length).toBeGreaterThan(0));

  for (const c of cases) {
    describe(c.meta.id, () => {
      it("has every file, and a matching Design Studio template", () => {
        expect(c.rubric, "rubric.json").not.toBeNull();
        expect(c.design, "design.json").not.toBeNull();
        expect(templateById(c.meta.id), "practice template in lib/studio/templates.ts").toBeDefined();
      });

      it("links only to lessons that exist", () => {
        for (const id of c.meta.relatedSectionIds) expect(sectionIds.has(id), id).toBe(true);
      });

      it("solution has the 10 sections in order, a Mermaid diagram (fenced or <Diagram>) and one H3 per deep-dive question", () => {
        const h2 = [...c.solution.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
        expect(h2).toEqual(SECTIONS);
        const hld = c.solution.split(/^## /m).find((s) => s.startsWith("High-level design")) ?? "";
        expect(hld).toMatch(/```mermaid|<Diagram /);
        const dives = c.solution.split(/^## /m).find((s) => s.startsWith("Deep dives")) ?? "";
        expect([...dives.matchAll(/^### /gm)].length).toBeGreaterThanOrEqual(c.meta.deepDiveQuestions.length);
        const n = proseWords(c.solution);
        expect(n, `${n} prose words`).toBeGreaterThanOrEqual(2_500);
        expect(n, `${n} prose words`).toBeLessThanOrEqual(5_500);
      });

      it("uses only Callout types that exist (an unknown type crashes the page)", () => {
        for (const m of c.solution.matchAll(/<Callout[^>]*\btype="([^"]+)"/g)) expect(CALLOUT_TYPES, m[0]).toContain(m[1]);
      });

      it("rubric covers all 7 framework steps with unique ids", () => {
        const r = c.rubric!;
        expect(new Set(r.criteria.map((x) => x.step))).toEqual(new Set(STEPS));
        expect(new Set(r.criteria.map((x) => x.id)).size).toBe(r.criteria.length);
      });

      it("reference design passes its run challenge with no single point of failure", () => {
        const r = runDesign(c.design!, c.meta.trafficProfile, c.meta.runChallenge);
        expect(r.challenge.passed, JSON.stringify(r.challenge)).toBe(true);
        expect(r.peak.spofs).toBe(0);
      });
    });
  }
});
