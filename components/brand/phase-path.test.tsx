import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CASE_STUDY_COUNT, PHASES } from "@/lib/curriculum";
import { PhasePath } from "./index";

describe("PhasePath", () => {
  it("shows the current section, simulator and case study counts", () => {
    const html = renderToStaticMarkup(<PhasePath />);
    for (const p of PHASES) {
      const tail = p.n === 7 ? `${CASE_STUDY_COUNT} case studies` : `${p.simulators} simulators`;
      expect(html).toContain(`${p.sections} sections · ${tail}`);
      expect(html).toContain(`${p.sections} SECTIONS · ${tail.toUpperCase()}`);
    }
  });
});
