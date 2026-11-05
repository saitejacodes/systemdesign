import { describe, expect, it, vi } from "vitest";
import { getAllSections, getCaseStudies } from "@/lib/content";
import { REGISTRY } from "@/lib/simulators/registry";
import { CASE_STUDY_COUNT, PHASES } from "./curriculum";

vi.mock("server-only", () => ({}));

describe("PHASES counts", () => {
  it("match the sections in content and the simulators in the registry", () => {
    const sections = getAllSections();
    for (const p of PHASES) {
      expect(p.sections, `phase ${p.n} sections`).toBe(sections.filter((s) => s.meta.phase === p.n).length);
      expect(p.simulators, `phase ${p.n} simulators`).toBe(REGISTRY.filter((s) => s.phase === p.n).length);
    }
    expect(CASE_STUDY_COUNT).toBe(getCaseStudies().filter((c) => !c.meta.id.startsWith("fixture-")).length);
  });
});
